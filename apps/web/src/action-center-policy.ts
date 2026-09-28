export type HumanActionSeverity = "info" | "action-required" | "decision-required" | "urgent";
export type HumanActionStatus = "pending" | "completed" | "ignored";
export type HumanActionSeverityFilter = "all" | HumanActionSeverity;

export interface HumanActionItem {
  id: string;
  conversationRef?: string | null;
  conversationLabel: string;
  title: string;
  detail: string;
  severity: HumanActionSeverity;
  status: HumanActionStatus;
  context?: Record<string, unknown>;
  createdAt: string;
}

export type PersistedManualAnswer = {
  answer: string;
  source: "user-manual-answer";
  providedAt: string;
  deliveryState: "not-sent";
};

const severityPriority: Record<HumanActionSeverity, number> = {
  urgent: 4,
  "decision-required": 3,
  "action-required": 2,
  info: 1
};

export function getPersistedManualAnswer(item: HumanActionItem): PersistedManualAnswer | null {
  const value = item.context?.manualAnswer;
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const answer = value as Record<string, unknown>;
  if (typeof answer.answer !== "string" || !answer.answer.trim()) return null;
  if (answer.source !== "user-manual-answer" || answer.deliveryState !== "not-sent") return null;
  if (typeof answer.providedAt !== "string" || Number.isNaN(Date.parse(answer.providedAt))) return null;
  return { answer: answer.answer, source: "user-manual-answer", providedAt: answer.providedAt, deliveryState: "not-sent" };
}

export function sortPendingHumanActions(items: HumanActionItem[]): HumanActionItem[] {
  return items.filter((item) => item.status === "pending").sort((left, right) => {
    const severityDelta = severityPriority[right.severity] - severityPriority[left.severity];
    if (severityDelta !== 0) return severityDelta;
    const rightTime = Date.parse(right.createdAt);
    const leftTime = Date.parse(left.createdAt);
    return (Number.isFinite(rightTime) ? rightTime : 0) - (Number.isFinite(leftTime) ? leftTime : 0);
  });
}

export function filterPendingHumanActions(items: HumanActionItem[], filter: HumanActionSeverityFilter): HumanActionItem[] {
  const pending = sortPendingHumanActions(items);
  return filter === "all" ? pending : pending.filter((item) => item.severity === filter);
}

export function humanActionPausesConversation(item: HumanActionItem): boolean {
  return Boolean(item.conversationRef)
    && (item.severity === "urgent" || item.severity === "decision-required" || item.severity === "action-required");
}
