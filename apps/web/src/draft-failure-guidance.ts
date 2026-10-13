/** Map stable backend failures into user guidance, never display raw stack traces. */
export function draftFailureGuidance(code: string, status?: number): string {
  switch (code) {
    case "no_synced_incoming_message":
      return "TNND cannot find a received message in this saved conversation. On Tinder, open this chat and use Import visible chat (read-only) in the extension, then try again. If the messages appear under the wrong sender or contain timestamps mixed into the text, export a Tinder diagnostic ZIP from the active chat for selector correction.";
    case "gemini_not_configured":
    case "ai_provider_settings_not_configured":
      return "Gemini is not configured for draft generation. Open Settings → Gemini, save a key and model, then test the connection.";
    case "gemini_credentials_rejected":
      return "Gemini rejected your credentials. Go to Settings → Gemini, replace the API key and test it.";
    case "gemini_model_unavailable":
      return "The selected Gemini model is unavailable. Change the model in Settings → Gemini and run Test connection.";
    case "gemini_rate_limited":
      return "Gemini's usage limit was reached. Wait a little, check your Google AI quota, then try again.";
    case "gemini_output_truncated":
      return "Gemini stopped before completing the reply. No draft was accepted. Try Generate again, or select a model with a larger output limit in Settings → Gemini.";
    case "gemini_invalid_output":
      return "Gemini returned an incomplete or malformed structured reply, so TNND refused to show or copy it. Try generating another draft.";
    case "gemini_empty_response":
      return "Gemini returned an empty draft. Try again; if it repeats, review the model and the API logs.";
    case "gemini_provider_unavailable":
      return "Gemini could not complete this request. Check the provider connection and retry.";
    case "internal_error":
      return "TNND API failed while generating the reply. Check the API logs; the issue may come from Gemini configuration or conversation context. Export the Web diagnostic ZIP to identify the failing request.";
  }
  if (status === 401 || status === 403) return "Your session is not valid. Sign in to TNND again.";
  if (status === 429) return "The service is busy or rate-limited. Wait and try again.";
  if (status !== undefined && status >= 500) return "The TNND API encountered a server error. Check API logs and export the Web diagnostic ZIP.";
  if (code === "failed_to_fetch" || code === "network_error") return "TNND could not reach the API. Check that Docker services are running and the Web tab can reach /api/v1.";
  return "Could not generate a draft. Check that a conversation is selected, Gemini is configured, and the backend is reachable.";
}
