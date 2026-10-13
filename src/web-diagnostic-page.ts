import {
  WEB_DIAGNOSTIC_CHANNEL,
  WEB_DIAGNOSTIC_REQUEST_CHANNEL,
  isTnndLocalWebUrl,
  sanitizeWebDiagnosticText,
  sanitizeWebDiagnosticUrl,
  type WebDiagnosticEvent,
  type WebDiagnosticEventKind
} from "./web-diagnostic-types";

if (isTnndLocalWebUrl(window.location.href)) {
  const pageSessionId = crypto.randomUUID();
  const socketIds = new Map<WebSocket, string>();
  const pendingFetches = new Map<string, { url: string; method: string; startedAt: number }>();
  let resourceEvents = 0;
  let heartbeatExpected = performance.now() + 1_000;

  function emit(kind: WebDiagnosticEventKind, detail: Omit<WebDiagnosticEvent, "kind" | "at" | "pageSessionId"> = {}): void {
    window.postMessage({
      source: WEB_DIAGNOSTIC_CHANNEL,
      event: {
        kind,
        at: Date.now(),
        pageSessionId,
        ...detail
      } satisfies WebDiagnosticEvent
    }, "*");
  }

  function snapshot(): void {
    emit("snapshot", {
      readyState: document.readyState,
      openSockets: socketIds.size,
      pendingRequests: pendingFetches.size
    });
  }

  emit("lifecycle", { phase: "script-start", readyState: document.readyState });

  document.addEventListener("readystatechange", () => emit("lifecycle", {
    phase: "readystatechange",
    readyState: document.readyState
  }));

  document.addEventListener("DOMContentLoaded", () => emit("lifecycle", {
    phase: "DOMContentLoaded",
    readyState: document.readyState
  }), { once: true });

  window.addEventListener("load", () => {
    emit("lifecycle", { phase: "load", readyState: document.readyState });
    snapshot();
  }, { once: true });

  window.addEventListener("error", (event) => {
    emit("error", {
      detail: sanitizeWebDiagnosticText(event.message || event.error || "window_error"),
      url: event.filename ? sanitizeWebDiagnosticUrl(event.filename) : undefined
    });
  }, true);

  window.addEventListener("unhandledrejection", (event) => {
    emit("unhandled-rejection", { detail: sanitizeWebDiagnosticText(event.reason) });
  });

  // Record *known* user intents, not input values, labels or arbitrary DOM.
  // This lets a later failed API request be associated with the preceding click.
  const knownActions: Array<[string, string]> = [
    ["[data-generation-button]", "generate-draft"],
    ["[data-generation-regenerate]", "regenerate-draft"],
    ["#ai-provider-test", "test-gemini"],
    ["#ai-provider-save", "save-gemini"],
    ["#preferences-save", "save-preferences"],
    ["[data-temporary-instruction-save]", "save-instruction"],
    ["[data-temporary-instruction-clear]", "clear-instruction"],
    ["#identity-builder-analyze", "analyze-identity"],
    ["#memory-analyze", "analyze-memory"]
  ];
  document.addEventListener("click", event => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const action = knownActions.find(([selector]) => target.closest(selector));
    if (action) emit("ui-click", { detail: action[1] });
  }, true);

  const nativeFetch = window.fetch;
  window.fetch = (async (...args: Parameters<typeof fetch>): Promise<Response> => {
    const input = args[0];
    const init = args[1];
    const rawUrl = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    const id = crypto.randomUUID();
    const url = sanitizeWebDiagnosticUrl(rawUrl);
    const startedAt = Date.now();
    pendingFetches.set(id, { url, method, startedAt });
    emit("fetch-start", { id, url, method });
    try {
      const response = await nativeFetch(...args);
      emit("fetch-end", { id, url, method, status: response.status, durationMs: Date.now() - startedAt });
      // Inspect only the machine-readable `error` code on TNND API responses.
      // Never persist response bodies, messages, profile, headers or tokens.
      try {
        const pathname = new URL(rawUrl, location.href).pathname;
        if (pathname.startsWith("/api/v1/") && response.headers.get("content-type")?.includes("json")) {
          void response.clone().json().then((value: unknown) => {
            const code = value && typeof value === "object" && !Array.isArray(value)
              ? (value as { error?: unknown }).error : undefined;
            if (typeof code === "string" && /^[a-z][a-z0-9_:-]{1,63}$/.test(code)) {
              const stage = (value as { stage?: unknown }).stage;
              const knownStages = new Set([
                "conversation", "profile", "summary", "facts", "effective-context",
                "supplemental", "memories", "provider-settings", "provider", "memory-usage"
              ]);
              emit("app-error", {
                id, url, method, status: response.status, detail: code,
                ...(typeof stage === "string" && knownStages.has(stage) ? { phase: stage } : {})
              });
            } else if (response.ok && value && typeof value === "object") {
              // A 200 response can still be functionally unsuccessful.
              const result = value as { connected?: unknown; generation?: unknown };
              if (pathname === "/api/v1/ai/test-connection" && result.connected === false) {
                emit("app-error", { id, url, method, status: response.status, detail: "gemini_connection_failed" });
              }
              if (pathname.startsWith("/api/v1/conversations/") && pathname.endsWith("/generate") && !result.generation) {
                emit("app-error", { id, url, method, status: response.status, detail: "generation_payload_missing" });
              }
            }
          }).catch(() => undefined);
        }
      } catch { /* Never interfere with the application's fetch or parsing. */ }
      return response;
    } catch (error) {
      emit("fetch-error", { id, url, method, durationMs: Date.now() - startedAt, detail: sanitizeWebDiagnosticText(error) });
      throw error;
    } finally {
      pendingFetches.delete(id);
    }
  }) as typeof fetch;

  const NativeWebSocket = window.WebSocket;
  window.WebSocket = new Proxy(NativeWebSocket, {
    construct(target, args, newTarget) {
      const socket = Reflect.construct(target, args, newTarget) as WebSocket;
      const id = crypto.randomUUID();
      const rawUrl = String(args[0] ?? "");
      const url = sanitizeWebDiagnosticUrl(rawUrl);
      socketIds.set(socket, id);
      emit("ws-create", { id, url });
      socket.addEventListener("open", () => emit("ws-open", { id, url }), { once: true });
      socket.addEventListener("error", () => emit("ws-error", { id, url }), { once: true });
      socket.addEventListener("close", (event) => {
        socketIds.delete(socket);
        emit("ws-close", { id, url, status: event.code });
      }, { once: true });
      return socket;
    }
  }) as typeof WebSocket;

  if (typeof PerformanceObserver !== "undefined") {
    try {
      if (PerformanceObserver.supportedEntryTypes.includes("longtask")) {
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            emit("longtask", { durationMs: Math.round(entry.duration) });
          }
        }).observe({ type: "longtask", buffered: true });
      }
    } catch {
      // Browser does not expose Long Tasks in this context.
    }

    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (!(entry instanceof PerformanceResourceTiming)) continue;
          if (resourceEvents >= 100) continue;
          if (entry.duration < 150 && entry.initiatorType !== "script" && entry.initiatorType !== "fetch") continue;
          resourceEvents += 1;
          emit("resource", {
            url: sanitizeWebDiagnosticUrl(entry.name),
            resourceType: entry.initiatorType,
            durationMs: Math.round(entry.duration),
            transferSize: entry.transferSize
          });
        }
      }).observe({ type: "resource", buffered: true });
    } catch {
      // Resource Timing is optional for diagnostics.
    }
  }

  window.setInterval(() => {
    const now = performance.now();
    const drift = Math.max(0, now - heartbeatExpected);
    heartbeatExpected = now + 1_000;
    emit("heartbeat", { driftMs: Math.round(drift), readyState: document.readyState });
    if (drift >= 1_000) emit("heartbeat-stall", { durationMs: Math.round(drift), readyState: document.readyState });
  }, 1_000);

  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    const data = event.data as { source?: string; type?: string } | null;
    if (!data || data.source !== WEB_DIAGNOSTIC_REQUEST_CHANNEL || data.type !== "snapshot") return;
    snapshot();
  });

  snapshot();
}
