export type SyncStatus = "disconnected" | "connecting" | "connected" | "syncing" | "error";
export type SyncReconciliationState = "unknown" | "restored" | "matching" | "mismatch";

export interface SyncState {
  status: SyncStatus;
  lastSyncedAt: string | null;
  pendingItems: number;
  message: string | null;
  reconciliationState?: SyncReconciliationState;
}

export const defaultSyncState: SyncState = {
  status: "disconnected",
  lastSyncedAt: null,
  pendingItems: 0,
  message: null,
  reconciliationState: "unknown"
};

export function classifySyncReconciliation(localCursor: string | null, backendCursor: string | null): SyncReconciliationState {
  if (!backendCursor) return "unknown";
  if (!localCursor) return "restored";
  return localCursor === backendCursor ? "matching" : "mismatch";
}

export function describeSyncReconciliation(state: SyncReconciliationState | undefined): string {
  switch (state) {
    case "restored":
      return "checkpoint restored";
    case "matching":
      return "checkpoint matching";
    case "mismatch":
      return "checkpoint mismatch · sync paused";
    default:
      return "";
  }
}

export function describeSyncState(state: SyncState): string {
  switch (state.status) {
    case "connected":
      return state.lastSyncedAt ? `Connected · last sync ${state.lastSyncedAt}` : "Connected";
    case "syncing":
      return state.pendingItems > 0 ? `Syncing ${state.pendingItems} item${state.pendingItems === 1 ? "" : "s"}…` : "Syncing…";
    case "connecting":
      return "Connecting to TNND…";
    case "error":
      return state.message ? `Sync error · ${state.message}` : "Sync error";
    default:
      return "TNND backend disconnected";
  }
}
