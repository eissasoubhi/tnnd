import type { ConversationManagementRecord } from "./conversation-management-client";
import type { ConversationListItem } from "./conversation-contract";

/** Bulk operation is an explicit one-time enrollment of already synced chats.
 * No automatic "all future chats" authorization and no Tinder message send. */
export interface ExistingChatBulkPlan {
  eligible: string[];
  resume: string[];
  skipped: { manual: number; archived: number; blocked: number; unsynced: number; disabled: number };
}

export function planExistingChatTakeover(
  management: readonly ConversationManagementRecord[],
  summaries: readonly ConversationListItem[]
): ExistingChatBulkPlan {
  const byId = new Map(summaries.map(item => [item.id, item]));
  const result: ExistingChatBulkPlan = {
    eligible: [], resume: [],
    skipped: { manual: 0, archived: 0, blocked: 0, unsynced: 0, disabled: 0 }
  };
  for (const record of management) {
    const chat = byId.get(record.conversationId);
    if (!chat || record.syncHealth.state !== "synced" || !chat.lastMessageAt) {
      result.skipped.unsynced++; continue;
    }
    if (record.managementState === "manual") { result.skipped.manual++; continue; }
    if (record.managementState === "archived" || record.managementState === "moved-off-tinder"
        || chat.status === "archived" || chat.status === "moved-off-tinder") {
      result.skipped.archived++; continue;
    }
    if (record.humanActionBlock?.blocked || chat.pendingHumanActions > 0 || chat.status === "action-required" || chat.status === "waiting-for-user") {
      result.skipped.blocked++; continue;
    }
    if (chat.status === "disabled") { result.skipped.disabled++; continue; }
    // An existing AI-managed chat can be resumed without changing its ownership.
    if (record.managementState !== "ai-managed" || !record.explicitlySelected) result.eligible.push(record.conversationId);
    if (chat.status === "paused") result.resume.push(record.conversationId);
  }
  return result;
}
