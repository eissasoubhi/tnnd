import { getPool } from "./db-client.js";
import { detectMatchLanguage } from "../../../src/conversation-reply-style.js";

export interface AuditMessage { conversationId: string; direction: "incoming" | "outgoing"; text: string }
export interface AuditFinding {
  id: string;
  severity: "attention" | "review" | "info";
  evidence: string;
  recommendation: string;
  suggestedSetting?: { key: string; value: string | number };
}
export interface QualityReport {
  generatedAt: string;
  source: "saved-messages";
  sampleSize: number;
  conversations: number;
  outgoing: number;
  incoming: number;
  sufficientSample: boolean;
  metrics: {
    emojiMessages: number;
    laughterMessages: number;
    veryLongReplies: number;
    formalPhrases: number;
    questions: number;
    comparedLanguages: number;
    differingLanguages: number;
  };
  findings: AuditFinding[];
  cautions: string[];
}
const emojiPattern = /\p{Extended_Pictographic}/u;
const laughPattern = /\b(?:haha+|hihi+|hhh+|mdr|ptdr|lol)\b/iu;
const formalPattern = /\b(?:cordialement|veuillez|je vous prie|je vous remercie|bien cordialement|best regards|sincerely)\b/iu;
const SAMPLE_MAX = 600;
const percent = (n: number, total: number): number => total ? Math.round(100 * n / total) : 0;

/** This is a statistical QA aid, not a probability of AI writing or a success score. */
export function assessSavedMessages(messages: readonly AuditMessage[], date = new Date()): QualityReport {
  const sample = messages.slice(-SAMPLE_MAX);
  const outgoing = sample.filter(m => m.direction === "outgoing");
  const incoming = sample.filter(m => m.direction === "incoming");
  const metrics = {
    emojiMessages: outgoing.filter(m => emojiPattern.test(m.text)).length,
    laughterMessages: outgoing.filter(m => laughPattern.test(m.text)).length,
    veryLongReplies: outgoing.filter(m => [...m.text].length > 240).length,
    formalPhrases: outgoing.filter(m => formalPattern.test(m.text)).length,
    questions: outgoing.filter(m => /[?؟？]/u.test(m.text)).length,
    comparedLanguages: 0,
    differingLanguages: 0
  };
  const lastIncoming = new Map<string, string>();
  for (const m of sample) {
    if (m.direction === "incoming") { lastIncoming.set(m.conversationId, m.text); continue; }
    const previous = lastIncoming.get(m.conversationId);
    if (!previous) continue;
    const previousLanguage = detectMatchLanguage(previous);
    const outgoingLanguage = detectMatchLanguage(m.text);
    if (previousLanguage !== "unknown" && outgoingLanguage !== "unknown") {
      metrics.comparedLanguages++;
      if (previousLanguage !== outgoingLanguage) metrics.differingLanguages++;
    }
    lastIncoming.delete(m.conversationId);
  }
  const sufficient = outgoing.length >= 10;
  const findings: AuditFinding[] = [];
  if (!sufficient) findings.push({
    id: "small-sample", severity: "info", evidence: outgoing.length + " outgoing messages in this sample.",
    recommendation: "Sync more conversations before interpreting style rates; review examples manually."
  });
  if (sufficient && percent(metrics.laughterMessages, outgoing.length) >= 25) findings.push({
    id: "laughter", severity: "attention", evidence: percent(metrics.laughterMessages, outgoing.length) + "% of outgoing messages include a laughter expression.",
    recommendation: "Reduce repeated laughter fillers. Check whether they fit the actual exchange.",
    suggestedSetting: { key: "humorLevel", value: 45 }
  });
  if (sufficient && percent(metrics.emojiMessages, outgoing.length) >= 35) findings.push({
    id: "emoji", severity: "attention", evidence: percent(metrics.emojiMessages, outgoing.length) + "% of outgoing messages contain an emoji.",
    recommendation: "Use emojis sparingly and in context; avoid adding them to every reply.",
    suggestedSetting: { key: "emojiLevel", value: "low" }
  });
  if (sufficient && percent(metrics.formalPhrases, outgoing.length) >= 15) findings.push({
    id: "formality", severity: "review", evidence: percent(metrics.formalPhrases, outgoing.length) + "% include business-like phrases.",
    recommendation: "Consider a warmer everyday tone when it fits the other person's communication style.",
    suggestedSetting: { key: "tone", value: "warm" }
  });
  if (sufficient && percent(metrics.veryLongReplies, outgoing.length) >= 30) findings.push({
    id: "length", severity: "review", evidence: percent(metrics.veryLongReplies, outgoing.length) + "% exceed 240 characters.",
    recommendation: "Prefer a focused answer to the last message rather than long monologues.",
    suggestedSetting: { key: "messageLength", value: "short" }
  });
  if (sufficient && percent(metrics.questions, outgoing.length) >= 75) findings.push({
    id: "question-rate", severity: "review", evidence: percent(metrics.questions, outgoing.length) + "% contain a question.",
    recommendation: "Balance questions with relevant observations and direct answers."
  });
  if (metrics.comparedLanguages >= 8 && percent(metrics.differingLanguages, metrics.comparedLanguages) >= 30) findings.push({
    id: "language", severity: "review",
    evidence: percent(metrics.differingLanguages, metrics.comparedLanguages) + "% of confidently classified reply pairs use different languages.",
    recommendation: "Review per-conversation language settings; code-switching can be intentional."
  });
  if (sufficient && findings.length === 0) findings.push({
    id: "review-samples", severity: "info", evidence: "None of the measured patterns exceeded its threshold.",
    recommendation: "Review factual accuracy, consent and relevance with actual conversations; this report cannot measure them."
  });
  return {
    generatedAt: date.toISOString(), source: "saved-messages", sampleSize: sample.length,
    conversations: new Set(sample.map(m => m.conversationId)).size,
    outgoing: outgoing.length, incoming: incoming.length, sufficientSample: sufficient,
    metrics, findings,
    cautions: [
      "The last 600 saved messages are sampled, not live Tinder activity.",
      "No messages, names, account identifiers or social handles are returned.",
      "These are heuristics, not an AI detector or a measure of real conversational success.",
      "Language heuristics may miss Darija, very short messages and ordinary code-switching.",
      "No configuration changes or automatic message sends are performed."
    ]
  };
}
export async function runConversationQualityAudit(userId: string): Promise<QualityReport> {
  const result = await getPool().query<{ conversation_id: string; direction: "incoming"|"outgoing"; body: string }>(
    "SELECT m.conversation_id::text AS conversation_id, m.direction, left(m.body, 1500) AS body "
    + "FROM conversation_messages m JOIN conversations c ON c.id = m.conversation_id "
    + "WHERE c.user_id = $1 ORDER BY m.sent_at DESC, m.id DESC LIMIT $2",
    [userId, SAMPLE_MAX]
  );
  return assessSavedMessages(result.rows.reverse().map(m => ({
    conversationId: m.conversation_id, direction: m.direction, text: m.body
  })));
}
