import type { ConversationOverrides } from "./conversation-overrides.js";
import { DEFAULT_LANGUAGE_WEIGHTS, parseStyleBaseline } from "../../../src/adaptive-preferences.js";
import { detectMatchLanguage } from "../../../src/conversation-reply-style.js";

export interface StyleMessage { direction: "incoming" | "outgoing"; text: string }
export interface AdaptedStyle {
  settings: ConversationOverrides;
  autoFields: string[];
  reasons: Record<string, string>;
}
type Language = "fr" | "darija" | "en";
type LanguageWeights = Record<Language, number>;
const LIMIT = 8;
const languageKeys: Language[] = ["fr", "darija", "en"];
const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
function incomingMessages(history: StyleMessage[], latest: string): string[] {
  const incoming = history.filter(m => m.direction === "incoming").slice(-LIMIT).map(m => m.text.trim()).filter(Boolean);
  if (latest.trim() && incoming.at(-1) !== latest.trim()) incoming.push(latest.trim());
  return incoming.slice(-LIMIT);
}
function medianLength(values: string[]): number {
  const lengths = values.map(s => [...s].length).sort((a, b) => a - b);
  return lengths.length ? lengths[Math.floor((lengths.length - 1) / 2)] : 0;
}
function directness(value: string): number {
  return ({ soft: 25, balanced: 50, direct: 75, "very-direct": 90 } as Record<string, number>)[value] ?? 50;
}
function humor(value: string): number {
  return ({ dry: 30, playful: 60, witty: 65, mixed: 60 } as Record<string, number>)[value] ?? 60;
}
function normalizeWeights(source: Partial<Record<Language, number>>): LanguageWeights {
  const safe = languageKeys.map(k => Number.isFinite(source[k]) ? clamp(source[k]!, 0, 100) : 0);
  const total = safe.reduce((a,b)=>a+b,0);
  if (!total) return { ...DEFAULT_LANGUAGE_WEIGHTS };
  const fr = Math.round(safe[0] * 100 / total), darija = Math.round(safe[1] * 100 / total);
  return { fr, darija, en: 100 - fr - darija };
}
function adaptLanguages(messages: string[], baseline: LanguageWeights): LanguageWeights {
  if (messages.length < 2) return baseline;
  const samples = messages.map(detectMatchLanguage).filter((x): x is Language => x !== "unknown");
  if (samples.length < 2) return baseline;
  const counts: LanguageWeights = { fr: 0, darija: 0, en: 0 };
  for (const lang of samples) counts[lang]++;
  // The last incoming turn matters more than older exchanges when a match
  // changes language mid-chat; a single isolated foreign word is insufficient.
  const latest = detectMatchLanguage(messages.at(-1) ?? "");
  if (latest !== "unknown") counts[latest] += 2;
  const observed = normalizeWeights(counts);
  const weight = clamp(samples.length / 6, 0, latest !== "unknown" ? 0.78 : 0.65);
  return normalizeWeights({
    fr: (1-weight)*baseline.fr + weight*observed.fr,
    darija: (1-weight)*baseline.darija + weight*observed.darija,
    en: (1-weight)*baseline.en + weight*observed.en
  });
}
/**
 * Values are derived per generation. The approved profile's baseline and explicit
 * chat overrides stay untouched. Adaptation is gradual and reversible.
 */
