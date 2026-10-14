/** Pure UX state helpers shared by the conversation list and its tests. */
export function hasConversationFilters(query: string, status: string): boolean {
  return Boolean(query.trim()) || status !== "all";
}

export function conversationEmptyState(total: number, filtered: boolean): { heading: string; guidance: string } {
  if (total === 0) {
    return {
      heading: "No conversations synced yet",
      guidance: "On Tinder, open a conversation and choose Import visible chat (read-only) in the TNND extension. Then refresh this page."
    };
  }
  if (filtered) {
    return {
      heading: "No matching conversations",
      guidance: "Try another name or status, or choose Clear filters to see your conversations."
    };
  }
  return {
    heading: "No conversations available",
    guidance: "Refresh the list or check that your TNND account is connected."
  };
}

/** Ignore out-of-order responses and results from a previous signed-in account. */
export function isCurrentConversationResponse(
  requestId: number,
  latestRequestId: number,
  requestToken: string,
  activeToken?: string | null
): boolean {
  return requestId === latestRequestId && Boolean(requestToken) && requestToken === activeToken;
}
