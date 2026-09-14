import type { PersonalMemoryReviewDraft } from "./personal-memory-review";

export interface PersonalMemoryRecord {
  id: string;
  originalText: string;
  structuredAnalysis: {
    title: string;
    category: string;
    summary: string;
    immutableFacts: string[];
    topics: string[];
    conversationHooks: string[];
    sensitivity: PersonalMemoryReviewDraft["sensitivity"];
    allowedForChat: boolean;
    creativeFreedom: PersonalMemoryReviewDraft["creativeFreedom"];
  };
  reviewStatus: PersonalMemoryReviewDraft["reviewStatus"];
  approvedAt: string | null;
  lastUsedAt: string | null;
  usageCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface PersonalMemoryLibraryItem {
  id: string;
  draft: PersonalMemoryReviewDraft;
  usageCount: number;
  lastUsedAt: string | null;
  approvedAt: string | null;
  updatedAt: string;
}

export function toPersonalMemoryLibraryItem(record: PersonalMemoryRecord): PersonalMemoryLibraryItem {
  return {
    id: record.id,
    draft: {
      originalText: record.originalText,
      title: record.structuredAnalysis.title,
      category: record.structuredAnalysis.category,
      summary: record.structuredAnalysis.summary,
      immutableFacts: [...record.structuredAnalysis.immutableFacts],
      topics: [...record.structuredAnalysis.topics],
      conversationHooks: [...record.structuredAnalysis.conversationHooks],
      sensitivity: record.structuredAnalysis.sensitivity,
      allowedForChat: record.structuredAnalysis.allowedForChat,
      creativeFreedom: record.structuredAnalysis.creativeFreedom,
      reviewStatus: record.reviewStatus
    },
    usageCount: Math.max(0, Math.floor(record.usageCount)),
    lastUsedAt: record.lastUsedAt,
    approvedAt: record.approvedAt,
    updatedAt: record.updatedAt
  };
}

export function sortPersonalMemoryLibrary(items: PersonalMemoryLibraryItem[]): PersonalMemoryLibraryItem[] {
  return [...items].sort((left, right) => {
    if (left.draft.reviewStatus !== right.draft.reviewStatus) {
      return left.draft.reviewStatus === "draft" ? -1 : 1;
    }
    return safeTime(right.updatedAt) - safeTime(left.updatedAt);
  });
}

export function describePersonalMemoryUsage(item: PersonalMemoryLibraryItem): string {
  if (item.usageCount === 0) return "Not used in a conversation yet";
  const count = `${item.usageCount} use${item.usageCount === 1 ? "" : "s"}`;
  if (!item.lastUsedAt) return count;
  const timestamp = safeTime(item.lastUsedAt);
  return timestamp ? `${count} · last used ${new Date(timestamp).toLocaleDateString()}` : count;
}

function safeTime(value: string): number {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : 0;
}
