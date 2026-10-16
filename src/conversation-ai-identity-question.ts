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
  // French/English direct, second-person accusations or questions.
  if (/^(?:tu|vous|t)\s+(?:es|etes|est|utilises|utilisez)\s+(?:une?\s+|un\s+)?(?:ia|ai|bot|robot|chatgpt|gpt)(?:\s|$)/u.test(text)) return true;
  if (/^(?:c\s+est|ce\s+sont)\s+(?:une?\s+|un\s+)?(?:ia|ai|bot|robot|chatgpt|gpt)\s+(?:qui\s+(?:repond|ecrit|parle)|qui\s+te\s+fait\s+repondre)(?:\s|$)/u.test(text)) return true;
  if (/^(?:are\s+you|you\s+are|you\s+re|is\s+this)\s+(?:(?:an?|the)\s+)?(?:ai|bot|robot|chatgpt|gpt)(?:\s|$)/u.test(text)) return true;
  if (/^(?:are\s+you|do\s+you|tu|vous)\s+(?:using|use|utilises|utilisez)\s+(?:(?:an?|the|une?)\s+)?(?:ai|ia|chatgpt|gpt)(?:\s|$)/u.test(text)) return true;
  if (/^(?:واش|هل)?\s*(?:نتا|نتي|انت|انتي|أنت|أنتي)\s+(?:روبوت|بوت|ذكاء\s+اصطناعي|شات\s+جي\s+بي\s+تي)(?:\s|$)/u.test(text)) return true;
  return false;
}

export function latestIncomingAsksAboutAiIdentity(messages: readonly AiIdentityMessage[]): boolean {
  const last = messages.at(-1);
  return Boolean(last && last.direction === "incoming" && isDirectAiIdentityQuestion(last.text));
}
