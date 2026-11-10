/** Validates the only payload allowed to cross from Tinder's isolated
 * content script to TNND's service worker and authenticated local API.
 * This module NEVER grants send permission or computes semantic intent.
 */
export type BoundaryObservationMessage = {
  direction: "incoming" | "outgoing";
  text: string;
};
export type BoundaryObservation = {
  externalThreadId: string;
  messages: BoundaryObservationMessage[];
};
export type BoundaryBridgeDecision = {
  kind: "continue" | "rest" | "off-tinder" | "do-not-contact" | "acknowledgement" | "unknown";
  platform: string | null;
};
const validKinds = new Set([
  "continue", "rest", "off-tinder", "do-not-contact", "acknowledgement", "unknown"
]);
const validPlatforms = new Set(["instagram", "whatsapp", "snapchat", "telegram"]);
export function validateBoundaryObservation(ref: unknown, rawMessages: unknown): BoundaryObservation | null {
  if (typeof ref !== "string" || !ref.trim() || ref.length > 512 || ref.includes("/") ||
      !Array.isArray(rawMessages) || rawMessages.length < 1 || rawMessages.length > 12) return null;
  const messages: BoundaryObservationMessage[] = [];
  for (const raw of rawMessages) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const message = raw as {direction?: unknown; text?: unknown};
    if ((message.direction !== "incoming" && message.direction !== "outgoing") ||
        typeof message.text !== "string" || !message.text.trim() || message.text.length > 4000) return null;
    messages.push({ direction: message.direction, text: message.text });
  }
  if (messages.at(-1)?.direction !== "incoming") return null;
  return { externalThreadId: ref, messages };
}
export function validateBoundaryBridgeDecision(raw: unknown): BoundaryBridgeDecision | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const decision = raw as {kind?: unknown; platform?: unknown};
  if (typeof decision.kind !== "string" || !validKinds.has(decision.kind)) return null;
  if (decision.platform !== null && decision.platform !== undefined &&
      (typeof decision.platform !== "string" || !validPlatforms.has(decision.platform))) return null;
  if (decision.kind === "off-tinder" && !validPlatforms.has(String(decision.platform))) return null;
  if (decision.kind !== "off-tinder" && decision.platform != null) return null;
  return { kind: decision.kind as BoundaryBridgeDecision["kind"], platform: decision.platform ?? null };
}
/** Only stable API error codes. Never forward server error text or keys to the log. */
export function safeBoundaryBridgeFailure(raw: unknown, status: number): string {
  switch (raw) {
    case "conversation_ai_provider_not_configured":
    case "conversation_ai_provider_unavailable":
    case "conversation_semantic_check_unavailable":
    case "invalid_conversation_boundary":
    case "invalid_or_expired_session":
      return raw;
    default:
      return status === 401 ? "invalid_or_expired_session"
        : status === 503 ? "conversation_semantic_check_unavailable"
          : "conversation_boundary_backend_rejected";
  }
}

/** The API emits only these codes when a classification is uncertain. */
const diagnostics = new Set([
  "conversation_not_persisted", "no_persisted_messages",
  "latest_message_mismatch", "previous_message_mismatch",
  "unverified_observed_tail", "semantic_decision_uncertain",
  "history_changed_during_classification",
  "conversation_changed_during_classification"
]);
export function safeSemanticDiagnostic(value: unknown): string | null {
  return typeof value === "string" && diagnostics.has(value) ? value : null;
}
