export interface ConversationSummaryMessage {
  direction: "incoming" | "outgoing";
  text: string;
}

export interface ConversationSummaryGenerationInput {
  previousSummary?: string;
  messages: ConversationSummaryMessage[];
}

export type ConversationSummaryProvider = (input: ConversationSummaryGenerationInput) => Promise<string>;

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
    const text = parts
      .map((part) => part && typeof part === "object" && typeof (part as { text?: unknown }).text === "string"
        ? (part as { text: string }).text
        : "")
      .join("")
      .trim();
    if (text) return text;
  }
  return "";
}

export const callGeminiConversationSummaryProvider: ConversationSummaryProvider = async (input) => {
  const apiKey = (process.env.GEMINI_API_KEY ?? "").trim();
  if (!apiKey) throw new Error("gemini_not_configured");
  if (!input.messages.length) throw new Error("summary_messages_required");
  const model = configuredModel();
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const prompt = [
    "Summarize this dating conversation for future TNND reply generation.",
    "Preserve established facts, preferences, plans, boundaries, unresolved questions and meaningful topic history. Do not invent facts. Keep it compact and factual.",
    input.previousSummary?.trim() ? `Previous durable summary: ${input.previousSummary.trim()}` : "No previous durable summary exists.",
    `New messages JSON: ${JSON.stringify(input.messages)}`,
    "Return only the updated summary as plain text."
  ].join("\n\n");
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 1200 }
    })
  });
  if (!response.ok) throw new Error(`gemini_provider_error:${response.status}`);
  const payload: unknown = await response.json();
  const summary = responseText(payload).trim();
  if (!summary) throw new Error("gemini_empty_response");
  return summary.slice(0, 12000);
};
