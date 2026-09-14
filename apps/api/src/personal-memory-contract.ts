export type PersonalMemorySensitivity = "low" | "medium" | "high";
export type PersonalMemoryCreativeFreedom = "strict" | "natural" | "storyteller";

export interface PersonalMemoryStructuredAnalysis {
  title: string;
  category: string;
  summary: string;
  immutableFacts: string[];
  topics: string[];
  conversationHooks: string[];
  sensitivity: PersonalMemorySensitivity;
  allowedForChat: boolean;
  creativeFreedom: PersonalMemoryCreativeFreedom;
}

export class PersonalMemoryContractError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "PersonalMemoryContractError";
  }
}

function requireText(value: unknown, field: string, max: number): string {
  if (typeof value !== "string") throw new PersonalMemoryContractError(`invalid_${field}`);
  const normalized = value.trim();
  if (!normalized || normalized.length > max) throw new PersonalMemoryContractError(`invalid_${field}`);
  return normalized;
}

function requireTextList(value: unknown, field: string, maxItems: number, maxItemLength: number): string[] {
  if (!Array.isArray(value) || value.length > maxItems) throw new PersonalMemoryContractError(`invalid_${field}`);
  return value.map((item) => requireText(item, field, maxItemLength));
}

export function parsePersonalMemoryStructuredAnalysis(value: unknown): PersonalMemoryStructuredAnalysis {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new PersonalMemoryContractError("invalid_analysis");
  }
  const input = value as Record<string, unknown>;
  const sensitivity = input.sensitivity;
  if (sensitivity !== "low" && sensitivity !== "medium" && sensitivity !== "high") {
    throw new PersonalMemoryContractError("invalid_sensitivity");
  }
  const creativeFreedom = input.creativeFreedom;
  if (creativeFreedom !== "strict" && creativeFreedom !== "natural" && creativeFreedom !== "storyteller") {
    throw new PersonalMemoryContractError("invalid_creative_freedom");
  }
  if (typeof input.allowedForChat !== "boolean") {
    throw new PersonalMemoryContractError("invalid_allowed_for_chat");
  }

  return {
    title: requireText(input.title, "title", 160),
    category: requireText(input.category, "category", 80),
    summary: requireText(input.summary, "summary", 1000),
    immutableFacts: requireTextList(input.immutableFacts, "immutable_facts", 30, 500),
    topics: requireTextList(input.topics, "topics", 20, 80),
    conversationHooks: requireTextList(input.conversationHooks, "conversation_hooks", 20, 300),
    sensitivity,
    allowedForChat: input.allowedForChat,
    creativeFreedom
  };
}
