import type { BackendSession } from "./storage";
import { uploadVisibleMatchProfileCapture, type MatchProfileUploadResult } from "./tinder-match-profile-backend";
import type { TinderVisibleProfileSource } from "./tinder-match-profile-capture";
import { loadMatchProfileSyncState, saveMatchProfileSyncState } from "./tinder-match-profile-sync-store";
import { confirmVisibleMatchProfileUpload, planVisibleMatchProfileSync } from "./tinder-match-profile-sync";

export type MatchProfileRuntimeSyncResult =
  | { status: "skipped-empty" | "skipped-unchanged" }
  | { status: "uploaded"; profile: MatchProfileUploadResult };

export async function syncObservedMatchProfile(
  session: BackendSession,
  scopeKey: string,
  capture: TinderVisibleProfileSource,
  options: { conversationId?: string | null; apiBase?: string } = {}
): Promise<MatchProfileRuntimeSyncResult> {
  const state = await loadMatchProfileSyncState(scopeKey);
  const decision = planVisibleMatchProfileSync(capture, state);
  if (decision.status !== "upload") return { status: decision.status };
  const profile = await uploadVisibleMatchProfileCapture(session, capture, options);
  await saveMatchProfileSyncState(scopeKey, confirmVisibleMatchProfileUpload(state, decision.dedupeKey));
  return { status: "uploaded", profile };
}
