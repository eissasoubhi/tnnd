import { GenerationStageFailure } from "./conversation-generation-stage.js";
/** Public, stable categories only. No upstream Gemini response bodies or credentials. */
export function generationErrorResponse(error: unknown): { status: number; body: { error: string; stage?: string } } {
  if (error instanceof GenerationStageFailure) {
    return {
      status: 500,
      body: { error: error.schemaMissing ? "generation_schema_missing" : "generation_context_unavailable", stage: error.stage }
    };
  }
  const message = error instanceof Error ? error.message : "";
  if (message === "gemini_not_configured") return { status: 422, body: { error: "gemini_not_configured" } };
  if (message === "gemini_output_truncated") return { status: 502, body: { error: "gemini_output_truncated" } };
  if (message === "gemini_invalid_output") return { status: 502, body: { error: "gemini_invalid_output" } };
  if (message === "gemini_empty_response") return { status: 502, body: { error: "gemini_empty_response" } };
  if (message.startsWith("gemini_provider_error:")) {
    const status = Number(message.slice("gemini_provider_error:".length));
    if (status === 429) return { status: 429, body: { error: "gemini_rate_limited" } };
    if (status === 400 || status === 404) return { status: 502, body: { error: "gemini_model_unavailable" } };
    if (status === 401 || status === 403) return { status: 502, body: { error: "gemini_credentials_rejected" } };
    return { status: 502, body: { error: "gemini_provider_unavailable" } };
  }
  return { status: 500, body: { error: "internal_error" } };
}
