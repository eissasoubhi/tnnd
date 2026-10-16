/** Deterministic social-contact extraction; never infer a handle from a name.
 * Context may be across Tinder bubbles. The caller validates sender direction.
 * Never use detected contacts for automatic external messaging.
 */
export type SocialPlatform = "instagram" | "snapchat" | "telegram" | "whatsapp" | "phone";
export interface SocialContactFound { platform: SocialPlatform; value: string; }
const ask = (value: string) => {
  const text = value.toLowerCase();
  if (/\b(?:instagram|insta|ig)\b/.test(text)) return "instagram";
  if (/\b(?:snapchat|snap)\b/.test(text)) return "snapchat";
  if (/\b(?:telegram|tg)\b/.test(text)) return "telegram";
  if (/\b(?:whatsapp|whats ?app)\b/.test(text)) return "whatsapp";
  if (/\b(?:num[eé]ro|t[eé]l[eé]phone|phone number)\b/.test(text)) return "phone";
  return null;
};
const handle = (raw: string): string | null => {
  const cleaned = raw.trim().replace(/^@/, "");
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{2,29}$/.test(cleaned)) return null;
  if (!/[a-zA-Z]/.test(cleaned) || /^(?:oui|non|salut|hello|ok|merci|daccord|paris|casa|casablanca|rabat|yes)$/i.test(cleaned)) return null;
  return cleaned;
};
export function detectSocialContact(
  incomingText: string,
  preceding: ReadonlyArray<{ direction: "incoming" | "outgoing"; text: string }>
): SocialContactFound | null {
  const text = incomingText.trim().slice(0, 512);
  if (!text) return null;
  const context = preceding.slice(-5);
  const explicit = ask(text);
  if (explicit === "whatsapp" || explicit === "phone") {
    const number = /(?:^|[^0-9])([+]?[0-9][0-9\s().-]{6,24})/.exec(text)?.[1]?.trim();
    const cleaned = number?.replace(/[\s().-]/g, "") ?? "";
    if (/^\+?[0-9]{7,15}$/.test(cleaned)) return { platform: explicit, value: cleaned };
  }
  if (explicit) {
    const afterLabel = text.replace(/^.*?\b(?:instagram|insta|ig|snapchat|snap|telegram|tg|whatsapp|whats ?app)\b\s*(?:[:?=\-]|c.est|c'est|mon|my|@)?\s*/i, "");
    const token = /^@?([a-zA-Z0-9][a-zA-Z0-9._-]{2,29})(?:\s|$)/.exec(afterLabel);
    if (token) {
      const result = handle(token[1]);
      if (result) return { platform: explicit, value: result };
    }
  }
  const asked = [...context].reverse().find(item => ask(item.text))?.text ?? "";
  const platform = ask(asked);
  if (!platform) return null;
  // The contact can be alone in the next bubble, not necessarily preceded
  // by "@" or by a platform name in that same bubble.
  if (platform === "phone" || platform === "whatsapp") {
    const number = /^\+?[0-9][0-9 \-().]{6,24}$/.test(text) ? text.replace(/[ \-().]/g, "") : null;
    if (number && /^\+?[0-9]{7,15}$/.test(number)) return { platform, value: number };
    if (platform === "phone") return null;
  }
  const candidate = handle(text);
  return candidate ? { platform, value: candidate } : null;
}
