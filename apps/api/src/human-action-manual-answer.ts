export const MANUAL_ANSWER_MAX_LENGTH = 2000;

export type ManualAnswerInput = {
  actionId: string;
  answer: string;
};

export type ManualAnswerPayload = {
  actionId: string;
  answer: string;
  source: "user-manual-answer";
};

function requireNonEmptyString(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== "string") throw new Error(`${field} must be a string`);
  const normalized = value.trim();
  if (!normalized) throw new Error(`${field} is required`);
  if (normalized.length > maxLength) throw new Error(`${field} exceeds ${maxLength} characters`);
  return normalized;
}

export function parseManualAnswerInput(value: unknown): ManualAnswerPayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("manual answer payload must be an object");
  }
  const record = value as Record<string, unknown>;
  const allowed = new Set(["actionId", "answer"]);
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) throw new Error(`unknown manual answer field: ${key}`);
  }

  return {
    actionId: requireNonEmptyString(record.actionId, "actionId", 128),
    answer: requireNonEmptyString(record.answer, "answer", MANUAL_ANSWER_MAX_LENGTH),
    source: "user-manual-answer",
  };
}
