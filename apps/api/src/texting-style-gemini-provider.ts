export interface TextingStyleAnalysis {
  formality: "casual" | "balanced" | "formal";
  capitalization: "lowercase" | "mixed" | "standard";
  punctuationDensity: "low" | "medium" | "high";
  emojiFrequency: "none" | "low" | "medium" | "high";
  abbreviationFrequency: "low" | "medium" | "high";
  slangLevel: "low" | "medium" | "high";
  messageLength: "short" | "medium" | "long";
  sentenceStyle: "fragments" | "mixed" | "sentences";
  grammarStyle: "casual" | "mixed" | "standard";
  questionFrequency: "low" | "medium" | "high";
  teasingStyle: "none" | "light" | "playful";
  humorStyle: "none" | "light" | "playful";
  directness: "subtle" | "balanced" | "direct";
  doubleTexting: "avoid" | "sometimes" | "comfortable";
  languageNotes: { fr: string; darija: string; en: string };
}

const choices = <T extends string>(value: unknown, allowed: readonly T[]): T => {
  if (typeof value !== "string" || !allowed.includes(value as T)) throw new Error("invalid_texting_style_response");
  return value as T;
};

function responseText(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const candidates = (value as { candidates?: unknown }).candidates;
  if (!Array.isArray(candidates)) return "";
  for (const candidate of candidates) {
    const parts = candidate && typeof candidate === "object" ? (candidate as { content?: { parts?: unknown } }).content?.parts : undefined;
    if (!Array.isArray(parts)) continue;
    const text = parts.map((part) => part && typeof part === "object" && typeof (part as { text?: unknown }).text === "string" ? (part as { text: string }).text : "").join("").trim();
    if (text) return text;
  }
  return "";
}

export function parseTextingStyleAnalysis(raw: string): TextingStyleAnalysis {
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid_texting_style_response");
  const v = parsed as Record<string, unknown>;
  const notes = v.languageNotes;
  if (!notes || typeof notes !== "object" || Array.isArray(notes)) throw new Error("invalid_texting_style_response");
  const n = notes as Record<string, unknown>;
  if ([n.fr, n.darija, n.en].some((x) => typeof x !== "string")) throw new Error("invalid_texting_style_response");
  return {
    formality: choices(v.formality, ["casual", "balanced", "formal"]),
    capitalization: choices(v.capitalization, ["lowercase", "mixed", "standard"]),
    punctuationDensity: choices(v.punctuationDensity, ["low", "medium", "high"]),
    emojiFrequency: choices(v.emojiFrequency, ["none", "low", "medium", "high"]),
    abbreviationFrequency: choices(v.abbreviationFrequency, ["low", "medium", "high"]),
    slangLevel: choices(v.slangLevel, ["low", "medium", "high"]),
    messageLength: choices(v.messageLength, ["short", "medium", "long"]),
    sentenceStyle: choices(v.sentenceStyle, ["fragments", "mixed", "sentences"]),
    grammarStyle: choices(v.grammarStyle, ["casual", "mixed", "standard"]),
    questionFrequency: choices(v.questionFrequency, ["low", "medium", "high"]),
    teasingStyle: choices(v.teasingStyle, ["none", "light", "playful"]),
    humorStyle: choices(v.humorStyle, ["none", "light", "playful"]),
    directness: choices(v.directness, ["subtle", "balanced", "direct"]),
    doubleTexting: choices(v.doubleTexting, ["avoid", "sometimes", "comfortable"]),
    languageNotes: { fr: String(n.fr).slice(0, 500), darija: String(n.darija).slice(0, 500), en: String(n.en).slice(0, 500) }
  };
}

export async function analyzeTextingStyle(examples: string[]): Promise<TextingStyleAnalysis> {
  const normalized = examples.map((x) => x.trim()).filter(Boolean).slice(0, 50).map((x) => x.slice(0, 2000));
  if (!normalized.length) throw new Error("texting_style_examples_required");
  const apiKey = (process.env.GEMINI_API_KEY ?? "").trim();
  if (!apiKey) throw new Error("gemini_not_configured");
  const model = (process.env.GEMINI_MODEL ?? "gemini-2.5-flash").trim() || "gemini-2.5-flash";
  const prompt = [
    "Analyze only the author's texting style from the supplied user-authored message examples. Do not extract or repeat personal facts, names, contact details, locations, dates, credentials, or message content.",
    "Return JSON only with these keys and enum values: formality casual|balanced|formal; capitalization lowercase|mixed|standard; punctuationDensity low|medium|high; emojiFrequency none|low|medium|high; abbreviationFrequency low|medium|high; slangLevel low|medium|high; messageLength short|medium|long; sentenceStyle fragments|mixed|sentences; grammarStyle casual|mixed|standard; questionFrequency low|medium|high; teasingStyle none|light|playful; humorStyle none|light|playful; directness subtle|balanced|direct; doubleTexting avoid|sometimes|comfortable; languageNotes {fr,darija,en}.",
    "Language notes must describe linguistic behavior only and must not quote the source messages.",
    `Examples JSON: ${JSON.stringify(normalized)}`
  ].join("\n\n");
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { temperature: 0.1, maxOutputTokens: 1000, responseMimeType: "application/json" } })
  });
  if (!response.ok) throw new Error(`gemini_provider_error:${response.status}`);
  const raw = responseText(await response.json());
  if (!raw) throw new Error("gemini_empty_response");
  return parseTextingStyleAnalysis(raw);
}
