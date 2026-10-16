/**
 * Conversation pragmatics: local, inexpensive writing guidance from verified
 * message order. This never authorizes sends, invents profile details,
 * schedules follow-ups or tries to score the interlocutor.
 */
export interface PragmaticMessage {
  direction: "incoming" | "outgoing";
  text: string;
}

function normalize(value: string): string {
  return value.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/gu, " ").trim();
}

function isInterviewComplaint(value: string): boolean {
  const text = normalize(value);
  return /(?:hsit|hssit|7sit|7ssit|hassit).{0,28}(?:interview|entretien|interrogatoire)/u.test(text)
    || /(?:on dirait|c'est|cest|tu fais|j'ai l'impression|je me sens|i feel like).{0,45}(?:interview|entretien|interrogatoire|questionnaire)/u.test(text)
    || /(?:trop|bcp|beaucoup|so many|too many).{0,14}(?:questions|questions d'embauche)/u.test(text);
}

function isDefensiveFeedback(value: string): boolean {
  const text = normalize(value);
  return /(?:pourquoi|pq|pk|why|3lach).{0,65}(?:invent|excuse|ment|mytho|lying|making.{0,8}up)/u.test(text)
    || /(?:comme si|as if|on dirait).{0,42}(?:j.?invent|je ment|c.?etait une excuse|i.?m lying|making.{0,8}up)/u.test(text)
    || /(?:tu me crois pas|tu penses que je mens|are you calling me a liar)/u.test(text);
}

function isVulnerableDisclosure(value: string): boolean {
  const text = normalize(value);
  return /(?:copine|amie|meilleure amie).{0,35}(?:mari|marie|married)/u.test(text)
    || /(?:je me retrouve|je suis|i feel|i've been).{0,26}(?:solo|seule|seul|lonely|alone)/u.test(text)
    || /(?:je sors|i go out|on sort).{0,22}(?:moins|rarement|plus beaucoup|less)/u.test(text)
    || /(?:me manque|i miss|sentir seule|feeling lonely)/u.test(text);
}

function requestsArabic(value: string): boolean {
  const text = normalize(value);
  return /(?:^|\b)(?:dwi|hdar|thdar|tkellem|tekklem|parle|parlez|speak).{0,18}(?:b\s*(?:arbia|3arbia|3arbiya|l3arbia|darija)|arabe|arabic|darija)(?:\b|$)/u.test(text)
    || /(?:هدر|تكلم|دوي).{0,18}(?:بالعربية|بالدارجة)/u.test(value);
}

function lastIncoming(messages: readonly PragmaticMessage[], override: string): string {
  if (override.trim()) return override.trim();
  const last = messages.at(-1);
  return last?.direction === "incoming" ? last.text.trim() : "";
}

/**
 * Priorities: direct criticism and hurt feelings beat flirting, humor and
 * conversation flow. The matched person's laugh never proves an invitation
 * to tease. Explicit language requests beat generic detection when adaptable.
 */
export function conversationPragmaticsGuidance(
  messages: readonly PragmaticMessage[],
  latestIncoming = "",
  autoLanguage = true
): string {
  const current = lastIncoming(messages, latestIncoming);
  const outgoing = messages.filter(message => message.direction === "outgoing").slice(-6);
  const recentOutgoingQuestions = outgoing.slice(-4).filter(message => /[?؟]/u.test(message.text)).length;
  const recentCliche = outgoing.some(message => /\b(?:le fameux|la fameuse|les fameux|les fameuses)\b/iu.test(message.text));
  const parts = [
    "Avoid canned opening formulas such as 'le fameux', 'la fameuse', 'ah le fameux', 'ah je vois', 'classique' or repeated 'du coup'. Do not repeat a signature opener across messages. React specifically to what they said rather than forcing a joke, a label about their personality or a new interview question. A natural response may contain no question."
  ];
  if (recentCliche) {
    parts.push("You recently used 'le fameux/la fameuse' yourself: do not use either expression again in this conversation. Keep phrasing varied without swapping it for another stock catchphrase.");
  }
  if (recentOutgoingQuestions >= 3) {
    parts.push("Several recent outgoing messages were questions. Reduce the question frequency now: reply to the current point with a brief observation or appropriate self-disclosure grounded in known facts. Do not request yet another topic or personal detail.");
  }
  if (!current) return parts.join(" ");
  if (isDefensiveFeedback(current)) {
    parts.push("Priority: the match feels judged or disbelieved by your previous wording. Own the clumsy implication briefly and sincerely, clarify that you did not mean they were making excuses, and stop teasing. Do not defend the joke, blame them, question their sincerity or pivot straight into a new question.");
  } else if (isInterviewComplaint(current)) {
    parts.push("Priority: the match explicitly feels interviewed. Acknowledge this with a short, unforced apology and genuinely stop asking questions for the next turn. Do NOT say 'raconte un truc random sur toi', 'tell me about yourself', 'and you?' or any other disguised request for more personal details. Offer only a brief, true observation or allow the exchange to breathe.");
  } else if (isVulnerableDisclosure(current)) {
    parts.push("The match shared a personal change that may feel isolating (friends, marriage, going out less). First acknowledge their experience with warmth. They did not give an excuse: do not frame it as a cliché, disappearing friends, a made-up explanation, or something to be corrected. Even if 'hh' accompanies it, treat it as softening the disclosure, not consent to a joke at their expense. Ask a gentle follow-up only if natural; a short empathetic statement alone is fine.");
  }
  if (requestsArabic(current)) {
    if (autoLanguage) {
      parts.push("The match explicitly asked to speak Arabic ('Dwi b arbia'). This takes priority over language percentages: switch to natural Moroccan Darija in their script (Latin here), with short everyday phrases; do not produce a contrived French/Latin/Arabic salad or announce 'now I speak Darija'. Avoid forced transliteration and elaborate poetic wording.");
    } else {
      parts.push("The match explicitly requested Arabic. Respect the user's manually locked language settings, but do not pretend that an unrelated French reply fulfills the request.");
    }
  }
  return parts.join(" ");
}

/** Local copy-edit for a repeated canned lead-in, without another model call.
 * Intentionally only removes the ornamental adjective, not the substantive text.
 */
export function removeCannedFameuxOpening(reply: string): string {
  return reply.replace(/^(\s*(?:(?:ah|oh)[,\s!]*)?(?:le|la|les)\s+)fameu(?:x|se|ses)\b/iu, "$1");
}
