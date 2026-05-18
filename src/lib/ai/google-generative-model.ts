/**
 * Gemini model id for `@ai-sdk/google` (e.g. `gemini-2.0-flash`, `gemini-1.5-pro`).
 * Override with `GOOGLE_GENERATIVE_AI_MODEL` in `.env.local`.
 */
export function googleGenerativeAiModelId(): string {
  const id = process.env.GOOGLE_GENERATIVE_AI_MODEL?.trim();
  return id && id.length > 0 ? id : "gemini-1.5-pro";
}
