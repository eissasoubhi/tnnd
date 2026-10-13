/** User-visible labels come only from a saved, conversation-linked MatchProfile.
 * Never infer a person's name or age from a route ID or image URL. */
export function matchIdentity(firstName: unknown, age: unknown): { name: string | null; age: number | null } {
  const name = typeof firstName === "string" ? firstName.replace(/\s+/g, " ").trim().slice(0, 80) : "";
  const numericAge = typeof age === "number" || (typeof age === "string" && /^\d{2,3}$/.test(age)) ? Number(age) : NaN;
  return {
    name: name || null,
    age: Number.isInteger(numericAge) && numericAge >= 18 && numericAge <= 120 ? numericAge : null
  };
}
export function conversationDisplayName(id: string, firstName: unknown): string {
  return matchIdentity(firstName, null).name ?? `Conversation ${id.slice(0, 8)}`;
}
