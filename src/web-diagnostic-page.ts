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
