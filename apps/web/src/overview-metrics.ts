import type { ConversationListItem } from "./conversation-contract";

export interface OverviewCounts {
  active: number;
  waitingForThem: number;
  actionRequired: number;
  paused: number;
}
export function countOverviewStatuses(items: ConversationListItem[]): OverviewCounts {
  return {
    active: items.filter(i => i.status === "active").length,
    waitingForThem: items.filter(i => i.status === "waiting-for-them").length,
    actionRequired: items.filter(i => i.status === "action-required" || i.status === "waiting-for-user" || i.pendingHumanActions > 0).length,
    paused: items.filter(i => i.status === "paused").length
  };
}
