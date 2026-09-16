import type { MatchProfileVisibleFields } from "./match-profile-contract.js";
import { getConversationMatchProfile } from "./match-profile-service.js";
import { listHumanActions, type HumanAction } from "./human-action-service.js";

export interface GenerationMatchProfileContext {
  capturedAt: string;
  fields: MatchProfileVisibleFields;
}

export interface GenerationHumanActionContext {
  id: string;
  title: string;
  detail: string;
  severity: HumanAction["severity"];
  status: "pending" | "completed";
  manualAnswer?: string;
}

export interface GenerationSupplementalContext {
  matchProfile?: GenerationMatchProfileContext;
  humanActions: GenerationHumanActionContext[];
}

function manualAnswerFrom(action: HumanAction): string | undefined {
  const manualAnswer = action.context.manualAnswer;
  if (!manualAnswer || typeof manualAnswer !== "object" || Array.isArray(manualAnswer)) return undefined;
  const answer = (manualAnswer as { answer?: unknown }).answer;
  if (typeof answer !== "string") return undefined;
  const normalized = answer.trim();
  return normalized ? normalized.slice(0, 1000) : undefined;
}

function mapHumanAction(action: HumanAction): GenerationHumanActionContext | null {
  if (action.status === "ignored") return null;
  return {
    id: action.id,
    title: action.title.slice(0, 300),
    detail: action.detail.slice(0, 1000),
    severity: action.severity,
    status: action.status,
    ...(manualAnswerFrom(action) ? { manualAnswer: manualAnswerFrom(action) } : {})
  };
}

export async function loadGenerationSupplementalContext(
  userId: string,
  conversationId: string,
  externalThreadId: string
): Promise<GenerationSupplementalContext> {
  const [matchProfile, actions] = await Promise.all([
    getConversationMatchProfile(userId, conversationId),
    listHumanActions(userId)
  ]);
  const conversationRefs = new Set([conversationId, externalThreadId]);
  const humanActions = actions
    .filter((action) => action.conversationRef !== null && conversationRefs.has(action.conversationRef))
    .sort((left, right) => {
      if (left.status === "pending" && right.status !== "pending") return -1;
      if (right.status === "pending" && left.status !== "pending") return 1;
      return Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
    })
    .map(mapHumanAction)
    .filter((action): action is GenerationHumanActionContext => action !== null)
    .slice(0, 8);

  return {
    ...(matchProfile
      ? {
          matchProfile: {
            capturedAt: matchProfile.capturedAt,
            fields: matchProfile.normalizedProfile.fields
          }
        }
      : {}),
    humanActions
  };
}
