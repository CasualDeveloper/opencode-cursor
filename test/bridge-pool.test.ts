import { describe, expect, test } from "bun:test";
import http2 from "node:http2";
import type { AddressInfo } from "node:net";
import { BridgePool, type BridgeHandle } from "../src/bridge-pool";

async function createServer() {
  let streamCount = 0;
  const sessions = new Set<http2.ServerHttp2Session>();
  const held = new Set<http2.ServerHttp2Stream>();
  const server = http2.createServer();
  server.on("session", (session) => {
    sessions.add(session);
    session.once("close", () => sessions.delete(session));
  });
  server.on("stream", (stream, headers) => {
    streamCount += 1;
    stream.respond({ ":status": 200, "content-type": "application/connect+proto" });
    if (headers[":path"] === "/hold") {
      held.add(stream);
      stream.once("close", () => held.delete(stream));
      return;
    }
    stream.end(Buffer.from(`response-${streamCount}`));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    streamCount: () => streamCount,
    releaseHeld() {
      for (const stream of held) stream.end();
    },
    async close() {
      for (const stream of held) stream.destroy();
      for (const session of sessions) session.destroy();
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
    },
  };
}

function complete(handle: BridgeHandle): Promise<{ code: number; data: string }> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    handle.onData((chunk) => chunks.push(chunk));
    handle.onClose((code) => {
      resolve({ code, data: Buffer.concat(chunks).toString("utf8") });
    });
    handle.end();
  });
}

describe("BridgePool", () => {
  test("reuses a pooled worker across sequential requests", async () => {
    const server = await createServer();
    const pool = new BridgePool({ minSize: 0, maxSize: 1 });
    try {
      const first = await complete(pool.acquire({
        accessToken: "token",
        rpcPath: "/run",
        url: server.url,
      }));
      const second = await complete(pool.acquire({
        accessToken: "token",
        rpcPath: "/run",
        url: server.url,
      }));

      expect(first.code).toBe(0);
      expect(second.code).toBe(0);
      expect(server.streamCount()).toBe(2);
      expect(pool.stats()).toEqual({ idle: 1, active: 0, total: 1, maxSize: 1 });
    } finally {
      pool.shutdown();
      await server.close();
    }
  });

  test("rejects new work instead of spawning an overflow worker", async () => {
    const server = await createServer();
    const pool = new BridgePool({ minSize: 0, maxSize: 1 });
    try {
      const active = pool.acquire({
        accessToken: "token",
        rpcPath: "/hold",
        url: server.url,
      });
      active.onData(() => {});
      active.onClose(() => {});
      active.end();

      expect(() => pool.acquire({
        accessToken: "token",
        rpcPath: "/run",
        url: server.url,
      })).toThrow("capacity reached");
      expect(pool.stats()).toEqual({ idle: 0, active: 1, total: 1, maxSize: 1 });
    } finally {
      server.releaseHeld();
      pool.shutdown();
      await server.close();
    }
  });

  test("notifies an active reader when its handle is killed", async () => {
    const server = await createServer();
    const pool = new BridgePool({ minSize: 0, maxSize: 1 });
    try {
      const active = pool.acquire({
        accessToken: "token",
        rpcPath: "/hold",
        url: server.url,
      });
      active.onData(() => {});
      const closed = new Promise<number>((resolve) => active.onClose(resolve));

      active.kill();

      expect(await closed).toBe(1);
      expect(active.alive).toBe(false);
    } finally {
      pool.shutdown();
      await server.close();
    }
  });
});
