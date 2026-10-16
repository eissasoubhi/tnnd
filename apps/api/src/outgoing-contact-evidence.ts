import { detectSocialContact } from "./social-contact-detector.js";

export interface ContactHistoryBubble {
  direction: "incoming" | "outgoing";
  text: string;
  externalMessageId: string;
}
export interface OutgoingContactEvidence {
  platform: "instagram" | "whatsapp";
  sourceExternalMessageId: string;
}

/**
 * Require high-confidence evidence before flagging an outgoing contact:
 * - a platform-labeled handle/phone in the message itself, or
 * - a distinctive standalone handle/number immediately after an inbound
 *   question about the platform.
 * No contact values appear in event metadata, logs, or CLI output.
 */
export function outgoingContactEvidence(
  message: ContactHistoryBubble,
  previous: ContactHistoryBubble | undefined
): OutgoingContactEvidence | null {
  if (message.direction !== "outgoing" || !message.externalMessageId) return null;
  const text = message.text.trim().slice(0, 512);
  if (!text) return null;
  const candidate = detectSocialContact(text, previous ? [{ direction: previous.direction, text: previous.text }] : []);
  if (!candidate || (candidate.platform !== "instagram" && candidate.platform !== "whatsapp")) return null;
  const label = candidate.platform === "instagram" ? /\b(?:instagram|insta|ig)\b/i : /\b(?:whatsapp|whats\s?app)\b/i;
  const labelPresent = label.test(text);
  const directlyAsked = Boolean(previous?.direction === "incoming" && label.test(previous.text) && /[?؟]|(?:c'est quoi|donne|ton|your|can i have)/i.test(previous.text));
  const hasHandleEvidence = /^@[a-zA-Z0-9][a-zA-Z0-9._-]{2,29}$/.test(text)
    || (/^[a-zA-Z0-9][a-zA-Z0-9._-]{2,29}$/.test(text) && /[0-9._-]/.test(text));
  const hasPhoneEvidence = /^\+?[0-9][0-9 ()-]{6,24}$/.test(text) && /^[+]?[0-9]{7,15}$/.test(text.replace(/[ ()-]/g, ""));
  const labeledValue = candidate.platform === "instagram"
    ? (/\b(?:instagram|insta|ig)\s*[:=]\s*@?[a-zA-Z0-9][a-zA-Z0-9._-]{2,29}(?:\s|$)/i.test(text)
      || (/\b(?:mon|my)\s+(?:instagram|insta|ig)\s+(?:c['’]est|is)\s+@?[a-zA-Z0-9][a-zA-Z0-9._-]{2,29}/i.test(text)
        && (text.includes("@") || /[0-9._-]/.test(candidate.value))))
    : labelPresent && /\+?[0-9][0-9 ()-]{6,24}/.test(text);
  if (!labeledValue && !(directlyAsked && (candidate.platform === "instagram" ? hasHandleEvidence : hasPhoneEvidence))) {
    return null;
  }
  return { platform: candidate.platform, sourceExternalMessageId: message.externalMessageId };
}

/** Pure candidate scan; used by the live sync and an opt-in historical backfill. */
export function outgoingEvidenceFromHistory(
  history: readonly ContactHistoryBubble[],
  knownSourceIds: ReadonlySet<string> = new Set()
): OutgoingContactEvidence[] {
  const found: OutgoingContactEvidence[] = [];
  for (let index = 0; index < history.length; index++) {
    const message = history[index]!;
    const result = outgoingContactEvidence(message, history[index - 1]);
    if (result && !knownSourceIds.has(result.sourceExternalMessageId)) found.push(result);
  }
  return found;
}
