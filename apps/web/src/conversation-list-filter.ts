import type { ConversationListItem, ConversationStatus } from "./conversation-contract";

export interface ConversationSearchCriteria {
  status: ConversationStatus | "all";
  query: string;
}

/** Search only the list's public summary fields; never index private message bodies. */
export function filterConversationSummaries(
  items: readonly ConversationListItem[],
  criteria: ConversationSearchCriteria
): ConversationListItem[] {
  const normalize = (value: string): string =>
    value.normalize("NFKD").replace(/\p{M}/gu, "").toLocaleLowerCase().trim();

  const terms = normalize(criteria.query).split(/\s+/).filter(Boolean);
  return items.filter((item) => {
    if (criteria.status !== "all" && item.status !== criteria.status) return false;
    if (!terms.length) return true;
    const searchable = normalize([item.displayName, item.currentTopic ?? ""].join(" "));
    return terms.every((term) => searchable.includes(term));
  });
}
