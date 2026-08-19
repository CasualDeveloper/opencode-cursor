function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

export const DEFAULT_CONTEXT_WINDOW = positiveInteger(
  process.env.OPENCODE_CURSOR_DEFAULT_CONTEXT_WINDOW,
  200_000,
);
export const DEFAULT_MAX_TOKENS = positiveInteger(
  process.env.OPENCODE_CURSOR_DEFAULT_MAX_TOKENS,
  64_000,
);
