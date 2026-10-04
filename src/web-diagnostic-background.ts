import {
  WEB_DIAGNOSTIC_STORAGE_KEY,
  isTnndLocalWebUrl,
  sanitizeWebDiagnosticUrl,
  type OpenWebSocket,
  type PendingWebRequest,
  type WebDiagnosticEvent,
  type WebDiagnosticStore,
  type WebDiagnosticTabState
} from "./web-diagnostic-types";

const MAX_EVENTS = 250;
const MAX_TABS = 6;
let queue: Promise<void> = Promise.resolve();
let cachedStore: WebDiagnosticStore | null = null;
let flushTimer: number | null = null;

function emptyStore(): WebDiagnosticStore {
  return { version: 1, tabs: {} };
}

async function readStore(): Promise<WebDiagnosticStore> {
  if (cachedStore) return cachedStore;
  const raw = (await chrome.storage.session.get(WEB_DIAGNOSTIC_STORAGE_KEY))[WEB_DIAGNOSTIC_STORAGE_KEY] as WebDiagnosticStore | undefined;
  cachedStore = raw?.version === 1 && raw.tabs ? raw : emptyStore();
  return cachedStore;
}

async function flushStore(): Promise<void> {
  flushTimer = null;
  const store = await readStore();
  const tabs = Object.values(store.tabs)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_TABS);
  cachedStore = {
    version: 1,
    tabs: Object.fromEntries(tabs.map((tab) => [String(tab.tabId), tab]))
  };
  await chrome.storage.session.set({ [WEB_DIAGNOSTIC_STORAGE_KEY]: cachedStore });
}

function scheduleFlush(): void {
  if (flushTimer !== null) return;
  flushTimer = globalThis.setTimeout(() => {
    enqueue(flushStore);
  }, 500);
}

function freshState(tabId: number, pageUrl: string, event: WebDiagnosticEvent): WebDiagnosticTabState {
  return {
    tabId,
    pageUrl: sanitizeWebDiagnosticUrl(pageUrl),
    pageSessionId: event.pageSessionId,
    startedAt: event.at,
    updatedAt: event.at,
    lastHeartbeatAt: null,
    lastHeartbeatDriftMs: 0,
    readyState: event.readyState ?? "unknown",
    pendingRequests: {},
    openSockets: {},
    events: []
  };
}

function applyEvent(state: WebDiagnosticTabState, event: WebDiagnosticEvent): void {
  state.updatedAt = event.at;
  if (event.readyState) state.readyState = event.readyState;

  if (event.kind === "heartbeat") {
    state.lastHeartbeatAt = event.at;
    state.lastHeartbeatDriftMs = event.driftMs ?? 0;
    return;
  }

  if (event.kind === "fetch-start" && event.id && event.url) {
    state.pendingRequests[event.id] = {
      id: event.id,
      kind: "fetch",
      url: event.url,
      method: event.method ?? "GET",
      startedAt: event.at
    } satisfies PendingWebRequest;
  }

  if ((event.kind === "fetch-end" || event.kind === "fetch-error") && event.id) {
    delete state.pendingRequests[event.id];
  }

  if (event.kind === "ws-create" && event.id && event.url) {
    state.openSockets[event.id] = {
      id: event.id,
      url: event.url,
      createdAt: event.at,
      openedAt: null
    } satisfies OpenWebSocket;
  }

  if (event.kind === "ws-open" && event.id && state.openSockets[event.id]) {
    state.openSockets[event.id].openedAt = event.at;
  }

  if (event.kind === "ws-close" && event.id) {
    delete state.openSockets[event.id];
  }

  state.events.push(event);
  state.events = state.events.slice(-MAX_EVENTS);
}

function enqueue(task: () => Promise<void>): void {
  queue = queue.then(task, task).catch(() => undefined);
}

chrome.runtime.onMessage.addListener((message: unknown, sender) => {
  const candidate = message as { type?: string; event?: WebDiagnosticEvent } | null;
  if (!candidate || candidate.type !== "TNND_WEB_DIAGNOSTIC_EVENT" || !candidate.event) return false;
  if (sender.id !== chrome.runtime.id || !sender.tab?.id || !isTnndLocalWebUrl(sender.url)) return false;

  const tabId = sender.tab.id;
  const pageUrl = sender.url ?? "http://127.0.0.1:5173/";
  const event = candidate.event;

  enqueue(async () => {
    const store = await readStore();
    const key = String(tabId);
    let state = store.tabs[key];
    if (!state || state.pageSessionId !== event.pageSessionId) {
      state = freshState(tabId, pageUrl, event);
      store.tabs[key] = state;
    }
    applyEvent(state, event);
    scheduleFlush();
  });
  return false;
});

chrome.tabs.onRemoved.addListener((tabId) => {
  enqueue(async () => {
    const store = await readStore();
    if (!store.tabs[String(tabId)]) return;
    delete store.tabs[String(tabId)];
    scheduleFlush();
  });
});


chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "session") return;
  const change = changes[WEB_DIAGNOSTIC_STORAGE_KEY];
  if (!change) return;
  const next = change.newValue as WebDiagnosticStore | undefined;
  cachedStore = next?.version === 1 && next.tabs ? next : emptyStore();
});
