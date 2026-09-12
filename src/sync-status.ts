export type SyncStatus = "disconnected" | "connecting" | "connected" | "syncing" | "error";

export interface SyncState {
  status: SyncStatus;
  lastSyncedAt: string | null;
  pendingItems: number;
  message: string | null;
}

export const defaultSyncState: SyncState = {
  status: "disconnected",
  lastSyncedAt: null,
  pendingItems: 0,
  message: null
};

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
