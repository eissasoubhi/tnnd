export const personalMemoryCreativeFreedoms = ["strict", "natural", "storyteller"] as const;
export type PersonalMemoryCreativeFreedom = typeof personalMemoryCreativeFreedoms[number];
export interface PersonalMemoryAnalysis {
  title: string;
  type: string;
  summary: string;
  immutableFacts: string[];
  topics: string[];
  conversationHooks: string[];
  sensitivity: "normal" | "sensitive" | "private";
  allowedForChat: boolean;
  creativeFreedom: PersonalMemoryCreativeFreedom;
}
export function validatePersonalMemoryAnalysis(value: unknown): { ok: boolean; error?: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { ok: false, error: "invalid_personal_memory_analysis" };
  const input = value as Record<string, unknown>;
  if (!Array.isArray(input.immutableFacts) || input.immutableFacts.length === 0) return { ok: false, error: "immutable_facts_required" };
  if (typeof input.allowedForChat !== "boolean") return { ok: false, error: "invalid_allowed_for_chat" };
  if (!personalMemoryCreativeFreedoms.includes(input.creativeFreedom as PersonalMemoryCreativeFreedom)) return { ok: false, error: "invalid_creative_freedom" };
  return { ok: true };
}
