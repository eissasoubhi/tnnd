/**
 * Conversation-local language and laughter cues. No persistence, no extra model
 * call, and never treats outgoing messages as evidence of the match's language.
 * Deliberately conservative for short and code-switched messages.
 */
export interface ReplyStyleMessage { direction: "incoming" | "outgoing"; text: string }
export type ObservedLanguage = "fr" | "darija" | "en" | "unknown";
export interface ReplyStyleCues {
  recentLanguage: ObservedLanguage;
  repeatedSenderLaughter: boolean;
  recentOutgoingLaughter: number;
}

const LAUGH = /\b(?:ha(?:ha)+|hi(?:hi)+|h{3,}|mdr|ptdr|lol|jaja)\b/giu;
const DARIJA = /\b(?:wakha|wakhaa|kaydouz|kaydoz|kayn|kayna|kaynin|tayer|tayr|saraha|sara7a|bzf|bzaf|bzzaf|daba|db|kifach|wach|chno|fin|labas|safi|mzyan|bghit|bghiti|bghina|nta|nti|khoya|zwin|3lach|3nd|7it|ghadi|kan|hna|hadchi|machi|safi)\b|واش|بزاف|لاباس|دابا|مزيان|شنو|فين|واخا|كنبغي|كاين/giu;
const FRENCH = /\b(?:bonjour|salut|oui|non|bien|pourquoi|comment|avec|dans|demain|soir|semaine|routine|journée|juste|toujours|vraiment|boulot|travail|part|genre|mais|donc|quoi|pour|chez|suis|faire|fais|cest|c'est|c|tu|je|est|des|une|pas|en|le|la|les|de|et)\b|ça|être|été/giu;
const ENGLISH = /\b(?:hello|hey|how|what|why|when|you|your|are|the|this|that|have|with|good|yeah|thanks|today|tomorrow|nice|really|just|work|weekend|doing)\b/giu;
const count = (s: string, rx: RegExp): number => [...s.matchAll(rx)].length;

export function detectMatchLanguage(text: string): ObservedLanguage {
  // A single foreign word (or laughter token) is not enough to change dialect.
  const fr = count(text, FRENCH);
  const darija = count(text, DARIJA);
  const en = count(text, ENGLISH);
  const sorted = ([["fr", fr], ["darija", darija], ["en", en]] as const)
    .slice().sort((a, b) => b[1] - a[1]);
  if (sorted[0][1] < 2 || sorted[0][1] === sorted[1][1]) return "unknown";
  // Small amounts of Darija embedded in French are ordinary code-switching.
  if (sorted[0][0] === "darija" && darija < 2) return "unknown";
  return sorted[0][0];
}

export function readReplyStyleCues(messages: readonly ReplyStyleMessage[], latestIncoming = ""): ReplyStyleCues {
  const incoming = messages.filter(m => m.direction === "incoming" && m.text.trim()).slice(-6);
  if (latestIncoming.trim() && incoming.at(-1)?.text.trim() !== latestIncoming.trim()) {
    incoming.push({ direction: "incoming", text: latestIncoming });
  }
  const recent = incoming.slice(-3).map(m => detectMatchLanguage(m.text));
  // A clearly distinct latest turn can change the language; if the most recent
  // reply is ambiguous, use only repeated recent evidence (not the sender's).
  let recentLanguage: ObservedLanguage = "unknown";
  const latest = recent.at(-1) ?? "unknown";
  if (latest !== "unknown") recentLanguage = latest;
  else {
    const evidence = recent.filter(l => l !== "unknown");
    if (evidence.length >= 2 && evidence.at(-1) === evidence.at(-2)) recentLanguage = evidence.at(-1)!;
  }
  const outgoing = messages.filter(m => m.direction === "outgoing").slice(-3);
  const recentOutgoingLaughter = outgoing.filter(m => count(m.text, LAUGH) > 0).length;
  return {
    recentLanguage,
    recentOutgoingLaughter,
    repeatedSenderLaughter: recentOutgoingLaughter >= 1
  };
}

/**
 * These are writing preferences, not a request to mimic slang, fabricate
 * cultural identity or bypass a manually locked per-chat language choice.
 */
export function replyStyleGuidance(cues: ReplyStyleCues, autoLanguage = true): string {
  const parts = [
    "Reply naturally to the match's actual last message. Do not tack on 'haha', 'hhh', 'mdr' or 'lol' as a routine filler; humor can be conveyed without a laugh token."
  ];
  if (autoLanguage) {
    if (cues.recentLanguage === "darija") {
      parts.push("The match's latest clear turn is mainly Moroccan Darija written in Latin script. Prefer natural Latin-script Darija for this reply, mixing in French only as the match does. Do not default to an all-French reply or invent Moroccan phrases.");
    } else if (cues.recentLanguage === "fr") {
      parts.push("The match's latest clear turn is mainly French. Reply mostly in their informal French; a single borrowed Darija word is not a reason to switch the whole reply.");
    } else if (cues.recentLanguage === "en") {
      parts.push("The match's latest clear turn is mainly English. Reply mostly in their natural English.");
    } else {
      parts.push("The match's language is not clear enough to switch: keep the saved language baseline and let any code-switching remain natural.");
    }
  } else {
    parts.push("Keep the user's fixed or manually overridden language choices rather than switching languages automatically.");
  }
  if (cues.repeatedSenderLaughter) {
    parts.push("The sender already used a laugh filler in recent outgoing messages. Do NOT put any laugh token in this reply. Vary openings instead of repeating the same 'haha' pattern.");
  } else {
    parts.push("At most one natural laugh token in this reply, only if genuinely fitting; never put it at the start by habit.");
  }
  return parts.join(" ");
}

/** Removes formulaic repeated standalone laugh tokens, not actual joke text. */
export function limitReplyLaughter(reply: string, cues: ReplyStyleCues): string {
  let used = 0;
  const result = reply.replace(LAUGH, match => {
    if (cues.repeatedSenderLaughter || used++ >= 1) return "";
    return match;
  });
  return result
    .replace(/[^\S\n]{2,}/g, " ")
    .replace(/[ \t]+([,.])/g, "$1")
    .replace(/^[ \t]+|[ \t]+$/gm, "")
    .trim();
}

/** Parses extension snapshots without using "Me:" as match-language evidence. */
export function readLabeledReplyHistory(context: string): ReplyStyleMessage[] {
  return context.split("\n").slice(-40).flatMap(line => {
    const match = /^\s*(them|match|incoming|elle|lui|me|you|moi|outgoing)\s*:\s*(.+)$/i.exec(line);
    if (!match) return [];
    return [{ direction: /^(me|you|moi|outgoing)$/i.test(match[1]) ? "outgoing" as const : "incoming" as const, text: match[2].slice(0, 1200) }];
  });
}
