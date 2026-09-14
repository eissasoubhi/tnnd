export type PersonalMemorySensitivity = "low" | "medium" | "high";
export type PersonalMemoryCreativeFreedom = "strict" | "natural" | "storyteller";

export interface PersonalMemoryReviewDraft {
  originalText: string;
  title: string;
  category: string;
  summary: string;
  immutableFacts: string[];
  topics: string[];
  conversationHooks: string[];
  sensitivity: PersonalMemorySensitivity;
  allowedForChat: boolean;
  creativeFreedom: PersonalMemoryCreativeFreedom;
  reviewStatus: "draft" | "approved";
}

export type PersonalMemoryEditableField = "title" | "category" | "summary";

export function updatePersonalMemoryTextField(
  draft: PersonalMemoryReviewDraft,
  field: PersonalMemoryEditableField,
  value: string
): PersonalMemoryReviewDraft {
  const max = field === "title" ? 160 : field === "category" ? 80 : 1000;
  return { ...draft, [field]: value.slice(0, max), reviewStatus: "draft" };
}

export function updatePersonalMemoryList(
  draft: PersonalMemoryReviewDraft,
  field: "immutableFacts" | "topics" | "conversationHooks",
  value: string
): PersonalMemoryReviewDraft {
  const maxItems = field === "immutableFacts" ? 30 : 20;
  const maxLength = field === "topics" ? 80 : field === "immutableFacts" ? 500 : 300;
  const items = value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, maxItems)
    .map((item) => item.slice(0, maxLength));
  return { ...draft, [field]: items, reviewStatus: "draft" };
}

export function canApprovePersonalMemoryDraft(draft: PersonalMemoryReviewDraft): boolean {
  return Boolean(
    draft.originalText.trim()
    && draft.title.trim()
    && draft.category.trim()
    && draft.summary.trim()
    && draft.immutableFacts.length
  );
}

export function approvePersonalMemoryDraft(draft: PersonalMemoryReviewDraft): PersonalMemoryReviewDraft {
  if (!canApprovePersonalMemoryDraft(draft)) throw new Error("Complete the grounded memory fields before approval.");
  return { ...draft, reviewStatus: "approved" };
}
