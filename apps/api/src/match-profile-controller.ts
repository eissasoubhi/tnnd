import {
  getConversationMatchProfile,
  promoteMatchProfileCapture,
  saveMatchProfileCapture,
  type StoredMatchProfile
} from "./match-profile-service.js";

export type MatchProfileControllerResult = {
  status: number;
  body: Record<string, unknown>;
};

export type MatchProfileControllerDeps = {
  save: typeof saveMatchProfileCapture;
  getForConversation: typeof getConversationMatchProfile;
  promote: typeof promoteMatchProfileCapture;
};

const defaultDeps: MatchProfileControllerDeps = {
  save: saveMatchProfileCapture,
  getForConversation: getConversationMatchProfile,
  promote: promoteMatchProfileCapture
};

function stringField(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function ok(profile: StoredMatchProfile): MatchProfileControllerResult {
  return { status: 200, body: { profile } };
}

export async function handleMatchProfileCaptureRequest(
  userId: string,
  body: Record<string, unknown>,
  deps: MatchProfileControllerDeps = defaultDeps
): Promise<MatchProfileControllerResult> {
  try {
    const conversationId = stringField(body.conversationId) || null;
    const profile = await deps.save(userId, body.capture ?? body, { conversationId });
    if (!profile) return { status: 404, body: { error: "conversation_not_found" } };
    return { status: 201, body: { profile } };
  } catch (error) {
    return {
      status: 400,
      body: { error: error instanceof Error ? error.message : "invalid_match_profile_capture" }
    };
  }
}

export async function handleConversationMatchProfileRequest(
  userId: string,
  conversationId: string,
  deps: MatchProfileControllerDeps = defaultDeps
): Promise<MatchProfileControllerResult> {
  const id = conversationId.trim();
  if (!id) return { status: 400, body: { error: "missing_conversation_id" } };
  const profile = await deps.getForConversation(userId, id);
  return profile ? ok(profile) : { status: 404, body: { error: "match_profile_not_found" } };
}

export async function handleMatchProfilePromoteRequest(
  userId: string,
  profileId: string,
  body: Record<string, unknown>,
  deps: MatchProfileControllerDeps = defaultDeps
): Promise<MatchProfileControllerResult> {
  const id = profileId.trim();
  const conversationId = stringField(body.conversationId);
  if (!id || !conversationId) return { status: 400, body: { error: "invalid_match_profile_promotion" } };
  const profile = await deps.promote(userId, id, conversationId);
  return profile ? ok(profile) : { status: 404, body: { error: "match_profile_or_conversation_not_found" } };
}
