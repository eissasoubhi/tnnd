export type SyncDiagnosticState = "disconnected" | "connecting" | "connected" | "syncing" | "error";

export interface SyncDiagnosticInput {
  state: SyncDiagnosticState;
  pendingItems: number;
  lastSyncedAt?: string | null;
  lastError?: string | null;
  hasSession: boolean;
  hasServerProfile: boolean;
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

  if (!input.hasSession) hints.push("Sign in to restore server-side state.");
  if (input.hasSession && !input.hasServerProfile) hints.push("Account is connected but no server profile is cached yet.");
  if (input.pendingItems > 0) hints.push(`${input.pendingItems} item(s) are waiting to sync.`);
  if (input.state === "error" && input.lastError) hints.push(input.lastError);

  const healthy =
    input.state !== "error" &&
    input.pendingItems === 0 &&
    (!input.hasSession || input.hasServerProfile);

  return {
    ...input,
    generatedAt: now.toISOString(),
    healthy,
    hints,
  };
}
