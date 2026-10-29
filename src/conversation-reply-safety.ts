import { latestIncomingAsksAboutAiIdentity, isMisleadingAiDenial, type AiIdentityMessage } from "./conversation-ai-identity-question.ts";

export type AutomaticReplyHold = "ai-identity" | "acknowledgement" | null;

/** Only the current verified incoming turn can suppress an automatic answer. */
export function automaticReplyHold(messages: readonly AiIdentityMessage[]): AutomaticReplyHold {
  const last = messages.at(-1);
  if (!last || last.direction !== "incoming") return null;
  if (latestIncomingAsksAboutAiIdentity(messages)) return "ai-identity";
  // Acknowledgement, sign-off, and implicit intent are classified by Gemini
  // using verified persisted context. Never use a list of surface phrases here.
  return null;
}

/** Guard automatic sends after a model ignored a repeated AI-suspicion rule. */
export const replyNeedsHumanReview = isMisleadingAiDenial;

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
