import { getSyncState } from "./storage";
import { describeSyncState } from "./sync-status";

export async function renderSyncStatus(): Promise<void> {
  const status = document.getElementById("backendSyncStatus");
  const pending = document.getElementById("backendSyncPending");
  if (!status || !pending) return;

  const state = await getSyncState();
  status.textContent = describeSyncState(state);
  status.dataset.state = state.status;
  pending.textContent = state.pendingItems > 0 ? `${state.pendingItems} pending` : "Queue empty";
}
