/** Truncate oversized tool output before replaying it to Cursor. */

const MCP_RESULT_MAX_CHARS = Number(
  process.env.OPENCODE_CURSOR_MCP_RESULT_MAX_CHARS ?? 24_000,
);
const MCP_RESULT_HEAD_CHARS = Number(
  process.env.OPENCODE_CURSOR_MCP_RESULT_HEAD_CHARS ?? 16_000,
);
const MCP_RESULT_TAIL_CHARS = Number(
  process.env.OPENCODE_CURSOR_MCP_RESULT_TAIL_CHARS ?? 6_000,
);

/**
 * Truncate oversized tool output for Cursor mcpResult / continuation prompts.
 * Keeps head + tail so build success lines near the end stay visible.
 */
export function truncateToolResultForCursor(content: string): string {
  const text = content ?? "";
  if (text.length <= MCP_RESULT_MAX_CHARS) return text;
  const headN = Math.min(MCP_RESULT_HEAD_CHARS, MCP_RESULT_MAX_CHARS);
  const tailN = Math.min(
    MCP_RESULT_TAIL_CHARS,
    Math.max(0, MCP_RESULT_MAX_CHARS - headN),
  );
  const head = text.slice(0, headN);
  const tail = tailN > 0 ? text.slice(-tailN) : "";
  const omitted = Math.max(0, text.length - head.length - tail.length);
  return `${head}\n\n…[truncated ${omitted} chars of tool output for Cursor bridge stability]…\n\n${tail}`;
}