export function resolveAdaptiveStyle(
  settings: ConversationOverrides,
  globalStyle: Record<string, unknown> = {},
  history: StyleMessage[] = [],
  latestIncoming = "",
  chatLockedFields: readonly string[] = [],
  baselineLanguages: Partial<LanguageWeights> = DEFAULT_LANGUAGE_WEIGHTS
): AdaptedStyle {
  const { baseline, autoAdapt } = parseStyleBaseline(globalStyle);
  const texts = incomingMessages(history, latestIncoming);
  const enough = texts.length >= 2;
  const serious = texts.length > 0 && /\b(sorry for your loss|grief|died|hospital|ill|funeral|deuil|décès|malade|triste|urgence|difficult|stressed|anxious)\b|وفاة|مريض|حزين/iu.test(texts.at(-1)!);
  const jokeRate = texts.length ? texts.filter(t => /\b(lol|haha+|hihi+|h{3,}|mdr|ptdr|jaja)\b|[😂🤣😆😜😉]/iu.test(t)).length/texts.length : 0;
  const questionRate = texts.length ? texts.filter(t => /[?？؟]/u.test(t)).length/texts.length : 0;
  const lastIncomingRun = history.slice(-4).reverse().findIndex(m => m.direction === "outgoing");
  const consecutiveIncoming = lastIncomingRun === -1 ? history.slice(-4).filter(m=>m.direction==="incoming").length : lastIncomingRun;
  const values: ConversationOverrides = { ...settings };
  const autoFields: string[] = [], reasons: Record<string,string> = {};
  const fixed = (key: string): boolean => chatLockedFields.includes(key);
  const apply = (key: string, baselineValue: string | number, adaptedValue: string | number, rationale: string) => {
    if (fixed(key)) { reasons[key] = "manual chat override"; return; }
    const flag = key === "humorLevel" ? "humorStyle" : key;
    const auto = autoAdapt[flag as keyof typeof autoAdapt];
    (values as Record<string,unknown>)[key] = auto ? adaptedValue : baselineValue;
    reasons[key] = auto ? rationale : "fixed baseline";
    if (auto) autoFields.push(key);
  };
  const lengths = ["very-short","short","medium"] as const;
  const startLen = lengths.indexOf(baseline.messageLength as typeof lengths[number]);
  const originalLen = startLen < 0 ? 1 : startLen;
  const observedLen = medianLength(texts) <= 30 ? 0 : medianLength(texts) >= 140 ? 2 : 1;
  const stepLen = !enough ? originalLen : clamp(observedLen, originalLen-1, originalLen+1);
  apply("messageLength", lengths[originalLen], lengths[stepLen], enough ? "recent message lengths" : "insufficient evidence; baseline");
  const baseDirect = directness(baseline.directness);
  const adjustedDirect = enough ? clamp(baseDirect + (questionRate >= 0.55 ? 12 : questionRate < 0.2 ? -8 : 0), 0, 100) : baseDirect;
  apply("directness", baseDirect, adjustedDirect, enough ? "question rhythm" : "insufficient evidence; baseline");
  const teasingOptions = ["none","light","playful","bold"] as const;
  const startTeasing = Math.max(0, teasingOptions.indexOf(baseline.teasingStyle as typeof teasingOptions[number]));
  const teasingShift = serious ? -3 : !enough ? 0 : jokeRate >= 0.5 ? 1 : jokeRate === 0 && texts.length >= 3 ? -1 : 0;
  apply("teasingStyle", teasingOptions[startTeasing], teasingOptions[clamp(startTeasing + teasingShift, 0, 3)], serious ? "sensitive conversation" : enough ? "reciprocal humor" : "baseline");
  const baseHumor = humor(baseline.humorStyle);
  const adjustedHumor = serious ? Math.min(20,baseHumor) : !enough ? baseHumor : clamp(baseHumor + (jokeRate >= 0.5 ? 12 : jokeRate === 0 && texts.length >= 3 ? -15 : 0), 0, 85);
  apply("humorLevel", baseHumor, adjustedHumor, serious ? "sensitive conversation" : enough ? "conversation mood" : "baseline");
  const doubleValues = ["avoid","sometimes","comfortable"] as const;
  const doubleStart = Math.max(0, doubleValues.indexOf(baseline.doubleTexting as typeof doubleValues[number]));
  const doubleTarget = serious ? 0 : enough && consecutiveIncoming >= 2 ? clamp(doubleStart+1,0,2) : doubleStart;
  apply("doubleTexting", doubleValues[doubleStart], doubleValues[doubleTarget], "style only; does not send extra messages");
  const baseWeights = normalizeWeights({ ...DEFAULT_LANGUAGE_WEIGHTS, ...baselineLanguages });
  if (fixed("languages")) reasons.languages = "manual chat override";
  else {
    values.languages = autoAdapt.languages ? adaptLanguages(texts,baseWeights) : baseWeights;
    reasons.languages = autoAdapt.languages ? "recent detected languages; baseline anchored" : "fixed baseline";
    if (autoAdapt.languages) autoFields.push("languages");
  }
  return { settings: values, autoFields, reasons };
}
