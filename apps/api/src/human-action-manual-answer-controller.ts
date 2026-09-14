import { parseManualAnswerInput } from "./human-action-manual-answer.js";
import { saveHumanActionManualAnswer } from "./human-action-service.js";

export type HumanActionManualAnswerResponse = {
  status: number;
  body: Record<string, unknown>;
};

export async function handleHumanActionManualAnswerRequest(
  userId: string,
  actionId: string,
  body: Record<string, unknown>
): Promise<HumanActionManualAnswerResponse> {
  try {
    const unknownFields = Object.keys(body).filter((key) => key !== "answer");
    if (unknownFields.length > 0) {
      return {
        status: 400,
        body: { error: "invalid_manual_answer", details: `unknown manual answer field: ${unknownFields[0]}` }
      };
    }

    const payload = parseManualAnswerInput({ actionId, answer: body.answer });
    const action = await saveHumanActionManualAnswer(userId, payload);
    if (!action) return { status: 404, body: { error: "human_action_not_found" } };
    return { status: 200, body: { action } };
  } catch (error) {
    const details = error instanceof Error ? error.message : "invalid_manual_answer";
    if (details === "human_action_not_pending") {
      return { status: 409, body: { error: "human_action_not_pending" } };
    }
    return { status: 400, body: { error: "invalid_manual_answer", details } };
  }
}
