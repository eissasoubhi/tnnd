import type { BackendSession } from "./storage";
import type { TinderVisibleProfileSource } from "./tinder-match-profile-capture";
import { uploadVisibleMatchProfileCapture, type MatchProfileUploadResult } from "./tinder-match-profile-backend";
import { confirmVisibleMatchProfileUpload, planVisibleMatchProfileSync, type MatchProfileSyncState } from "./tinder-match-profile-sync";
import { loadMatchProfileSyncState, saveMatchProfileSyncState } from "./tinder-match-profile-sync-store";

export type RuntimeMatchProfileSyncResult =
  | { status: "skipped-empty" | "skipped-unchanged" }
  | { status: "uploaded"; profile: MatchProfileUploadResult };

type RuntimeMatchProfileSyncDependencies = {
  loadState(scopeKey: string): Promise<MatchProfileSyncState>;
  saveState(scopeKey: string, state: MatchProfileSyncState): Promise<void>;
  upload(
    session: BackendSession,
    capture: TinderVisibleProfileSource,
    options: { conversationId?: string | null }
  ): Promise<MatchProfileUploadResult>;
};

const defaultDependencies: RuntimeMatchProfileSyncDependencies = {
  loadState: loadMatchProfileSyncState,
  saveState: saveMatchProfileSyncState,
  upload: uploadVisibleMatchProfileCapture
};

export async function syncVisibleMatchProfileCapture(
  session: BackendSession,
  scopeKey: string,
  capture: TinderVisibleProfileSource,
  options: {
    conversationId?: string | null;
    dependencies?: RuntimeMatchProfileSyncDependencies;
  } = {}
): Promise<RuntimeMatchProfileSyncResult> {
  const dependencies = options.dependencies ?? defaultDependencies;
  const state = await dependencies.loadState(scopeKey);
  const decision = planVisibleMatchProfileSync(capture, state);

  if (decision.status !== "upload") return { status: decision.status };

  const profile = await dependencies.upload(session, capture, {
    conversationId: options.conversationId ?? null
  });

  const confirmedState = confirmVisibleMatchProfileUpload(decision.nextState, decision.dedupeKey);
  await dependencies.saveState(scopeKey, confirmedState);
  return { status: "uploaded", profile };
}
