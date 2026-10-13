/**
 * Defensive boundary for old/stale API instances that still return Gemini's
 * JSON envelope in generation.text. Never present or copy a partial object.
 */
export function cleanDraftText(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) throw new Error("gemini_invalid_output");
  let text = value.trim();
  for (let attempt = 0; attempt < 3; attempt++) {
    const cleaned = text.replace(/^\x60{3}(?:json)?\s*/i, "").replace(/\s*\x60{3}$/, "").trim();
    if (!/^\{\s*"/.test(cleaned)) {
      // A broken object must not be displayed as a reply either.
      if (cleaned.startsWith('{"') || cleaned.startsWith("{\\\"")) throw new Error("gemini_invalid_output");
      return cleaned;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      throw new Error("gemini_invalid_output");
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("gemini_invalid_output");
    const extracted = (parsed as { text?: unknown }).text;
    if (typeof extracted !== "string" || !extracted.trim()) throw new Error("gemini_invalid_output");
    text = extracted.trim();
  }
  throw new Error("gemini_invalid_output");
}
