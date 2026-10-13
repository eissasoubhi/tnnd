/**
 * Public-safe stages for failed conversation generation. Stage is selected
 * by code, never from a query, prompt, provider response, or user-supplied text.
 */
export const generationStages = [
  "conversation", "profile", "summary", "facts", "effective-context",
  "supplemental", "memories", "provider-settings", "provider", "memory-usage"
] as const;
export type GenerationStage = typeof generationStages[number];

export class GenerationStageFailure extends Error {
  override readonly name = "GenerationStageFailure";
  readonly schemaMissing: boolean;
  constructor(readonly stage: GenerationStage, cause: unknown) {
    super("generation_stage_failed", { cause });
    // Only static SQLSTATE classification; no raw SQL, arguments, API keys or
    // error messages may appear in the public response or structured log.
    const sqlstate = cause && typeof cause === "object" && "code" in cause
      ? (cause as { code: unknown }).code : null;
    this.schemaMissing = sqlstate === "42P01" || sqlstate === "42703";
  }
}

export async function withGenerationStage<T>(stage: GenerationStage, task: () => Promise<T>): Promise<T> {
  try {
    return await task();
  } catch (error) {
    // Known provider errors already have a safe dedicated mapping.
    if (error instanceof Error && (error.message === "gemini_not_configured"
      || error.message === "gemini_empty_response"
      || /^gemini_provider_error:\d{3}$/.test(error.message))) throw error;
    throw new GenerationStageFailure(stage, error);
  }
}

export function safeGenerationFailureLog(error: unknown): string {
  if (error instanceof GenerationStageFailure) {
    return JSON.stringify({
      event: "conversation_generation_failed",
      stage: error.stage,
      reason: error.schemaMissing ? "database_schema_missing" : "stage_failed"
    });
  }
  const msg = error instanceof Error ? error.message : "";
  const reason = /^gemini_provider_error:\d{3}$/.test(msg)
    ? "gemini_provider_error" : msg === "gemini_not_configured" || msg === "gemini_empty_response"
      ? msg : "unclassified";
  return JSON.stringify({ event: "conversation_generation_failed", stage: "provider-or-other", reason });
}
