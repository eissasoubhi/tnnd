import { latestIncomingAsksAboutAiIdentity, type AiIdentityMessage } from "./conversation-ai-identity-question.ts";

export type AutomaticReplyHold = "ai-identity" | "acknowledgement" | null;

/** Only the current verified incoming turn can suppress an automatic answer. */
export function automaticReplyHold(messages: readonly AiIdentityMessage[]): AutomaticReplyHold {
  const last = messages.at(-1);
  if (!last || last.direction !== "incoming") return null;
  if (latestIncomingAsksAboutAiIdentity(messages)) return "ai-identity";
  const text = last.text.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase()
    .replace(/[’'‘]/gu, " ").replace(/[😂🤣😄😅🙂😊👍👌❤️❤.!?,;:]/gu, " ")
    .replace(/\s+/gu, " ").trim();
  // The match has acknowledged the preceding turn without opening a new topic.
  // No need to append another witty line or a second goodbye.
  if (/^(?:(?:h{2,}|lol|mdr)\s+)?(?:ok(?:ay)?|d accord|ca marche|c est bon|compris|bien recu|parfait|entendu|oui c est bon|merci|thanks|sounds good|got it|all good)(?:\s+(?:ca marche|compris|merci|bien|parfait|mdr|h{2,}))?$/u.test(text)) {
    return "acknowledgement";
  }
  return null;
}

/** Guard automatic sends after a model ignored a repeated AI-suspicion rule. */
export function replyNeedsHumanReview(reply: string): boolean {
  const text = reply.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase()
    .replace(/[’'‘]/gu, " ").replace(/\s+/gu, " ").trim();
  return /\b(?:je\s+suis\s+bien\s+reel|je\s+(?:ne\s+)?suis\s+pas\s+(?:une?\s+|un\s+)?(?:ia|ai|robot|bot)|i\s+am\s+not\s+(?:an?\s+)?(?:ai|robot|bot)|i\s+am\s+(?:a\s+)?real\s+(?:human|person)|pas\s+(?:de\s+)?chatgpt\s+(?:ici|non)|aucune?\s+ia\s+(?:ici|derriere))\b/u.test(text);
}

/**
 * When the match chats in Latin-script Darija, never auto-send an accidental
 * Latin/Arabic-script salad. Pure Arabic is left to explicit language policy.
 */
export function hasUnexpectedScriptMix(reply: string, messages: readonly AiIdentityMessage[]): boolean {
  if (!/\p{Script=Arabic}/u.test(reply) || !/\p{Script=Latin}/u.test(reply)) return false;
  const incoming = messages.filter(m => m.direction === "incoming").slice(-3).map(m => m.text);
  if (!incoming.length || incoming.some(t => /\p{Script=Arabic}/u.test(t))) return false;
  return incoming.some(t => /\b(?:ghi|raha|ghir|lila|wla|wach|kifach|chno|labas|hamdo(?:u)?lilah|baki|nta|nti|wakha|daba|trankil|3lach|ghadi)\b/iu.test(t));
}
