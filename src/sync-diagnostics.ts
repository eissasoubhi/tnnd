export type SyncDiagnosticState = "disconnected" | "connecting" | "connected" | "syncing" | "error";
export type SyncReconciliationState = "unknown" | "restored" | "matching" | "mismatch";

export interface SyncDiagnosticInput {
  state: SyncDiagnosticState;
  pendingItems: number;
  lastSyncedAt?: string | null;
  lastError?: string | null;
  hasSession: boolean;
  hasServerProfile: boolean;
  reconciliationState?: SyncReconciliationState;
}

export interface SyncDiagnosticSnapshot extends SyncDiagnosticInput {
  generatedAt: string;
  healthy: boolean;
  hints: string[];
}

export function buildSyncDiagnosticSnapshot(
  input: SyncDiagnosticInput,
  now = new Date(),
): SyncDiagnosticSnapshot {
  const hints: string[] = [];
  const reconciliationState = input.reconciliationState ?? "unknown";

  if (!input.hasSession) hints.push("Sign in to restore server-side state.");
  if (input.hasSession && !input.hasServerProfile) hints.push("Account is connected but no server profile is cached yet.");
  if (input.pendingItems > 0) hints.push(`${input.pendingItems} item(s) are waiting to sync.`);
  if (input.state === "error" && input.lastError) hints.push(input.lastError);
  if (reconciliationState === "restored") hints.push("Local sync state was restored from the backend checkpoint.");
  if (reconciliationState === "mismatch") hints.push("Local and backend sync checkpoints differ. Automatic thread sync is paused until they are reconciled.");

  const healthy =
    input.state !== "error" &&
    input.pendingItems === 0 &&
    reconciliationState !== "mismatch" &&
    (!input.hasSession || input.hasServerProfile);

  return {
    ...input,
    reconciliationState,
    generatedAt: now.toISOString(),
    healthy,
    hints,
  };
}
