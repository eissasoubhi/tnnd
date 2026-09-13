export const MAX_TEXTING_STYLE_EXAMPLE_CHARS = 12_000;
export const MAX_TEXTING_STYLE_FIELD_CHARS = 80;

export const textingStyleAnalysisFields = [
  "datingGoal",
  "disclosureStrategy",
  "formality",
  "capitalization",
  "emojiFrequency",
  "abbreviations",
  "messageLength",
  "punctuationDensity",
  "slangLevel",
  "fragmentStyle",
  "grammarStyle",
  "directness",
  "questionFrequency",
  "teasingStyle",
  "humorStyle",
  "doubleTexting",
  "frenchStyle",
  "darijaStyle",
  "englishStyle"
] as const;

export type TextingStyleAnalysisField = typeof textingStyleAnalysisFields[number];
export type TextingStyleAnalysis = Record<TextingStyleAnalysisField, string>;

export interface TextingStyleAnalysisRequest {
  examples: string;
  retainSourceExamples: boolean;
}

export type TextingStyleAnalysisRequestValidation =
  | { ok: true; value: TextingStyleAnalysisRequest }
  | { ok: false; error: "examples_required" | "examples_too_large" | "invalid_retain_source_examples" };

export type TextingStyleAnalysisValidation =
  | { ok: true; value: TextingStyleAnalysis }
  | { ok: false; error: "invalid_analysis"; field?: TextingStyleAnalysisField };

export function validateTextingStyleAnalysisRequest(body: Record<string, unknown>): TextingStyleAnalysisRequestValidation {
  if (typeof body.examples !== "string" || !body.examples.trim()) {
    return { ok: false, error: "examples_required" };
  }
  const examples = body.examples.replace(/\r\n/g, "\n").trim();
  if (examples.length > MAX_TEXTING_STYLE_EXAMPLE_CHARS) {
    return { ok: false, error: "examples_too_large" };
  }
  if (body.retainSourceExamples !== undefined && typeof body.retainSourceExamples !== "boolean") {
    return { ok: false, error: "invalid_retain_source_examples" };
  }
  return {
    ok: true,
    value: {
      examples,
      retainSourceExamples: body.retainSourceExamples === true
    }
  };
}

export function validateTextingStyleAnalysis(value: unknown): TextingStyleAnalysisValidation {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, error: "invalid_analysis" };
  }
  const source = value as Record<string, unknown>;
  const analysis = {} as TextingStyleAnalysis;
  for (const field of textingStyleAnalysisFields) {
    const raw = source[field];
    if (typeof raw !== "string") return { ok: false, error: "invalid_analysis", field };
    const normalized = raw.trim();
    if (!normalized || normalized.length > MAX_TEXTING_STYLE_FIELD_CHARS) {
      return { ok: false, error: "invalid_analysis", field };
    }
    analysis[field] = normalized;
  }
  return { ok: true, value: analysis };
}

export function buildTextingStyleAnalysisPrompt(examples: string): string {
  return [
    "Analyze the user's own texting examples and return only structured JSON.",
    "Infer writing tendencies, not personal facts. Do not invent biography, dating history, identity, or intent.",
    "Every field must be a short descriptive label suitable for review and editing by the user.",
    `Required fields: ${textingStyleAnalysisFields.join(", ")}.`,
    "Examples:",
    examples
  ].join("\n\n");
}
