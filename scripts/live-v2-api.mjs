const baseURL =
  process.env.OPENCODE_V2_URL ?? "http://127.0.0.1:49569";
const password = process.env.OPENCODE_SERVER_PASSWORD;
if (!password) {
  throw new Error("OPENCODE_SERVER_PASSWORD is required");
}
const authorization = `Basic ${Buffer.from(
  `opencode:${password}`,
).toString("base64")}`;
const [action, value] = process.argv.slice(2);
const RED_BLUE_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAGQAAAAyCAIAAAAlV+npAAAAdUlEQVR4nO3QsQkAMAzAsPz/dHtBZrcg8G7QnJkHq/9L9R8WLFj5HxYsWPkfFixY+R8WLFj5HxYsWPkfFixY+R8WLFj5HxYsWPkfFixY+R8WLFj5HxYsWPkfFixY+R8WLFj5HxYsWPkfFixY+R8WLFj5/yesC0oidZalOi4tAAAAAElFTkSuQmCC";

switch (action) {
  case "oauth-start":
    print(
      await request("/api/integration/cursor/connect/oauth", {
        method: "POST",
        body: JSON.stringify({ methodID: "browser" }),
      }),
    );
    break;
  case "oauth-status":
    if (!value) throw new Error("attempt ID is required");
    print(
      await request(
        `/api/integration/cursor/connect/oauth/${encodeURIComponent(value)}`,
      ),
    );
    break;
  case "plugins":
    print(await request("/api/plugin"));
    break;
  case "integrations":
    print(await request("/api/integration"));
    break;
  case "providers":
    print(await request("/api/provider"));
    break;
  case "models":
    print(await request("/api/model"));
    break;
  case "cursor-state": {
    const [integrations, providers, models] = await Promise.all([
      request("/api/integration"),
      request("/api/provider"),
      request("/api/model"),
    ]);
    const integration = integrations.data?.find(
      (item) => item.id === "cursor",
    );
    const provider = providers.data?.find(
      (item) => item.id === "cursor",
    );
    const cursorModels = (models.data ?? []).filter(
      (item) => item.providerID === "cursor",
    );
    print({
      connected: (integration?.connections?.length ?? 0) > 0,
      provider: provider
        ? {
            id: provider.id,
            package: provider.package,
            activation: provider.activation,
          }
        : undefined,
      modelCount: cursorModels.length,
      models: cursorModels.slice(0, 12).map((item) => ({
        id: item.id,
        name: item.name,
        variants: item.variants?.map((variant) => variant.id) ?? [],
      })),
      gptModels: cursorModels
        .filter((item) => item.id.startsWith("gpt-"))
        .slice(0, 12)
        .map((item) => item.id),
    });
    break;
  }
  case "run": {
    const modelID = value;
    if (!modelID) throw new Error("model ID is required");
    const variant = process.argv[4];
    const prompt = process.env.OPENCODE_TEST_PROMPT;
    if (!prompt) throw new Error("OPENCODE_TEST_PROMPT is required");
    const created = await request("/api/session", {
      method: "POST",
      body: JSON.stringify({
        title: `Cursor V2 live acceptance: ${modelID}`,
        agent: "build",
        model: {
          providerID: "cursor",
          id: modelID,
          ...(variant && variant !== "-" ? { variant } : {}),
        },
      }),
    });
    const session = created.data ?? created;
    const files =
      process.env.OPENCODE_TEST_IMAGE === "1"
        ? [
            {
              uri: `data:image/png;base64,${RED_BLUE_PNG}`,
              name: "red-blue.png",
              description:
                "A two-pixel image: red on the left and blue on the right.",
            },
          ]
        : undefined;
    await request(
      `/api/session/${encodeURIComponent(session.id)}/prompt`,
      {
        method: "POST",
        body: JSON.stringify({ text: prompt, files }),
      },
    );
    await request(
      `/api/session/${encodeURIComponent(session.id)}/wait`,
      { method: "POST" },
    );
    const messages = await request(
      `/api/session/${encodeURIComponent(session.id)}/message?order=asc&limit=200`,
    );
    const assistants = (messages.data ?? []).filter(
      (message) => message.type === "assistant",
    );
    print({
      sessionID: session.id,
      model: session.model,
      text: assistants
        .flatMap((message) => message.content ?? [])
        .filter((content) => content.type === "text")
        .map((content) => content.text)
        .join(""),
      tools: assistants
        .flatMap((message) => message.content ?? [])
        .filter((content) => content.type === "tool")
        .map((content) => ({
          name: content.name,
          status: content.state?.status,
        })),
      errors: assistants
        .filter((message) => message.error)
        .map((message) => message.error),
    });
    break;
  }
  case "session": {
    if (!value) throw new Error("session ID is required");
    const messages = await request(
      `/api/session/${encodeURIComponent(value)}/message?order=asc&limit=200`,
    );
    print(
      (messages.data ?? []).map((message) => ({
        type: message.type,
        text: message.type === "user" ? message.text : undefined,
        files:
          message.type === "user"
            ? message.files?.map((file) => ({
                name: file.name,
                mime: file.mime,
                uri: file.uri?.slice(0, 40),
              keys: Object.keys(file),
              }))
            : undefined,
        assistantContent:
          message.type === "assistant"
            ? message.content?.map((content) => content.type)
            : undefined,
        error:
          message.type === "assistant" ? message.error : undefined,
      })),
    );
    break;
  }
  default:
    throw new Error(`Unknown action: ${String(action)}`);
}

async function request(path, init = {}) {
  const response = await fetch(`${baseURL}${path}`, {
    ...init,
    headers: {
      Authorization: authorization,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`${path} returned HTTP ${response.status}: ${body}`);
  }
  return body ? JSON.parse(body) : undefined;
}

function print(value) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}
