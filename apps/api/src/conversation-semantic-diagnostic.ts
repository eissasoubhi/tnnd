/** Only stable error codes may be returned to extension activity logs.
 * No provider response bodies, chat text, model prompts or secrets.
 */
export function publicObservedBoundaryFailure(error: unknown): string {
  const code = error instanceof Error ? error.message : "";
  if (code === "boundary_provider_not_configured")
    return "conversation_ai_provider_not_configured";
  if (code === "boundary_classifier_unavailable")
    return "conversation_ai_provider_unavailable";
  return "conversation_semantic_check_unavailable";
}
