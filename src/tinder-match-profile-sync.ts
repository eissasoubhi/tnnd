import type { BackendSession } from "./storage";
import { uploadVisibleMatchProfileCapture, type MatchProfileUploadResult } from "./tinder-match-profile-backend";
import {
  buildProfileCaptureDedupeKey,
  hasMeaningfulVisibleProfileFields,
  type TinderVisibleProfileSource
} from "./tinder-match-profile-capture";

export type MatchProfileSyncState = {
  lastUploadedDedupeKey?: string;
};

export type MatchProfileSyncResult =
  | { status: "skipped-empty"; nextState: MatchProfileSyncState }
  | { status: "skipped-unchanged"; nextState: MatchProfileSyncState }
  | { status: "uploaded"; profile: MatchProfileUploadResult; nextState: MatchProfileSyncState };

export type MatchProfileUploader = typeof uploadVisibleMatchProfileCapture;

export async function syncVisibleMatchProfileCapture(
  session: BackendSession,
  capture: TinderVisibleProfileSource,
  state: MatchProfileSyncState = {},
  options: {
    conversationId?: string | null;
    apiBase?: string;
    upload?: MatchProfileUploader;
  } = {}
): Promise<MatchProfileSyncResult> {
  if (!hasMeaningfulVisibleProfileFields(capture)) {
    return { status: "skipped-empty", nextState: state };
  }

  const dedupeKey = buildProfileCaptureDedupeKey(capture);
  if (state.lastUploadedDedupeKey === dedupeKey) {
    return { status: "skipped-unchanged", nextState: state };
  }

  const upload = options.upload ?? uploadVisibleMatchProfileCapture;
  const profile = await upload(session, capture, {
    conversationId: options.conversationId,
    apiBase: options.apiBase
  });

  return {
    status: "uploaded",
    profile,
    nextState: { lastUploadedDedupeKey: dedupeKey }
  };
}
