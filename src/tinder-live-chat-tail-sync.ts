import type { VisibleTinderMessage } from "./tinder-manual-import";

/** Only an exact, currently visible, bounded transcript may be persisted.
 * Imported messages never convey permission to send or change AI management.
 */
export function validateLiveChatTail(input: unknown): VisibleTinderMessage[] | null {
  if (!Array.isArray(input) || !input.length || input.length > 12) return null;
  const result: VisibleTinderMessage[] = [];
  const seen = new Set<string>();
  for (const item of input) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return null;
    const m = item as Record<string, unknown>;
    if (typeof m.key !== "string" || !/^[a-z0-9_-]{1,128}$/i.test(m.key) ||
        seen.has(m.key) || (m.direction !== "me" && m.direction !== "them") ||
        typeof m.text !== "string" || !m.text.trim() || m.text.length > 4000) return null;
    seen.add(m.key);
    result.push({ key:m.key, direction:m.direction, text:m.text });
  }
  return result.at(-1)?.direction === "them" ? result : null;
}
