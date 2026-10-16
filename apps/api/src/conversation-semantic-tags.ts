/** Conservative, explainable classification of *conversation content*.
 * This is a filter hint, not a fact about a match, dating intentions or consent.
 * Missing signals produce unknown rather than guessing from message count.
 */
export type ConversationStageTag = "introductions" | "getting-to-know" | "date-discussion" | "off-tinder";
export type ConversationToneTag = "playful" | "flirty" | "warm" | "direct";
export interface SemanticMessage { direction: "incoming" | "outgoing"; text: string }
export interface ConversationSemanticTags {
  stage: ConversationStageTag | null;
  tone: ConversationToneTag | null;
  source: "rule-based" | "unknown";
}
function norm(text: string): string {
  return text.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();
}
function appears(text: string, pattern: RegExp): boolean {
  return pattern.test(norm(text));
}
const greeting = /^(?:bonjour|bonsoir|salut|salam|coucou|slt|hi|hey|hello|cc|cv|ça va|ca va|how are you)[.!?\s🙂😊]*$/u;
const dateTalk = /\b(?:on (?:se voit|se retrouve|prend un verre)|tu es dispo pour|t'es dispo pour|rendez[ -]?vous|rdv|let'?s meet|meet up|grab (?:a coffee|drinks)|coffee (?:together|date)|diner ensemble|dinner date|je t'invite)\b/u;
const gettingKnow = /\b(?:je (?:travaille|bosse|vis|viens de|suis de|kiffe|voyage|pratique|fais du|fais de)|j'aime|j'adore|tu (?:aimes|travailles|habites|viens)|tes (?:passions|loisirs)|my (?:job|hobbies|passion)|i (?:work|live|love|like|study)|where do you (?:live|work)|what do you (?:like|do for fun))\b/u;
const flirty = /\b(?:tu me plais|t'es (?:mignonn?e|belle?|beau)|you'?re (?:cute|gorgeous|hot)|j'ai envie de (?:t'embrasser|te voir)|j'aimerais t'embrasser|kiss you|flirt|crush)\b/u;
const playful = /\b(?:mdr|ptdr|haha+|hhh+|je plaisante|je rigole|just kidding|joking|te taquine|teasing)\b/u;
const warm = /\b(?:prends soin de toi|bon courage|je suis la pour toi|je comprends|take care|i'm here for you|sorry to hear|courage a toi)\b/u;
const direct = /\b(?:je cherche (?:quelque chose de serieux|du serieux)|je prefere etre (?:direct|franc)|je vais etre (?:direct|franc)|no games|let'?s be honest|i'm looking for (?:something serious|a relationship))\b/u;

export function inferConversationSemanticTags(
  messages: readonly SemanticMessage[], conversationStatus?: string
): ConversationSemanticTags {
  if (conversationStatus === "moved-off-tinder") {
    return { stage: "off-tinder", tone: null, source: "rule-based" };
  }
  const recent = messages.slice(-30).filter(m => m && typeof m.text === "string"
    && (m.direction === "incoming" || m.direction === "outgoing")).map(m => ({
      direction: m.direction, text: norm(m.text)
    }));
  if (!recent.length) return { stage: null, tone: null, source: "unknown" };
  const twoWay = recent.some(m => m.direction === "incoming") && recent.some(m => m.direction === "outgoing");
  const meaningful = recent.filter(m => m.text.length >= 12 && !greeting.test(m.text));
  const byDirection = new Set(meaningful.map(m => m.direction));
  const stage: ConversationStageTag = twoWay && recent.some(m => appears(m.text, dateTalk))
    ? "date-discussion"
    : twoWay && meaningful.length >= 2 && byDirection.size === 2 && meaningful.some(m => appears(m.text, gettingKnow))
      ? "getting-to-know"
      : "introductions";
  const matches = (pattern: RegExp) => recent.filter(m => appears(m.text, pattern)).length;
  const tone: ConversationToneTag | null = matches(flirty) >= 1
    ? "flirty" : matches(warm) >= 1
      ? "warm" : matches(playful) >= 2
        ? "playful" : matches(direct) >= 1
          ? "direct" : null;
  return { stage, tone, source: "rule-based" };
}
