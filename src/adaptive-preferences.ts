/** Baselines are user identity; adaptation is an independent, opt-out behavior. */
export const ADAPTIVE_FIELDS = ["messageLength", "directness", "teasingStyle", "humorStyle", "doubleTexting", "languages"] as const;
export type AdaptiveField = typeof ADAPTIVE_FIELDS[number];
export type AutoAdaptFlags = Record<AdaptiveField, boolean>;
export type StyleBaseline = Record<Exclude<AdaptiveField, "languages">, string>;
export const DEFAULT_BASELINE: StyleBaseline = {
  messageLength: "short",
  directness: "balanced",
  teasingStyle: "light",
  humorStyle: "playful",
  doubleTexting: "sometimes"
};
export const DEFAULT_LANGUAGE_STYLES = { fr: "casual", en: "casual", darija: "natural" } as const;
export const DEFAULT_LANGUAGE_WEIGHTS = { fr: 45, darija: 40, en: 15 } as const;
export const DEFAULT_AUTO_ADAPT: AutoAdaptFlags = {
  messageLength: true, directness: true, teasingStyle: true, humorStyle: true, doubleTexting: true, languages: true
};
export function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
/**
 * Migration: previous "auto-adaptive" enum becomes a baseline + enabled flag.
 * Explicit legacy fixed enum remains fixed; never change an existing user's decision.
 */
export function parseStyleBaseline(source: unknown): { baseline: StyleBaseline; autoAdapt: AutoAdaptFlags } {
  const value = asObject(source), storedFlags = asObject(value.autoAdapt);
  const baseline = { ...DEFAULT_BASELINE };
  const autoAdapt = { ...DEFAULT_AUTO_ADAPT };
  for (const key of ADAPTIVE_FIELDS) {
    if (key === "languages") continue;
    const current = value[key];
    if (typeof current === "string" && current !== "auto-adaptive" && current.trim()) {
      baseline[key] = current;
      autoAdapt[key] = false;
    }
  }
  for (const key of ADAPTIVE_FIELDS) {
    if (typeof storedFlags[key] === "boolean") autoAdapt[key] = storedFlags[key] as boolean;
  }
  return { baseline, autoAdapt };
}
