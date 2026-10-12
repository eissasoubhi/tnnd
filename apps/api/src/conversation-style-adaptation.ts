import type { ConversationOverrides } from "./conversation-overrides.js";

/**
 * Cheap, deterministic per-conversation style guidance.
 * Global and chat explicit settings take precedence; no extra AI call or durable
 * mutation. The latest incoming message is weighted with recent interlocutor text.
 */
export interface StyleMessage { direction: "incoming" | "outgoing"; text: string }
export interface AdaptedStyle { settings: ConversationOverrides; autoFields: string[] }

type ProfileStyle = Record<string, unknown>;
const messages = (history: StyleMessage[], latest: string): string[] => {
  const incoming = history.filter(item => item.direction === "incoming").slice(-8).map(item => item.text.trim()).filter(Boolean);
  if (latest.trim() && incoming.at(-1) !== latest.trim()) incoming.push(latest.trim());
  return incoming.slice(-8);
};
const explicitStyle = (value: unknown): value is string => typeof value === "string" && value !== "auto-adaptive" && value.length > 0;
const has = (value: number | string | undefined): boolean => value !== undefined;
function medianLength(texts: string[]): number {
  if (!texts.length) return 0;
  const lengths = texts.map(text => [...text].length).sort((a, b) => a - b);
  return lengths[Math.floor((lengths.length - 1) / 2)];
}
function mappedDirectness(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100) return value;
  if (value === "soft") return 25;
  if (value === "balanced") return 50;
  if (value === "direct") return 75;
  if (value === "very-direct") return 90;
  return undefined;
}
function mappedHumor(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100) return value;
  if (value === "dry") return 30;
  if (value === "playful") return 60;
  if (value === "witty" || value === "mixed") return 65;
  return undefined;
}
export function resolveAdaptiveStyle(
  settings: ConversationOverrides,
  globalStyle: ProfileStyle = {},
  history: StyleMessage[] = [],
  latestIncoming = ""
): AdaptedStyle {
  const texts = messages(history, latestIncoming);
  const median = medianLength(texts);
  const jokeRate = texts.length ? texts.filter(text => /\b(lol|haha+|hihi+|mdr|ptdr|jaja)\b|[😂🤣😆😜😉]/iu.test(text)).length / texts.length : 0;
  const questionRate = texts.length ? texts.filter(text => /[?？؟]/u.test(text)).length / texts.length : 0;
  const consecutiveIncoming = history.slice(-4).reduceRight((n, message) => n >= 0 && message.direction === "incoming" ? n + 1 : -1, 0);
  const computed = {
    messageLength: !texts.length ? "short" : median <= 30 ? "very-short" : median >= 140 ? "medium" : "short",
    directness: questionRate >= 0.5 ? 65 : 50,
    teasingStyle: jokeRate >= 0.4 && texts.length >= 2 ? "playful" : jokeRate > 0 ? "light" : "none",
    humorLevel: jokeRate >= 0.4 && texts.length >= 2 ? 70 : jokeRate > 0 ? 50 : 25,
    doubleTexting: consecutiveIncoming >= 2 ? "sometimes" : "avoid"
  } as const;
  const next: ConversationOverrides = { ...settings };
  const autoFields: string[] = [];
  const set = <K extends keyof typeof computed>(key: K, fixed: unknown, allowed?: readonly string[]) => {
    if (has(next[key] as number | string | undefined)) return;
    const isValid = explicitStyle(fixed) && (!allowed || allowed.includes(fixed));
    (next as Record<string, unknown>)[key] = isValid ? fixed : computed[key];
    if (!isValid) autoFields.push(key);
  };
  set("messageLength", globalStyle.messageLength, ["very-short", "short", "medium"]);
  if (!has(next.directness)) {
    const manual = globalStyle.directness !== "auto-adaptive" ? mappedDirectness(globalStyle.directness) : undefined;
    next.directness = manual ?? computed.directness;
    if (manual === undefined) autoFields.push("directness");
  }
  set("teasingStyle", globalStyle.teasingStyle, ["none", "light", "playful", "bold"]);
  if (!has(next.humorLevel)) {
    const manual = globalStyle.humorStyle !== "auto-adaptive" ? mappedHumor(globalStyle.humorStyle) : undefined;
    next.humorLevel = manual ?? computed.humorLevel;
    if (manual === undefined) autoFields.push("humorLevel");
  }
  set("doubleTexting", globalStyle.doubleTexting, ["avoid", "sometimes", "comfortable"]);
  return { settings: next, autoFields };
}
