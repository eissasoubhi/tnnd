export type UserConversationIdentity = { label: string | null; age: number | null };

export function parseUserConversationIdentity(value: unknown): UserConversationIdentity {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid_conversation_identity");
  const input = value as Record<string, unknown>;
  if (typeof input.label !== "string" || input.label.length > 100) throw new Error("invalid_conversation_identity");
  const label = input.label.replace(/\s+/g, " ").trim();
  if (label.length > 80 || /[\x00-\x1f\x7f]/.test(label)) throw new Error("invalid_conversation_identity");
  const rawAge = input.age;
  const age = rawAge === "" || rawAge === null || rawAge === undefined ? null : Number(rawAge);
  if (age !== null && (!Number.isInteger(age) || age < 18 || age > 120)) throw new Error("invalid_conversation_identity");
  return { label: label || null, age };
}
