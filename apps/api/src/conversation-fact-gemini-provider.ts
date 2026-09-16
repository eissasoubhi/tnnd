import type { ConversationFactInput, ConversationFactSubject } from "./conversation-fact-service.js";

export interface ConversationFactMessageInput {
  id: string;
  direction: "incoming" | "outgoing";
  text: string;
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

function isSubject(value: unknown): value is ConversationFactSubject {
  return value === "match" || value === "user" || value === "shared";
}

function parseFacts(raw: string, allowedMessageIds: Set<string>): ConversationFactInput[] {
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid_conversation_fact_response");
  const facts = (parsed as { facts?: unknown }).facts;
  if (!Array.isArray(facts)) throw new Error("invalid_conversation_fact_response");
  return facts.slice(0, 30).flatMap((value): ConversationFactInput[] => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return [];
    const input = value as Record<string, unknown>;
    if (!isSubject(input.subject)) return [];
    if (typeof input.key !== "string" || !input.key.trim()) return [];
    if (typeof input.value !== "string" || !input.value.trim()) return [];
    if (typeof input.confidence !== "number" || !Number.isFinite(input.confidence)) return [];
    if (!Array.isArray(input.sourceMessageIds)) return [];
    const sourceMessageIds = [...new Set(input.sourceMessageIds.filter((id): id is string => typeof id === "string" && allowedMessageIds.has(id)))];
    if (!sourceMessageIds.length) return [];
    return [{
      subject: input.subject,
      key: input.key,
      value: input.value,
      confidence: Math.max(0, Math.min(1, input.confidence)),
      sourceMessageIds
    }];
  });
}

export async function analyzeConversationFacts(messages: ConversationFactMessageInput[]): Promise<ConversationFactInput[]> {
  const normalized = messages
    .filter((message) => message.id.trim() && message.text.trim())
    .slice(-30)
    .map((message) => ({ id: message.id, direction: message.direction, text: message.text.trim().slice(0, 1500) }));
  if (!normalized.length) return [];
  const apiKey = (process.env.GEMINI_API_KEY ?? "").trim();
  if (!apiKey) throw new Error("gemini_not_configured");
  const model = configuredModel();
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const prompt = [
    "Extract only durable facts explicitly stated in these dating-chat messages for future conversational continuity.",
    "Do not infer unstated facts. Do not store exact addresses, phone/social handles, payment/financial details, salary, health information, passwords, credentials, or other high-sensitivity data.",
    "Use subject=match for facts about the other person, user for facts the user explicitly stated about themselves, and shared for mutually established plans/preferences.",
    "Use a short stable semantic key such as city, likes-hiking, weekend-plan. A fact must cite at least one exact supplied message id that directly supports it.",
    "If a later message clearly updates the same fact, use the same semantic key with the newer value. Return no speculative facts.",
    "Return JSON only: {\"facts\":[{\"subject\":\"match|user|shared\",\"key\":\"...\",\"value\":\"...\",\"confidence\":0.0,\"sourceMessageIds\":[\"...\"]}]}",
    `Messages JSON: ${JSON.stringify(normalized)}`
  ].join("\n\n");
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 1200, responseMimeType: "application/json" }
    })
  });
  if (!response.ok) throw new Error(`gemini_provider_error:${response.status}`);
  const payload: unknown = await response.json();
  const raw = responseText(payload);
  if (!raw) throw new Error("gemini_empty_response");
  return parseFacts(raw, new Set(normalized.map((message) => message.id)));
}
