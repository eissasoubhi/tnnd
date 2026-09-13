import { readSession } from "./auth-client";
import { applyTextingStyleAnalysisResponse } from "./texting-style-analysis-adapter";
import type { TextingStyleLearningDraft } from "./texting-style-learning";

const apiBase = (import.meta.env.VITE_TNND_API_BASE_URL as string | undefined)?.replace(/\/$/, "") ?? "http://127.0.0.1:4000";

export interface AnalyzeTextingStyleOptions {
  retainSourceExamples?: boolean;
}

export interface AnalyzeTextingStyleResult {
  draft: TextingStyleLearningDraft;
  model: string;
  retainedSourceExamples: boolean;
}

export class TextingStyleAnalysisApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "TextingStyleAnalysisApiError";
  }
}

export async function analyzeTextingStyle(
  draft: TextingStyleLearningDraft,
  options: AnalyzeTextingStyleOptions = {}
): Promise<AnalyzeTextingStyleResult> {
  const session = readSession();
  if (!session) throw new TextingStyleAnalysisApiError("authentication_required", 401);

  const response = await fetch(`${apiBase}/api/v1/profile/texting-style/analyze`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${session.token}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      examples: draft.sourceExamples,
      retainSourceExamples: options.retainSourceExamples === true
    })
  });

  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = payload && typeof payload === "object" && !Array.isArray(payload)
      ? (payload as { error?: unknown }).error
      : null;
    throw new TextingStyleAnalysisApiError(
      typeof error === "string" && error ? error : "texting_style_analysis_failed",
      response.status
    );
  }

  try {
    return applyTextingStyleAnalysisResponse(draft, payload);
  } catch (error) {
    throw new TextingStyleAnalysisApiError(
      error instanceof Error ? error.message : "invalid_style_analysis_response",
      502
    );
  }
}
