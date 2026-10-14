/** Conservative conversational preference screening.
 * Statements about a match are derived only from their incoming messages or
 * explicit Tinder relationship-goal field, never from user messages or photos.
 * "Long-term partner" != marriage. Ambiguous dating terms never auto-pause.
 */
export type MatchIntent = "marriage" | "casual" | "long-term" | "unknown";
export type ScreeningAction = "continue" | "clarify" | "pause";
export interface ScreeningMessage { direction: "incoming" | "outgoing"; text: string; }
export interface MatchScreeningOptions {
  pauseOnConfirmedMarriage?: boolean;
  maximumHeightCm?: number | null;
  /** User-supplied optional synonyms only affect *suggestions*; not auto-pauses. */
  casualExpressions?: string[];
  marriageExpressions?: string[];
}
export interface MatchScreening {
  intent: MatchIntent;
  action: ScreeningAction;
  reason: "explicit-match-answer" | "height-rule" | "profile-goal-unconfirmed"
    | "marriage-needs-clarification" | "possible-casual-intent" | "no-decision";
  evidence: "incoming-message" | "visible-profile" | "none";
  heightCm: number | null;
  confirmedByReply: boolean;
}
function normalize(value: unknown): string {
  return typeof value === "string"
    ? value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim()
    : "";
}
function explicitMarriage(message: string): boolean {
  const s = normalize(message);
  if (/\b(?:pas|not|never|non|no)\s+(?:de\s+)?(?:mariage|marriage|marry|marier)\b/.test(s)) return false;
  if (/\b(?:je\s+(?:veux|cherche|souhaite)|j'aimerais|i\s+(?:want|am looking for)|looking\s+for)\b.{0,65}\b(?:mariage|me marier|marry|marriage|husband|wife)\b/.test(s)) return true;
  return /\b(?:en vue du mariage|pour le mariage|se marier|marriage minded)\b/.test(s);
}
function explicitCasual(message: string): boolean {
  const s = normalize(message);
  if (/\b(?:pas|not|never|non|no)\s+(?:de\s+)?(?:plan cul|one night stand|ons)\b/.test(s)) return false;
  return /\b(?:plan cul|one night stand|one-night stand|ons|sex friend|friends with benefits|sans lendemain)\b/.test(s);
}
function promptedForIntent(text: string): boolean {
  const s = normalize(text);
  return /\b(?:tu cherches quoi|tu recherches quoi|qu'est.ce que tu cherches|qu'est.ce que tu recherches|tu veux quoi (ici|sur tinder)|what are you looking for|looking for (something|a relationship)|tes intentions)\b/.test(s);
}
function confirmedMarriageReply(message: string): boolean {
  const s = normalize(message);
  // An explicit first-person statement after an explicit question can confirm.
  if (explicitMarriage(s)) return true;
  return /^(?:oui|yes|exactement|absolument|c'est ca|tout a fait)\s*[,!.]?\s*(?:je (?:veux|cherche|souhaite) (?:du )?(?:serieux|mariage)|pour (?:le )?mariage)\b/.test(s);
}
function validHeight(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 100 && value <= 230 ? value : null;
}
function intentFromProfile(value: unknown): MatchIntent {
  const s = normalize(value);
  if (!s) return "unknown";
  if (/\b(?:marriage|mariage|se marier)\b/.test(s)) return "marriage";
  if (/\b(?:long.term partner|long term partner|relation serieuse|serious relationship)\b/.test(s)) return "long-term";
  if (explicitCasual(s)) return "casual";
  return "unknown";
}
function possibleExpression(haystack: string, expressions: unknown): boolean {
  if (!Array.isArray(expressions)) return false;
  return expressions.slice(0, 20).some(value => {
    if (typeof value !== "string" || value.length < 4 || value.length > 80) return false;
    const term = normalize(value);
    return term && normalize(haystack).includes(term);
  });
}

export function assessMatchIntent(
  messages: readonly ScreeningMessage[],
  profile: { relationshipGoal?: string | null; heightCm?: number | null } | null,
  options: MatchScreeningOptions = {}
): MatchScreening {
  const heightCm = validHeight(profile?.heightCm);
  const rawMaxHeight = validHeight(options.maximumHeightCm);
  if (rawMaxHeight !== null && heightCm !== null && heightCm > rawMaxHeight) {
    return { intent: intentFromProfile(profile?.relationshipGoal), action: "pause", reason: "height-rule",
      evidence: "visible-profile", heightCm, confirmedByReply: false };
  }
  const knownProfileIntent = intentFromProfile(profile?.relationshipGoal);
  const recent = messages.slice(-80);
  let lastIncomingIndex = -1;
  for (let index = recent.length - 1; index >= 0; index--) {
    if (recent[index].direction === "incoming" && recent[index].text.trim()) { lastIncomingIndex = index; break; }
  }
  const incoming = lastIncomingIndex >= 0 ? recent[lastIncomingIndex].text : "";
  const outgoingBefore = lastIncomingIndex >= 0
    ? recent.slice(0, lastIncomingIndex).filter(m => m.direction === "outgoing").slice(-10) : [];
  const asked = outgoingBefore.some(m => promptedForIntent(m.text));
  const marriageReply = Boolean(incoming && asked && confirmedMarriageReply(incoming));
  if (marriageReply) {
    return { intent: "marriage", action: options.pauseOnConfirmedMarriage ? "pause" : "continue",
      reason: "explicit-match-answer", evidence: "incoming-message", heightCm, confirmedByReply: true };
  }
  if (explicitMarriage(incoming) || knownProfileIntent === "marriage"
    || possibleExpression(incoming, options.marriageExpressions)) {
    return { intent: "marriage", action: "clarify", reason: "marriage-needs-clarification",
      evidence: explicitMarriage(incoming) ? "incoming-message" : "visible-profile",
      heightCm, confirmedByReply: false };
  }
  if (explicitCasual(incoming) || knownProfileIntent === "casual" ||
    possibleExpression(incoming, options.casualExpressions)) {
    return { intent: "casual", action: "continue", reason: "possible-casual-intent",
      evidence: explicitCasual(incoming) ? "incoming-message" : "visible-profile",
      heightCm, confirmedByReply: false };
  }
  if (knownProfileIntent === "long-term") {
    return { intent: "long-term", action: "clarify", reason: "profile-goal-unconfirmed",
      evidence: "visible-profile", heightCm, confirmedByReply: false };
  }
  return { intent: "unknown", action: "continue", reason: "no-decision",
    evidence: "none", heightCm, confirmedByReply: false };
}

export function matchScreeningPrompt(screening: MatchScreening): string {
  if (screening.action === "pause") return "Match screening has paused this conversation. Do not draft an automated reply.";
  if (screening.action === "clarify") return "The match's stated relationship intentions need clarification. When relevant, ask naturally what they are looking for before assuming marriage or exclusivity. Avoid pressuring or repeating the question.";
  if (screening.intent === "casual") return "The match may be interested in something casual. Respect their words and boundaries; adapt tone only if this also matches the user's own saved goals. Do not assert consent or pretend certainty.";
  return "";
}
