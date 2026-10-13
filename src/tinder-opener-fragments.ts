/** One AI-generated opener is a *single* explicitly authorized act. It can
 * be rendered as two or three Tinder bubbles, not two/three independently
 * generated alternatives. Never turn unverified admiration into a send.
 */
const UNVERIFIED_PROFILE_REACTION =
  /\b(?:profil|profile|bio|photo|photos|sourire|smile|regard|look|yeux|eyes|style|vibe)\b|\b(?:tu\s+(?:as|m.as)\s+l.air|t.as\s+l.air|you\s+(?:seem|look))\b|\b(?:j.ai\s+(?:vu|remarqu[eé]|ador[eé]|kiff[eé]|flash[eé]|aim[eé])|je\s+suis\s+tomb[eé]|(?:m.a|m.as|me\s+fait)\s+(?:sourire|rire)|i\s+(?:love|liked|noticed|saw)\s+your)\b/i;

const DEFAULT_FRAGMENTS = ["Salut", "Bien ou bien ?"] as const;

function normalizedForRules(text: string): string {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function fragmentsFromText(value: string): string[] {
  // Gemini returns one string; formatting and sentence boundaries, rather than
  // the number of Gemini alternatives, determine actual Tinder bubbles.
  const parts = value.replace(/\r/g, "").replace(/^\s*(?:[-*]|\d+[.)])\s+/gm, "")
    .split(/\n+|(?<=[?!])\s+(?=\S)|(?<=\.)\s+(?=[A-ZÀ-Ý])/u)
    .map((part) => part.trim()).filter(Boolean);
  return parts.flatMap((part) => {
    const greeting = /^(salut|salam|bonjour|bonsoir|hello|hey|coucou|yo|slt)\s*[,!:;–—-]\s+(.+)$/i.exec(part);
    return greeting ? [greeting[1], greeting[2]] : [part];
  });
}

function safeFragment(value: string): boolean {
  const content = value.trim();
  if (!content || content.length > 140 || /[{}\[\]]/.test(content)) return false;
  const norm = normalizedForRules(content);
  return !UNVERIFIED_PROFILE_REACTION.test(norm);
}

/** Intentionally conservative: if Gemini invents an impression or sends an
 * unsplittable paragraph, use the approved neutral two-bubble opener instead.
 * Never silently send a fabricated profile claim to compensate for the length.
 */
export function groundedOpenerFragments(raw: string): string[] {
  const candidates = fragmentsFromText(raw)
    .map((part) => part.replace(/^["'“”]+|["'“”]+$/g, "").trim())
    .filter(safeFragment);
  const deduped = candidates.filter((fragment, index) =>
    candidates.findIndex(other => normalizedForRules(other) === normalizedForRules(fragment)) === index);
  if (deduped.length < 2) return [...DEFAULT_FRAGMENTS];
  return deduped.slice(0, 3);
}

/** Used after the delay, just before sending the next bubble. Another person
 * replying or Tinder failing to show our previous bubble cancels the burst.
 */
export function sameOpenerThreadUninterrupted(
  messages: readonly { direction: "me" | "them"; text: string }[],
  previousPart: string
): boolean {
  const latest = messages.at(-1);
  return latest?.direction === "me" && latest.text.trim() === previousPart.trim();
}
