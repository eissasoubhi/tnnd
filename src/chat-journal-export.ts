/** Shareable support export. All fields are explicitly allowlisted.
 * Never serialize the raw runner state (may contain tokens, Tinder IDs,
 * account/device IDs or other personal application metadata).
 */
const phases = new Set([
  "starting", "checking", "loading", "incoming", "waiting",
  "generating", "sending", "sent", "skipped", "error", "stopped"
]);
const date = (value: unknown): string | null =>
  typeof value === "string" && Number.isFinite(Date.parse(value))
    ? new Date(value).toISOString() : null;
const number = (value: unknown): number | null =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
const phase = (value: unknown): string | null =>
  typeof value === "string" && phases.has(value) ? value : null;
function diagnosticText(value: unknown, max = 240): string | null {
  if (typeof value !== "string") return null;
  // Defensive redaction of credentials that may inadvertently appear in an
  // upstream exception detail. No transcript, prompt or server payload is
  // ever included in the export.
  return value.slice(0, max)
    .replace(/\bBearer\s+[a-z0-9_.~+\/-]+/gi, "Bearer [masqué]")
    .replace(/\b(access[_-]?token|refresh[_-]?token|api[_-]?key|authorization|password)\s*[:=]\s*[^\s,;]+/gi, "$1=[masqué]")
    .replace(/\bsk-[a-z0-9_-]{10,}/gi, "[clé masquée]");
}
interface RunnerEvent {
  at?: unknown;
  phase?: unknown;
  detail?: unknown;
  conversation?: unknown;
}
interface RunnerData {
  [key: string]: unknown;
}
export interface JournalExport {
  format: "tnnd-chat-journal";
  schemaVersion: 1;
  exportedAt: string;
  extensionVersion: string;
  timezone: string;
  state: {
    enabled: boolean;
    mode: string | null;
    phase: string | null;
    phaseDetail: string | null;
    currentConversation: string | null;
    pendingReplies: number | null;
    lastActionAt: string | null;
    lastVisitAt: string | null;
    waitingSince: string | null;
    scanAttempts: number | null;
    nextReplyAt: string | null;
    visitedCount: number | null;
    sentCount: number | null;
    skippedCount: number | null;
    errorCount: number | null;
    lastError: string | null;
  };
  events: Array<{ at: string; phase: string; conversation: string | null; detail: string }>;
  note: string;
}
export function createJournalExport(
  rawState: unknown, extensionVersion: string,
  exportedAt = new Date().toISOString()
): JournalExport {
  const state: RunnerData = rawState && typeof rawState === "object" && !Array.isArray(rawState)
    ? rawState as RunnerData : {};
  const rawEvents = Array.isArray(state.activity) ? state.activity : [];
  const events = rawEvents.slice(-50).flatMap((raw: unknown) => {
    if (!raw || typeof raw !== "object") return [];
    const event = raw as RunnerEvent;
    const at = date(event.at);
    const eventPhase = phase(event.phase);
    const detail = diagnosticText(event.detail);
    if (!at || !eventPhase || detail === null) return [];
    return [{ at, phase: eventPhase,
      conversation: diagnosticText(event.conversation, 80), detail }];
  });
  let timezone = "unknown";
  try { timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "unknown"; }
  catch { /* no host environment timezone */ }
  return {
    format: "tnnd-chat-journal",
    schemaVersion: 1,
    exportedAt: date(exportedAt) ?? new Date().toISOString(),
    extensionVersion: typeof extensionVersion === "string" ? extensionVersion.slice(0, 32) : "unknown",
    timezone,
    state: {
      enabled: state.enabled === true,
      mode: state.mode === "runner" || state.mode === "watcher" ? state.mode : null,
      phase: phase(state.phase),
      phaseDetail: diagnosticText(state.phaseDetail),
      currentConversation: diagnosticText(state.currentLabel, 80),
      pendingReplies: number(state.pendingReplies),
      lastActionAt: date(state.lastActionAt),
      lastVisitAt: date(state.lastVisitAt),
      waitingSince: date(state.awaitingChatSince),
      scanAttempts: number(state.awaitingChatScanAttempts),
      nextReplyAt: date(state.nextReplyAt),
      visitedCount: number(state.visitedCount),
      sentCount: number(state.sentCount),
      skippedCount: number(state.skippedCount),
      errorCount: number(state.errorCount),
      lastError: diagnosticText(state.lastError)
    },
    events,
    note: "Export de diagnostic en lecture seule. Contient les noms affichés des conversations et les états de TNND, pas les messages Tinder. Vérifier le contenu avant de partager."
  };
}
