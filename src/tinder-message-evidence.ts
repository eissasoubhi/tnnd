export type TinderMessageDirection = "me" | "them" | "unknown";

/**
 * Tinder elements sometimes include generic accessibility text like "Sent at
 * 12:02" or "sender", including on RECEIVED messages. These words do not
 * identify who wrote a message. Only explicit directional tokens qualify.
 */
export function directionFromTinderHints(hints: readonly string[]): TinderMessageDirection {
  const normalized = hints.join(" ").toLowerCase().replace(/[^a-z0-9_-]+/g, " ");
  const tokens = normalized.split(/\s+/).filter(Boolean);
  const outgoing = tokens.some(token =>
    /^(outgoing|from-me|my-message|mine|chat-bubble-send|message-outgoing|msg-outgoing|msg--sent)$/.test(token));
  const incoming = tokens.some(token =>
    /^(incoming|from-match|from-them|received|receiver|chat-bubble-receive|message-incoming|msg--received)$/.test(token));
  if (outgoing === incoming) return "unknown";
  return outgoing ? "me" : "them";
}

export function visibleTranscriptSummary(messages: readonly {direction:"me" | "them"; text: string}[]): {
  received: number;
  sent: number;
  last: "me" | "them" | null;
} {
  return {
    received: messages.filter(message => message.direction === "them").length,
    sent: messages.filter(message => message.direction === "me").length,
    last: messages.at(-1)?.direction ?? null
  };
}
