import type { WebDiagnosticEvent } from "./web-diagnostic-types";

export interface FunctionalFinding {
  kind: "network" | "http" | "application";
  operation: string;
  httpStatus?: number;
  errorCode?: string;
  action?: string;
  nextStep: string;
}

const route = (url?: string): string => {
  if (!url) return "unknown";
  try {
    const parsed = new URL(url);
    const path = parsed.pathname;
    if (/^\/api\/v1\/conversations\/[^/]+\/generate$/.test(path)) return "conversation.generate";
    if (/^\/api\/v1\/ai\/test-connection$/.test(path)) return "gemini.test";
    if (path === "/api/v1/analytics") return "analytics";
    if (path === "/api/v1/profile/texting-style/source-examples") return "texting-style-retained-sources";
    if (/^\/api\/v1\/conversations\/[^/]+/.test(path)) return "conversation.other";
    if (path === "/api/v1/profile") return "profile";
    return path.startsWith("/api/v1/") ? "api.other" : "other";
  } catch { return "unknown"; }
};
// These 404s intentionally mean "optional resource not created yet".
const expected = (finding: WebDiagnosticEvent): boolean =>
  finding.status === 404 && finding.method === "GET" &&
  ["profile", "conversation.other", "texting-style-retained-sources"].includes(route(finding.url));

function nextStep(kind: FunctionalFinding["kind"], operation: string, code?: string): string {
  if (operation === "conversation.generate" && code === "gemini_not_configured") return "Go to Settings → Gemini, save a key, then Test connection.";
  if (operation === "conversation.generate" && code === "gemini_model_unavailable") return "Choose a supported model in Settings → Gemini.";
  if (operation === "conversation.generate" && code === "gemini_credentials_rejected") return "Replace the Gemini key and Test connection.";
  if (operation === "conversation.generate" && code === "gemini_rate_limited") return "Check Gemini quota or retry later.";
  if (operation === "conversation.generate" && code === "internal_error") return "Inspect Docker API logs around this request; share the sanitized diagnostics ZIP.";
  if (operation === "conversation.generate" && code === "generation_schema_missing") return "The API database schema is missing tables or columns used by draft generation. Run the documented migrations, then retry.";
  if (operation === "conversation.generate" && code === "generation_context_unavailable") return "Draft context could not be loaded. Check the API stage in the server logs and database connectivity.";
  if (operation === "analytics" && kind === "http") return "The analytics endpoint did not respond successfully. Rebuild/restart the API and check its logs.";

  if (kind === "network") return "Check Docker API/Web services, the browser Network tab, and the proxy.";
  if (operation === "conversation.generate") return "Check Gemini settings and API logs; export the Web diagnostic ZIP.";
  return "Open the Network tab or Web diagnostic ZIP to inspect the failing API action.";
}

/** Only status, opaque error code, and named routes; no content or identifiers. */
export function functionalFindings(events: readonly WebDiagnosticEvent[], now = Date.now()): FunctionalFinding[] {
  const observed = events.filter(e => now - e.at <= 5 * 60_000);
  const actions = observed.filter(e => e.kind === "ui-click" && e.detail);
  const latest = new Map<string, FunctionalFinding>();
  for (const event of observed) {
    const isNetwork = event.kind === "fetch-error";
    const isHttp = event.kind === "fetch-end" && (event.status ?? 0) >= 400 && !expected(event);
    const isApp = event.kind === "app-error" && Boolean(event.detail);
    if (!isNetwork && !isHttp && !isApp) continue;
    if (expected(event)) continue;
    const op = route(event.url);
    if (op === "other" || op === "unknown") continue;
    const action = [...actions].reverse().find(a => a.at <= event.at && event.at - a.at < 30_000)?.detail;
    const code = isApp && /^[a-z][a-z0-9_:-]{1,63}$/.test(event.detail ?? "") ? event.detail : undefined;
    const kind = isNetwork ? "network" : isApp ? "application" : "http";
    const finding: FunctionalFinding = {
      kind, operation: op, ...(event.status ? { httpStatus: event.status } : {}),
      ...(code ? { errorCode: code } : {}), ...(action ? { action } : {}),
      nextStep: nextStep(kind, op, code)
    };
    latest.set(op + ":" + (event.id ?? event.at), finding);
  }
  // Prefer structured app error to plain HTTP for the same request.
  return [...latest.values()].reduce<FunctionalFinding[]>((acc, f) => {
    const earlier = acc.findIndex(x => x.operation === f.operation && x.action === f.action && x.httpStatus === f.httpStatus);
    if (earlier >= 0 && (f.kind === "application" || acc[earlier].kind !== "application")) acc[earlier] = f;
    else if (earlier < 0) acc.push(f);
    return acc;
  }, []).slice(-20);
}
