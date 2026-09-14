import {
  buildProfileCaptureDedupeKey,
  hasMeaningfulVisibleProfileFields,
  type TinderVisibleProfileSource
} from "./tinder-match-profile-capture.ts";

export type MatchProfileSyncState = {
  lastUploadedDedupeKey?: string;
};

export type MatchProfileSyncDecision =
  | { status: "skipped-empty"; nextState: MatchProfileSyncState }
  | { status: "skipped-unchanged"; nextState: MatchProfileSyncState }
  | { status: "upload"; dedupeKey: string; nextState: MatchProfileSyncState };

export function planVisibleMatchProfileSync(
  capture: TinderVisibleProfileSource,
  state: MatchProfileSyncState = {}
): MatchProfileSyncDecision {
  if (!hasMeaningfulVisibleProfileFields(capture)) {
    return { status: "skipped-empty", nextState: state };
  }

  const dedupeKey = buildProfileCaptureDedupeKey(capture);
  if (state.lastUploadedDedupeKey === dedupeKey) {
    return { status: "skipped-unchanged", nextState: state };
  }

  return {
    status: "upload",
    dedupeKey,
    nextState: state
  };
}

export function confirmVisibleMatchProfileUpload(
  state: MatchProfileSyncState,
  dedupeKey: string
): MatchProfileSyncState {
  return {
    ...state,
    lastUploadedDedupeKey: dedupeKey
  };
}
