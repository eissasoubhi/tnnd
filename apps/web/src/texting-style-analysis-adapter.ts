import type { EditablePreferences } from "./profile-preferences";
import { setStyleAnalysis, type TextingStyleLearningDraft } from "./texting-style-learning";

const analysisFields = [
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
] as const satisfies readonly (keyof EditablePreferences)[];

export interface TextingStyleAnalysisApiResponse {
  analysis: EditablePreferences;
  model: string;
  retainedSourceExamples: boolean;
}

export function parseTextingStyleAnalysisResponse(value: unknown): TextingStyleAnalysisApiResponse {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid_style_analysis_response");
  const source = value as Record<string, unknown>;
  if (!source.analysis || typeof source.analysis !== "object" || Array.isArray(source.analysis)) {
    throw new Error("invalid_style_analysis_response");
  }
  const rawAnalysis = source.analysis as Record<string, unknown>;
  const analysis = {} as EditablePreferences;
  for (const field of analysisFields) {
    const raw = rawAnalysis[field];
    if (typeof raw !== "string" || !raw.trim()) throw new Error(`invalid_style_analysis_field:${field}`);
    analysis[field] = raw.trim();
  }
  if (typeof source.model !== "string" || !source.model.trim()) throw new Error("invalid_style_analysis_model");
  if (typeof source.retainedSourceExamples !== "boolean") throw new Error("invalid_style_analysis_retention");
  return {
    analysis,
    model: source.model.trim(),
    retainedSourceExamples: source.retainedSourceExamples
  };
}

export function applyTextingStyleAnalysisResponse(
  draft: TextingStyleLearningDraft,
  value: unknown
): { draft: TextingStyleLearningDraft; model: string; retainedSourceExamples: boolean } {
  const response = parseTextingStyleAnalysisResponse(value);
  return {
    draft: setStyleAnalysis(draft, response.analysis),
    model: response.model,
    retainedSourceExamples: response.retainedSourceExamples
  };
}
