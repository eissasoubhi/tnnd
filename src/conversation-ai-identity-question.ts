/**
 * A direct question about whether a dating conversation uses an AI assistant
 * requires an honest human response, never an automated denial or deflection.
 * Conservative patterns intentionally avoid unrelated discussion of AI.
 */
export interface AiIdentityMessage {
  direction: "incoming" | "outgoing";
  text: string;
}

export function isDirectAiIdentityQuestion(value: string): boolean {
  const text = value.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase()
    .replace(/[’'‘]/gu, " ").replace(/[?!.,;:]+/gu, " ").replace(/\s+/gu, " ").trim();
  if (!text || text.length > 300) return false;
  // Moroccan Darija in Latin characters: "Nta iA", "Nta Rak iA".
  if (/^(?:(?:wach|wash|wesh)\s+)?(?:nta|nti|ntiya|ntaya|rak|raki)(?:\s+(?:rak|raki|nta|nti))?\s+(?:une?\s+)?(?:ia|ai|i\s*a|bot|robot|chatgpt|gpt)(?:\s|$)/u.test(text)) return true;
  if (/^(?:nta|nti|rak|raki)\s+(?:katjawb|katktb|katkhdem)\s+(?:b|bel|bi)\s*(?:chatgpt|gpt|ia|ai)(?:\s|$)/u.test(text)) return true;
  // Indirect French/English suspicion is still a direct question about this
  // exchange, even when phrased as a feeling instead of "tu es une IA".
  if (/(?:j ai|jai|j avais|j avoue|i have|i ve|i feel|i think)\s+(?:(?:vraiment|un peu)\s+)?(?:l impression|le sentiment|the feeling)\s+(?:de|que|like|that)\s+(?:parler|discuter|echanger|chatting|talking).{0,48}\b(?:ia|ai|bot|robot|chatgpt|gpt)\b/u.test(text)) return true;
  if (/(?:impression|sentiment)\s+(?:de|que)\s+(?:parler|discuter|j ecris|tu ecris|je parle).{0,44}\b(?:ia|ai|bot|robot|chatgpt|gpt)\b/u.test(text)) return true;
  if (/^(?:on dirait|j ai l impression|j ai le sentiment|it feels like|feels like|sounds like|seems like).{0,70}\b(?:ia|ai|bot|robot|chatgpt|gpt)\b/u.test(text)) return true;
  if (/^(?:tu|vous|t|you)\s+(?:reponds|repondez|ecris|ecrivez|parles|parlez|sound|talk|write|text)\s+(?:comme|like)\s+(?:une?\s+|un\s+|an?\s+)?(?:ia|ai|bot|robot|chatgpt|gpt)\b/u.test(text)) return true;
  // French/English direct, second-person accusations or questions.
  if (/^(?:tu|vous|t)\s+(?:es|etes|est|utilises|utilisez)\s+(?:une?\s+|un\s+)?(?:ia|ai|bot|robot|chatgpt|gpt)(?:\s|$)/u.test(text)) return true;
  if (/^(?:c\s+est|ce\s+sont)\s+(?:une?\s+|un\s+)?(?:ia|ai|bot|robot|chatgpt|gpt)\s+(?:qui\s+(?:repond|ecrit|parle)|qui\s+te\s+fait\s+repondre)(?:\s|$)/u.test(text)) return true;
  if (/^(?:are\s+you|you\s+are|you\s+re|is\s+this)\s+(?:(?:an?|the)\s+)?(?:ai|bot|robot|chatgpt|gpt)(?:\s|$)/u.test(text)) return true;
  if (/^(?:are\s+you|do\s+you|tu|vous)\s+(?:using|use|utilises|utilisez)\s+(?:(?:an?|the|une?)\s+)?(?:ai|ia|chatgpt|gpt)(?:\s|$)/u.test(text)) return true;
  if (/^(?:واش|هل)?\s*(?:نتا|نتي|انت|انتي|أنت|أنتي)\s+(?:روبوت|بوت|ذكاء\s+اصطناعي|شات\s+جي\s+بي\s+تي)(?:\s|$)/u.test(text)) return true;
  return false;
}

export function latestIncomingAsksAboutAiIdentity(messages: readonly AiIdentityMessage[]): boolean {
  if (messages.at(-1)?.direction !== "incoming") return false;
  // Consecutive incoming bubbles are one turn. "I feel I'm talking to an AI"
  // followed by "don't know why" / "hhh" must not erase the earlier concern.
  let inspected = 0;
  for (let i = messages.length - 1; i >= 0 && inspected < 6; i--) {
    const item = messages[i];
    if (item.direction !== "incoming") break;
    inspected++;
    if (isDirectAiIdentityQuestion(item.text)) return true;
  }
  return false;
}

/** An auto-generated denial of AI involvement must never be sent as fact. */
export function isMisleadingAiDenial(value: string): boolean {
  const text = value.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase()
    .replace(/[’'‘]/gu, " ").replace(/\s+/gu, " ").trim();
  return /\b(?:je\s+(?:ne\s+)?suis\s+(?:pas\s+)?(?:bien\s+)?reel|je\s+(?:ne\s+)?suis\s+pas\s+(?:une?\s+|un\s+)?(?:ia|ai|robot|bot)|je\s+(?:n\s+utilise\s+pas|n\s+ai\s+pas\s+besoin\s+de)\s+(?:chatgpt|gpt|une?\s+ia)|i\s+am\s+(?:not\s+)?(?:a\s+)?real\s+(?:person|human)|i\s+am\s+not\s+(?:an?\s+)?(?:ai|bot|robot))\b/u.test(text);
}
