/** Transport-neutral image and tool shapes accepted by Cursor AgentService. */

export interface ExtractedImage {
  bytes: Uint8Array;
  mimeType: string;
  filename: string;
}

export interface OpenAIToolDef {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
}
