import type { AnalyzedTopic } from "./conversation-topic-service.js";

export interface ConversationTopicAnalysisResult {
  topics: AnalyzedTopic[];
  model: string;
}

function configuredModel(): string {
  return (process.env.GEMINI_MODEL ?? "gemini-2.5-flash").trim() || "gemini-2.5-flash";
}

function responseText(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const candidates = (value as { candidates?: unknown }).candidates;
  if (!Array.isArray(candidates)) return "";
  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== "object") continue;
    const parts = (candidate as { content?: { parts?: unknown } }).content?.parts;
    if (!Array.isArray(parts)) continue;
    const text = parts.map((part) => part && typeof part === "object" && typeof (part as { text?: unknown }).text === "string" ? (part as { text: string }).text : "").join("").trim();
    if (text) return text;
  }
  return "";
}

function parseTopics(value: unknown): AnalyzedTopic[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("gemini_invalid_topic_analysis");
  const topics = (value as { topics?: unknown }).topics;
  if (!Array.isArray(topics) || topics.length < 1 || topics.length > 6) throw new Error("gemini_invalid_topic_analysis");
  return topics.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("gemini_invalid_topic_analysis");
    const topic = (item as { topic?: unknown }).topic;
    const subtopic = (item as { subtopic?: unknown }).subtopic;
    const confidence = (item as { confidence?: unknown }).confidence;
    if (typeof topic !== "string" || !topic.trim() || topic.length > 120 || typeof confidence !== "number" || !Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
      throw new Error("gemini_invalid_topic_analysis");
    }
    if (subtopic != null && (typeof subtopic !== "string" || subtopic.length > 120)) throw new Error("gemini_invalid_topic_analysis");
    return { topic: topic.trim(), ...(typeof subtopic === "string" && subtopic.trim() ? { subtopic: subtopic.trim() } : {}), confidence };
  });
}

export async function analyzeConversationTopicsWithGemini(messages: string[]): Promise<ConversationTopicAnalysisResult> {
  const normalized = messages.map((message) => message.trim()).filter(Boolean).slice(-12);
  if (!normalized.length || normalized.some((message) => message.length > 4000)) throw new Error("invalid_topic_messages");
  const apiKey = (process.env.GEMINI_API_KEY ?? "").trim();
  if (!apiKey) throw new Error("gemini_not_configured");
  const model = configuredModel();
  const prompt = `Analyze the current conversation topics for TNND. Return JSON only: {"topics":[{"topic":"broad category","subtopic":"optional specific subject","confidence":0.0}]}. Return 1 to 6 topics ordered primary first. A message may belong to multiple topics. Keep broad topics stable (travel, work, hobbies, food, relationships, music, sport, weekend plans, family, etc.) while allowing useful specific subtopics. Do not infer private facts beyond the supplied messages.\n\nMESSAGES:\n${normalized.join("\n")}`;
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 600, responseMimeType: "application/json" }
    })
  });
  if (!response.ok) throw new Error(`gemini_provider_error:${response.status}`);
  const text = responseText(await response.json());
  if (!text) throw new Error("gemini_empty_response");
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { throw new Error("gemini_invalid_json"); }
  return { topics: parseTopics(parsed), model };
}
