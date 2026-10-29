/**
 * Semantic conversation outcome contract. Natural-language understanding is
 * performed by the configured AI provider on the authenticated API, never by
 * keyword lists or regexes in the extension.
 *
 * Pure validation here is intentionally deterministic. A model's unsupported,
 * ambiguous, or low-confidence output NEVER authorizes an automatic send.
 */
export type ConversationBoundaryMessage = {
  direction: "incoming" | "outgoing";
  text: string;
};
export type ConversationBoundaryKind =
  | "continue" | "rest" | "off-tinder" | "do-not-contact" | "acknowledgement" | "unknown";
export type SocialPlatform = "instagram" | "whatsapp" | "snapchat" | "telegram";
export type ConversationBoundary = {
  kind: ConversationBoundaryKind;
  platform: SocialPlatform | null;
};
export type BoundaryEvidence =
  | "ongoing" | "mutual-signoff" | "accepted-handoff" | "direct-handoff"
  | "explicit-stop" | "plain-acknowledgement" | "unclear";
export type StructuredBoundaryDecision = ConversationBoundary & {
  confidence: number;
  evidence: BoundaryEvidence;
};
export const UNCERTAIN_BOUNDARY: StructuredBoundaryDecision = {
  kind: "unknown", platform: null, confidence: 0, evidence: "unclear"
};
const kinds = new Set<ConversationBoundaryKind>([
  "continue", "rest", "off-tinder", "do-not-contact", "acknowledgement", "unknown"
]);
const platforms = new Set<SocialPlatform>(["instagram", "whatsapp", "snapchat", "telegram"]);
const evidenceKinds = new Set<BoundaryEvidence>([
  "ongoing", "mutual-signoff", "accepted-handoff", "direct-handoff",
  "explicit-stop", "plain-acknowledgement", "unclear"
]);

/** Parse a model-generated JSON object, never execute or trust its wording. */
export function parseStructuredBoundaryDecision(value: unknown): StructuredBoundaryDecision {
  if (!value || typeof value !== "object" || Array.isArray(value)) return UNCERTAIN_BOUNDARY;
  const data = value as Record<string, unknown>;
  const kind = data.kind;
  const evidence = data.evidence;
  const confidence = data.confidence;
  const platform = data.platform;
  if (!kinds.has(kind as ConversationBoundaryKind) ||
      !evidenceKinds.has(evidence as BoundaryEvidence) ||
      typeof confidence !== "number" || !Number.isFinite(confidence) ||
      confidence < 0 || confidence > 1 ||
      !(platform === "none" || platforms.has(platform as SocialPlatform))) return UNCERTAIN_BOUNDARY;
  if (kind === "off-tinder" ? platform === "none" : platform !== "none") return UNCERTAIN_BOUNDARY;
  return {
    kind: kind as ConversationBoundaryKind,
    evidence: evidence as BoundaryEvidence,
    confidence,
    platform: platform === "none" ? null : platform as SocialPlatform
  };
}

/**
 * Validate semantic evidence in context; the latest incoming turn has priority.
 * This does not infer meaning from texts. When confidence/evidence disagrees,
 * prefer unknown (never "continue"), to prevent unsafe surprise replies.
 */
export function acceptStructuredBoundaryDecision(
  decision: StructuredBoundaryDecision,
  messages: readonly ConversationBoundaryMessage[]
): StructuredBoundaryDecision {
  const last = messages.at(-1);
  if (!last || last.direction !== "incoming") return UNCERTAIN_BOUNDARY;
  const previous = messages.at(-2);
  const mutual = previous?.direction === "outgoing";
  const allowed =
    (decision.kind === "continue" && decision.evidence === "ongoing") ||
    (decision.kind === "unknown" && decision.evidence === "unclear") ||
    (decision.kind === "rest" && mutual && decision.evidence === "mutual-signoff") ||
    (decision.kind === "acknowledgement" && mutual && decision.evidence === "plain-acknowledgement") ||
    (decision.kind === "do-not-contact" && decision.evidence === "explicit-stop") ||
    (decision.kind === "off-tinder" && (decision.evidence === "direct-handoff" ||
      (mutual && decision.evidence === "accepted-handoff")));
  if (!allowed || decision.confidence < 0.9 || decision.kind === "unknown")
    return UNCERTAIN_BOUNDARY;
  return decision;
}
