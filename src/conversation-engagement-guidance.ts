/** Conversation engagement advice is style guidance, not a score on the person
 * or authorization to send another message.
 */
export interface EngagementMessage { direction: "incoming" | "outgoing"; text: string }
const words = (value: string) => value.trim().split(/\s+/).filter(Boolean).length;
function closedReply(value: string): boolean {
  const text = value.trim();
  if (!text || text.includes("?") || text.length > 35 || words(text) > 5) return false;
  return true;
}
export function engagementConversationGuidance(messages: readonly EngagementMessage[]): string {
  const recent = messages.slice(-12);
  const latest = recent.at(-1);
  if (latest?.direction !== "incoming") return "";
  // A question or a stated boundary must always take precedence.
  if (latest.text.includes("?") || /(?:stop|laisse.moi|pas interesse|not interested|don't|arrete|non merci)/i.test(latest.text)) return "";
  const incoming = recent.filter(item => item.direction === "incoming").slice(-4);
  if (incoming.length < 3 || incoming.filter(item => closedReply(item.text)).length < 3) return "";
  return [
    "Recent incoming replies are repeatedly short/closed. This is NOT proof of disinterest and is not permission to chase them.",
    "If a reply is appropriate and allowed, respond to what was said first, then optionally offer ONE low-pressure fresh angle connected to their interests or the shared chat; avoid another generic interview question.",
    "Do not force enthusiasm, flirtation, guilt or repeated follow-ups. If the match does not engage, it is fine to leave space rather than prolong the exchange."
  ].join(" ");
}
