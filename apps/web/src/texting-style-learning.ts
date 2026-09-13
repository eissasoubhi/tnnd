import type { EditablePreferences } from "./profile-preferences";

export const MAX_STYLE_EXAMPLE_CHARS = 12_000;

export interface TextingStyleLearningDraft {
  sourceExamples: string;
  retainSourceExamples: boolean;
  analysis: EditablePreferences | null;
  reviewed: boolean;
  approved: boolean;
}

export function createTextingStyleLearningDraft(): TextingStyleLearningDraft {
  return {
    sourceExamples: "",
    retainSourceExamples: false,
    analysis: null,
    reviewed: false,
    approved: false
  };
}

export function normalizeStyleExamples(value: string): string {
  return value.replace(/\r\n/g, "\n").trim().slice(0, MAX_STYLE_EXAMPLE_CHARS);
}

export function setStyleExamples(
  draft: TextingStyleLearningDraft,
  sourceExamples: string,
  retainSourceExamples = draft.retainSourceExamples
): TextingStyleLearningDraft {
  return {
    ...draft,
    sourceExamples: normalizeStyleExamples(sourceExamples),
    retainSourceExamples,
    analysis: null,
    reviewed: false,
    approved: false
  };
}

export function setStyleAnalysis(
  draft: TextingStyleLearningDraft,
  analysis: EditablePreferences
): TextingStyleLearningDraft {
  return {
    ...draft,
    analysis: { ...analysis },
    reviewed: false,
    approved: false
  };
}

export function editStyleAnalysis(
  draft: TextingStyleLearningDraft,
  patch: Partial<EditablePreferences>
): TextingStyleLearningDraft {
  if (!draft.analysis) throw new Error("style_analysis_missing");
  return {
    ...draft,
    analysis: { ...draft.analysis, ...patch },
    reviewed: false,
    approved: false
  };
}

export function markStyleAnalysisReviewed(draft: TextingStyleLearningDraft): TextingStyleLearningDraft {
  if (!draft.analysis) throw new Error("style_analysis_missing");
  return { ...draft, reviewed: true, approved: false };
}

export function approveStyleAnalysis(draft: TextingStyleLearningDraft): TextingStyleLearningDraft {
  if (!draft.analysis) throw new Error("style_analysis_missing");
  if (!draft.reviewed) throw new Error("style_analysis_review_required");
  return { ...draft, approved: true };
}

export function approvedStylePreferences(draft: TextingStyleLearningDraft): EditablePreferences | null {
  if (!draft.analysis || !draft.reviewed || !draft.approved) return null;
  return { ...draft.analysis };
}

export function styleAnalysisRequest(draft: TextingStyleLearningDraft): {
  examples: string;
  retainSourceExamples: boolean;
} | null {
  const examples = normalizeStyleExamples(draft.sourceExamples);
  if (!examples) return null;
  return { examples, retainSourceExamples: draft.retainSourceExamples };
}
