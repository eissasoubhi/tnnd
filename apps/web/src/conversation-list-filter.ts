import type { ConversationListItem, ConversationStatus, ConversationStageTag, ConversationToneTag } from "./conversation-contract";

export type ConversationSort = "recent" | "oldest" | "longest" | "waiting";
export type ConversationLength = "all" | "first-messages" | "developing" | "long";
export type ContactFilter = "all" | "instagram" | "whatsapp" | "any" | "user-instagram" | "user-whatsapp" | "user-any";

export interface ConversationSearchCriteria {
  status: ConversationStatus | "all";
  query: string;
  sort?: ConversationSort;
  ageMin?: number | null;
  ageMax?: number | null;
  cities?: readonly string[];
  datingGoal?: string;
  matchContact?: ContactFilter;
  length?: ConversationLength;
  semanticStage?: ConversationStageTag | "all" | "unknown";
  semanticTone?: ConversationToneTag | "all" | "unknown";
  /** Authenticated server-side search returns only matching conversation IDs. */
  messageSearchIds?: readonly string[] | null;
}

export function filterConversationSummaries(
  items: readonly ConversationListItem[],
  criteria: ConversationSearchCriteria
): ConversationListItem[] {
  const normalize = (value: string): string =>
    value.normalize("NFKD").replace(/\p{M}/gu, "").toLocaleLowerCase().trim();
  const terms = normalize(criteria.query).split(/\s+/).filter(Boolean);
  const cities = (criteria.cities ?? []).map(normalize).filter(Boolean);
  const matchedIds = criteria.messageSearchIds == null ? null : new Set(criteria.messageSearchIds);
  const count = (item: ConversationListItem) => item.messageCount ?? 0;
  const date = (item: ConversationListItem) => {
    const timestamp = Date.parse(item.lastMessageAt ?? "");
    return Number.isFinite(timestamp) ? timestamp : null;
  };
  const sort = criteria.sort ?? "recent";
  return items.filter((item) => {
    if (criteria.status !== "all" && item.status !== criteria.status) return false;
    if (matchedIds && !matchedIds.has(item.id)) return false;
    if (criteria.ageMin != null && (item.matchAge == null || item.matchAge < criteria.ageMin)) return false;
    if (criteria.ageMax != null && (item.matchAge == null || item.matchAge > criteria.ageMax)) return false;
    if (cities.length && (!item.matchCity || !cities.includes(normalize(item.matchCity)))) return false;
    if (criteria.datingGoal && normalize(item.matchDatingGoal ?? "") !== normalize(criteria.datingGoal)) return false;
    if (criteria.semanticStage && criteria.semanticStage !== "all" && (item.semanticStage ?? "unknown") !== criteria.semanticStage) return false;
    if (criteria.semanticTone && criteria.semanticTone !== "all" && (item.semanticTone ?? "unknown") !== criteria.semanticTone) return false;
    if (criteria.matchContact === "instagram" && !item.matchSharedInstagram) return false;
    if (criteria.matchContact === "whatsapp" && !item.matchSharedWhatsapp) return false;
    if (criteria.matchContact === "any" && !item.matchSharedInstagram && !item.matchSharedWhatsapp) return false;
    if (criteria.matchContact === "user-instagram" && !item.userSharedInstagram) return false;
    if (criteria.matchContact === "user-whatsapp" && !item.userSharedWhatsapp) return false;
    if (criteria.matchContact === "user-any" && !item.userSharedInstagram && !item.userSharedWhatsapp) return false;
    if (criteria.length === "first-messages" && count(item) > 4) return false;
    if (criteria.length === "developing" && (count(item) < 5 || count(item) > 19)) return false;
    if (criteria.length === "long" && count(item) < 20) return false;
    if (!terms.length) return true;
    const searchable = normalize([item.displayName, item.currentTopic ?? ""].join(" "));
    return terms.every((term) => searchable.includes(term));
  }).sort((a,b) => {
    if (sort === "longest") return count(b) - count(a) || (date(b) ?? 0) - (date(a) ?? 0);
    if (sort === "waiting") {
      const urgency = (item: ConversationListItem) => item.status === "active" && item.lastMessageDirection === "incoming"
        ? 2 : item.status === "waiting-for-user" ? 1 : 0;
      return urgency(b) - urgency(a) || (date(b) ?? 0) - (date(a) ?? 0);
    }
    const aDate = date(a), bDate = date(b);
    if (aDate === null && bDate !== null) return 1;
    if (bDate === null && aDate !== null) return -1;
    return sort === "oldest" ? (aDate ?? 0) - (bDate ?? 0) : (bDate ?? 0) - (aDate ?? 0);
  });
}
