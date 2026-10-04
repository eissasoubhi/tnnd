export const WEB_DIAGNOSTIC_CHANNEL = "tnnd-web-diagnostic-v1";
export const WEB_DIAGNOSTIC_REQUEST_CHANNEL = "tnnd-web-diagnostic-request-v1";
export const WEB_DIAGNOSTIC_STORAGE_KEY = "tnnd.webDiagnostics.v1";

export type WebDiagnosticEventKind =
  | "lifecycle"
  | "heartbeat"
  | "heartbeat-stall"
  | "longtask"
  | "resource"
  | "fetch-start"
  | "fetch-end"
  | "fetch-error"
  | "ws-create"
  | "ws-open"
  | "ws-close"
  | "ws-error"
  | "error"
  | "unhandled-rejection"
  | "snapshot";

export interface WebDiagnosticEvent {
  kind: WebDiagnosticEventKind;
  at: number;
  pageSessionId: string;
  id?: string;
  phase?: string;
  readyState?: string;
  url?: string;
  method?: string;
  status?: number;
  durationMs?: number;
  driftMs?: number;
  resourceType?: string;
  transferSize?: number;
  detail?: string;
  openSockets?: number;
  pendingRequests?: number;
}

export interface PendingWebRequest {
  id: string;
  kind: "fetch";
  url: string;
  method: string;
  startedAt: number;
}

export interface OpenWebSocket {
  id: string;
  url: string;
  createdAt: number;
  openedAt: number | null;
}

export interface WebDiagnosticTabState {
  tabId: number;
  pageUrl: string;
  pageSessionId: string;
  startedAt: number;
  updatedAt: number;
  lastHeartbeatAt: number | null;
  lastHeartbeatDriftMs: number;
  readyState: string;
  pendingRequests: Record<string, PendingWebRequest>;
  openSockets: Record<string, OpenWebSocket>;
  events: WebDiagnosticEvent[];
}

export interface WebDiagnosticStore {
  version: 1;
  tabs: Record<string, WebDiagnosticTabState>;
}

export interface WebDiagnosticAnalysis {
  level: "healthy" | "warning" | "blocked" | "unknown";
  summary: string;
  evidence: string[];
}

export function isTnndLocalWebUrl(value?: string): boolean {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "http:"
      && (url.hostname === "127.0.0.1" || url.hostname === "localhost")
      && url.port === "5173";
  } catch {
    return false;
  }
}

export function sanitizeWebDiagnosticUrl(value: string): string {
  try {
    const url = new URL(value, "http://127.0.0.1:5173");
    url.username = "";
    url.password = "";
    url.search = "";
    url.hash = "";
    return `${url.origin}${url.pathname}`;
  } catch {
    return "[invalid-url]";
  }
}

export function sanitizeWebDiagnosticText(value: unknown): string {
  const text = value instanceof Error ? `${value.name}: ${value.message}` : String(value ?? "");
  return text
    .replace(/https?:\/\/[^\s"'<>]+/gi, (match) => sanitizeWebDiagnosticUrl(match))
    .replace(/\b(token|key|secret|password|authorization|session)=([^\s&]+)/gi, "$1=[redacted]")
    .replace(/\b[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/g, "[redacted-token]")
    .slice(0, 500);
}

function seconds(value: number): string {
  return value < 10_000 ? `${(value / 1000).toFixed(1)}s` : `${Math.round(value / 1000)}s`;
}

export function analyzeWebDiagnosticState(state: WebDiagnosticTabState | null | undefined, now = Date.now()): WebDiagnosticAnalysis {
  if (!state) {
    return {
      level: "unknown",
      summary: "Aucun diagnostic Web TNND reçu pour cet onglet.",
      evidence: ["Recharge la page une fois après avoir mis à jour l’extension."]
    };
  }

  const evidence: string[] = [];
  const heartbeatAge = state.lastHeartbeatAt === null ? Number.POSITIVE_INFINITY : Math.max(0, now - state.lastHeartbeatAt);
  const pending = Object.values(state.pendingRequests);
  const sockets = Object.values(state.openSockets);
  const recent = state.events.filter((event) => now - event.at <= 60_000);
  const longTasks = recent.filter((event) => event.kind === "longtask" || event.kind === "heartbeat-stall");
  const longestTask = longTasks.reduce((max, event) => Math.max(max, event.durationMs ?? event.driftMs ?? 0), 0);
  const errors = recent.filter((event) => event.kind === "error" || event.kind === "unhandled-rejection");
  const oldestPendingMs = pending.reduce((max, request) => Math.max(max, now - request.startedAt), 0);

  if (Number.isFinite(heartbeatAge)) evidence.push(`Dernier heartbeat il y a ${seconds(heartbeatAge)}.`);
  evidence.push(`document.readyState: ${state.readyState || "unknown"}.`);
  if (sockets.length) evidence.push(`${sockets.length} WebSocket ouverte(s).`);
  if (pending.length) evidence.push(`${pending.length} requête(s) HTTP en attente; plus ancienne: ${seconds(oldestPendingMs)}.`);
  if (longestTask > 0) evidence.push(`Plus long blocage récent détecté: ${Math.round(longestTask)} ms.`);
  if (errors.length) evidence.push(`${errors.length} erreur(s) JavaScript récente(s).`);

  if (heartbeatAge > 5_000) {
    return {
      level: "blocked",
      summary: `Le thread principal semble bloqué: aucun heartbeat depuis ${seconds(heartbeatAge)}.`,
      evidence: sockets.length
        ? [...evidence, "Une WebSocket ouverte avec statut 101/Pending est normalement persistante; sa présence seule ne prouve pas qu’elle bloque la page."]
        : evidence
    };
  }

  if (oldestPendingMs > 10_000) {
    const request = pending.sort((a, b) => a.startedAt - b.startedAt)[0];
    return {
      level: "warning",
      summary: `Une requête HTTP reste en attente depuis ${seconds(oldestPendingMs)}.`,
      evidence: [...evidence, request ? `${request.method} ${request.url}` : ""].filter(Boolean)
    };
  }

  if (longestTask >= 1_000) {
    return {
      level: "warning",
      summary: `Une longue tâche bloque le thread principal (~${Math.round(longestTask)} ms).`,
      evidence
    };
  }

  if (errors.length) {
    return {
      level: "warning",
      summary: "La page répond, mais des erreurs JavaScript ont été détectées.",
      evidence
    };
  }

  if (state.lastHeartbeatAt !== null) {
    return {
      level: "healthy",
      summary: sockets.length
        ? "La page répond. La WebSocket ouverte est persistante; 101/Pending est normal tant que le heartbeat continue."
        : "La page répond et aucun blocage principal n’est détecté.",
      evidence
    };
  }

  return {
    level: "unknown",
    summary: "Le diagnostic est actif mais attend encore son premier heartbeat.",
    evidence
  };
}
