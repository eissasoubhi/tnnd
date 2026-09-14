import { getSyncState } from "./storage";
import { describeSyncReconciliation, describeSyncState } from "./sync-status";

export async function renderSyncStatus(): Promise<void> {
  const status = document.getElementById("backendSyncStatus");
  const pending = document.getElementById("backendSyncPending");
  if (!status || !pending) return;

  const state = await getSyncState();
  const reconciliation = describeSyncReconciliation(state.reconciliationState);
  status.textContent = reconciliation
    ? `${describeSyncState(state)} · ${reconciliation}`
    : describeSyncState(state);
  status.dataset.state = state.status;
  status.dataset.reconciliation = state.reconciliationState ?? "unknown";
  pending.textContent = state.pendingItems > 0 ? `${state.pendingItems} pending` : "Queue empty";
}
