import { analyzeTextingStyleWithGemini } from "./texting-style-analysis-provider.js";
import { validateTextingStyleAnalysisRequest } from "./texting-style-analysis.js";

export interface TextingStyleAnalysisHttpResult {
  status: number;
  body: Record<string, unknown>;
}

export async function handleTextingStyleAnalysisRequest(
  body: Record<string, unknown>
): Promise<TextingStyleAnalysisHttpResult> {
  const validated = validateTextingStyleAnalysisRequest(body);
  if (!validated.ok) {
    return { status: 400, body: { error: validated.error } };
  }

  try {
    const result = await analyzeTextingStyleWithGemini(validated.value.examples);
    return {
      status: 200,
      body: {
        analysis: result.analysis,
        model: result.model,
        sourceExamplesRetention: {
          requested: validated.value.retainSourceExamples,
          persisted: false
        }
      }
    };
  } catch (error) {
    const code = error instanceof Error ? error.message : "texting_style_analysis_failed";
    if (code === "gemini_not_configured") {
      return { status: 503, body: { error: code } };
    }
    if (code.startsWith("gemini_provider_error:")) {
      return { status: 502, body: { error: "gemini_provider_error" } };
    }
    if (code === "gemini_empty_response" || code === "gemini_invalid_json" || code.startsWith("gemini_invalid_analysis")) {
      return { status: 502, body: { error: code } };
    }
    return { status: 500, body: { error: "texting_style_analysis_failed" } };
  }
}
