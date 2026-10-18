/**
 * Conservative, deterministic conversation-boundary policy.
 *
 * Returns a no-reply decision only when the LATEST verified message is inbound.
 * A shared handle, generic "ok", or an ordinary greeting is never proof of a handoff.
 * Does not contact anyone, schedule a new opener, or read unverified DOM selectors.
 */
export type ConversationBoundaryMessage = {
  direction: "incoming" | "outgoing";
  text: string;
};
export type ConversationBoundaryKind = "continue" | "rest" | "off-tinder" | "do-not-contact";
export type ConversationBoundary = {
  kind: ConversationBoundaryKind;
  platform: "instagram" | "whatsapp" | "snapchat" | "telegram" | null;
};

const CONTINUE: ConversationBoundary = { kind: "continue", platform: null };

function normalize(value: string): string {
  return value.normalize("NFKD").replace(/\p{M}/gu, "").replace(/\s+/gu, " ").trim().toLocaleLowerCase();
}

function socialPlatform(text: string): ConversationBoundary["platform"] {
  if (/\b(?:instagram|insta|ig)\b/u.test(text) || /(?:انستغرام|انستجرام)/u.test(text)) return "instagram";
  if (/\b(?:whatsapp|whats[ -]?app|wtsp|wtsap|wsp|watsapp|watsap|wa)\b/u.test(text) || /واتساب/u.test(text)) return "whatsapp";
  if (/\b(?:snapchat|snap)\b/u.test(text)) return "snapchat";
  if (/\b(?:telegram)\b/u.test(text)) return "telegram";
  return null;
}

/** Clearly proposes continuing somewhere else, rather than merely naming an app. */
function handoffProposal(text: string): ConversationBoundary["platform"] {
  const platform = socialPlatform(text);
  if (!platform) return null;
  const move = /\b(?:on\s+(?:se\s+)?parle|on\s+passe|on\s+continue|on\s+discute|parlons|passe|passons|viens|viens\s+me\s+parler|ecris(?:-moi)?|écris(?:-moi)?|ajoute(?:-moi)?|contacte(?:-moi)?|discutons|retrouve(?:-moi)?|let'?s\s+(?:talk|chat|move)|talk\s+(?:on|there)|message\s+me|text\s+me|dm\s+me|add\s+me|switch\s+to|move\s+to|write\s+me)\b/u.test(text);
  const afterApp = /\b(?:instagram|insta|ig|whatsapp|whats[ -]?app|wtsp|wtsap|wsp|watsapp|watsap|snapchat|snap|telegram)\b.{0,36}\b(?:on\s+se\s+parle|on\s+passe|parlons|écris(?:-moi)?|ecris(?:-moi)?|message\s+me|talk|chat|dm|là-bas|there)\b/u.test(text);
  const negatives = /\b(?:pas\s+(?:sur|de|envie)|ne\s+(?:veux|souhaite)\s+pas|don't|do\s+not|never|non\s+merci|refuse)\b/u.test(text);
  const darijaMove = /(?:نهضرو|نهضر|نكمّلو|نكملو|صيفط ليا|كتب ليا)/u.test(text);
  const darijaRefusal = /(?:ما بغيتش|مابغيتش|ماشي باغي|ماشي باغية)/u.test(text);
  return !negatives && !darijaRefusal && (move || afterApp || darijaMove) ? platform : null;
}

function affirmative(text: string): boolean {
  return /^(?:ok(?:ay)?|oui|yes|yep|yeah|d'accord|daccord|ça\s+marche|ca\s+marche|c'est\s+bon|cest\s+bon|vas-y|va\s+y|parfait|sounds\s+good|sure|deal|you\s+too|toi\s+aussi|likewise|واخا|حاضر)[\s.!?👌👍🙂😊😘❤️❤]*$/u.test(text);
}

function goodbye(text: string): boolean {
  return /(?:^|[,.;!?\s])(?:bye(?:\s+bye)?|good\s*night|good\s*evening|see\s+(?:you\s+)?(?:tomorrow|later|ya)|talk\s+(?:to\s+you\s+)?tomorrow|sleep\s+well|bonne\s+(?:soirée|soiree|nuit)|à\s+demain|a\s+demain|au\s+revoir|à\s+(?:plus|bientôt|tout\s+à\s+l'heure)|a\s+(?:plus|bientot)|bisous|تصبح(?:ين)?\s+على\s+خير|تصبحي\s+على\s+خير|بسلامة|ليلة\s+سعيدة)(?:\s+(?:à\s+toi|a\s+toi|toi\s+aussi|you\s+too|également|egalement|et\s+toi))?[\s.!?…🙂😊😘❤️❤👋🌙]*$/u.test(text);
}

function refusesContact(text: string): boolean {
  return /^(?:s'il\s+te\s+pla[iî]t\s+)?(?:ne\s+m['’]?ecris\s+plus|ne\s+me\s+contacte\s+plus|arrete\s+de\s+m['’]?ecrire|arrete\s+de\s+m['’]?ecrire|don't\s+(?:text|message|contact)\s+me\s+again|stop\s+(?:texting|messaging|contacting)\s+me|leave\s+me\s+alone)[\s.!?]*$/u.test(text);
}

/** Evidence is evaluated newest-first, in the order it was actually observed. */
export function classifyConversationBoundary(
  messages: readonly ConversationBoundaryMessage[]
): ConversationBoundary {
  const recent = messages
    .filter(message => (message.direction === "incoming" || message.direction === "outgoing")
      && typeof message.text === "string" && message.text.trim())
    .slice(-12);
  const last = recent.at(-1);
  if (!last || last.direction !== "incoming") return CONTINUE;
  const text = normalize(last.text);
  if (refusesContact(text)) return { kind: "do-not-contact", platform: null };

  // Direct invitation to continue on a known app: do not keep chatting on Tinder.
  const directHandoff = handoffProposal(text);
  if (directHandoff) return { kind: "off-tinder", platform: directHandoff };

  // A short acceptance or a contact-only reply needs a RECENT, explicit
  // outgoing proposal. Merely asking "what's your insta?" is insufficient.
  const previous = recent.at(-2);
  if (previous?.direction === "outgoing") {
    const precedingText = normalize(previous.text);
    const previousPlatform = handoffProposal(precedingText);
    const isSharedHandle = /^@?[\p{L}\p{N}][\p{L}\p{N}._-]{2,35}$/u.test(text)
      && (text.startsWith("@") || /[\d._-]/u.test(text))
      && !/^(?:non|jamais|never|no)$/u.test(text);
    if (previousPlatform && (affirmative(text) || isSharedHandle))
      return { kind: "off-tinder", platform: previousPlatform };
    if (goodbye(precedingText) && (goodbye(text) || affirmative(text)))
      return { kind: "rest", platform: null };
  }

  // A standalone farewell from the match can merit one polite response;
  // after a MUTUAL sign-off, replying again would prolong the conversation.
  return CONTINUE;
}
