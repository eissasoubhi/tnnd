export interface IdentityStructuredAnalysis {
  summary: string;
  stableFacts: string[];
  interests: string[];
  lifestyle: string[];
  preferences: string[];
  personalityTraits: string[];
  conversationTopics: string[];
  avoidTopics: string[];
}

function text(value: unknown, field: string, max: number): string {
  if (typeof value !== "string") throw new Error(`invalid_identity_${field}`);
  const normalized = value.trim();
  if (!normalized || normalized.length > max) throw new Error(`invalid_identity_${field}`);
  return normalized;
}

function list(value: unknown, field: string, maxItems: number, maxItem: number): string[] {
  if (!Array.isArray(value) || value.length > maxItems) throw new Error(`invalid_identity_${field}`);
  return value.map((item) => text(item, field, maxItem));
}

export function normalizeIdentitySource(value: unknown): string {
  if (typeof value !== "string") throw new Error("invalid_identity_source");
  const normalized = value.trim();
  if (!normalized || normalized.length > 20_000) throw new Error("invalid_identity_source");
  return normalized;
}

export function parseIdentityStructuredAnalysis(value: unknown): IdentityStructuredAnalysis {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid_identity_analysis");
  const input = value as Record<string, unknown>;
  return {
    summary: text(input.summary, "summary", 1200),
    stableFacts: list(input.stableFacts, "stable_facts", 30, 220),
    interests: list(input.interests, "interests", 20, 120),
    lifestyle: list(input.lifestyle, "lifestyle", 20, 160),
    preferences: list(input.preferences, "preferences", 20, 160),
    personalityTraits: list(input.personalityTraits, "personality_traits", 20, 120),
    conversationTopics: list(input.conversationTopics, "conversation_topics", 20, 120),
    avoidTopics: list(input.avoidTopics, "avoid_topics", 20, 120)
  };
}
