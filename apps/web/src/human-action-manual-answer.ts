export const MANUAL_ANSWER_LIMIT = 2000;

export type ManualAnswerDraft = {
  actionId: string;
  answer: string;
  stage: "editing" | "review";
};

export function createManualAnswerDraft(actionId: string): ManualAnswerDraft {
  return { actionId, answer: "", stage: "editing" };
}

export function updateManualAnswer(draft: ManualAnswerDraft, answer: string): ManualAnswerDraft {
  return { ...draft, answer: answer.slice(0, MANUAL_ANSWER_LIMIT), stage: "editing" };
}

export function reviewManualAnswer(draft: ManualAnswerDraft): ManualAnswerDraft {
  if (!draft.actionId.trim()) throw new Error("Action id is required");
  if (!draft.answer.trim()) throw new Error("Write an answer before review");
  return { ...draft, answer: draft.answer.trim(), stage: "review" };
}

export function toManualAnswerRequest(draft: ManualAnswerDraft): { actionId: string; answer: string } {
  if (draft.stage !== "review") throw new Error("Manual answer must be reviewed before submission");
  return { actionId: draft.actionId.trim(), answer: draft.answer };
}
