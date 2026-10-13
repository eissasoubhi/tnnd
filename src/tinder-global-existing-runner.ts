import { getBackendSession, getConfig } from "./storage";
import { eligibleExistingThreadRefs, nextExistingThreadRef } from "./tinder-global-existing-policy";

const KEY = "tnnd.globalExistingRunner.v1";
const ALARM = "tnnd.globalExistingRunner.cycle";
const API = "http://127.0.0.1:4000";

interface GlobalExistingRunnerState {
  enabled: boolean;
  userId: string | null;
  tabId: number | null;
  lastRef: string | null;
  lastVisitAt: string | null;
  lastError: string | null;
}
const emptyState = (): GlobalExistingRunnerState => ({
  enabled: false, userId: null, tabId: null, lastRef: null, lastVisitAt: null, lastError: null
});
let busy = false;
const popupSender = (sender: chrome.runtime.MessageSender): boolean =>
  sender.id === chrome.runtime.id && sender.url === `chrome-extension://${chrome.runtime.id}/popup.html`;

async function load(): Promise<GlobalExistingRunnerState> {
  const data = (await chrome.storage.local.get(KEY))[KEY] as Partial<GlobalExistingRunnerState> | undefined;
  if (!data || data.enabled !== true) return { ...emptyState(), tabId: typeof data?.tabId === "number" ? data.tabId : null };
  return {
    enabled: true,
    userId: typeof data.userId === "string" ? data.userId : null,
    tabId: typeof data.tabId === "number" && Number.isInteger(data.tabId) ? data.tabId : null,
    lastRef: typeof data.lastRef === "string" ? data.lastRef : null,
    lastVisitAt: typeof data.lastVisitAt === "string" ? data.lastVisitAt : null,
    lastError: typeof data.lastError === "string" ? data.lastError : null
  };
}
async function save(state: GlobalExistingRunnerState): Promise<void> {
  await chrome.storage.local.set({ [KEY]: state });
}

async function listEligible(): Promise<string[]> {
  const session = await getBackendSession();
  if (!session) throw new Error("TNND account is not connected.");
  const headers = { authorization: `Bearer ${session.token}` };
  const [managementResponse, listResponse] = await Promise.all([
    fetch(`${API}/api/v1/conversations/management`, { headers }),
    fetch(`${API}/api/v1/conversations`, { headers })
  ]);
  if (!managementResponse.ok || !listResponse.ok) throw new Error("TNND conversations could not be loaded.");
  const management = await managementResponse.json() as { conversations?: unknown };
  const list = await listResponse.json() as { conversations?: unknown };
  if (!Array.isArray(management.conversations) || !Array.isArray(list.conversations)) {
    throw new Error("Invalid TNND conversations response.");
  }
  const records = management.conversations.filter((value): value is Record<string, unknown> => Boolean(value && typeof value === "object"))
    .map(record => ({
      id: typeof record.conversationId === "string" ? record.conversationId : "",
      externalThreadId: typeof record.externalThreadId === "string" ? record.externalThreadId : "",
      managementState: typeof record.managementState === "string" ? record.managementState : "",
      explicitlySelected: record.explicitlySelected === true
    }));
  const summaries = list.conversations.filter((value): value is Record<string, unknown> => Boolean(value && typeof value === "object"))
    .map(record => ({
      id: typeof record.id === "string" ? record.id : "",
      status: typeof record.status === "string" ? record.status : "",
      lastMessageAt: typeof record.lastMessageAt === "string" ? record.lastMessageAt : null,
      pendingHumanActions: typeof record.pendingHumanActions === "number" ? record.pendingHumanActions : 0
    }));
  return eligibleExistingThreadRefs(records, summaries);
}

function expectedOwnedUrl(ref: string | null): string {
  return ref ? `https://tinder.com/app/messages/${encodeURIComponent(ref)}` : "https://tinder.com/app/messages";
}

async function ensureOwnedTab(savedId: number | null, lastRef: string | null): Promise<number> {
  if (savedId !== null) {
    try {
      const tab = await chrome.tabs.get(savedId);
      if (tab.id && tab.url === expectedOwnedUrl(lastRef)) return tab.id;
      if (tab.id) throw new Error("Dedicated Tinder tab has navigated elsewhere. Stop the global runner before restarting it.");
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("Dedicated Tinder tab")) throw error;
      // The dedicated tab was closed, so a replacement is allowed.
    }
  }
  const tab = await chrome.tabs.create({ url: "https://tinder.com/app/messages", active: false });
  if (!tab.id) throw new Error("Could not create dedicated Tinder tab.");
  return tab.id;
}

async function tick(): Promise<void> {
  if (busy) return;
  busy = true;
  try {
    const state = await load();
    if (!state.enabled) return;
    const config = await getConfig();
    const session = await getBackendSession();
    if (!session || session.user.id !== state.userId) {
      await stop();
      return;
    }
    // The user's global master switch is still a hard stop.
    if (!config.automation.enabled) {
      await save({ ...state, lastError: "Enable automatic replies in TNND extension Options first." });
      return;
    }
    const refs = await listEligible();
    if (!(await load()).enabled) return;
    const nextRef = nextExistingThreadRef(refs, state.lastRef);
    if (!nextRef) {
      await save({ ...state, lastError: "No eligible AI-managed active existing conversations with saved messages." });
      return;
    }
    const tabId = await ensureOwnedTab(state.tabId, state.lastRef);
    // Closing/stopping the runner at any time must prevent further navigation.
    if (!(await load()).enabled) return;
    await chrome.tabs.update(tabId, { url: `https://tinder.com/app/messages/${encodeURIComponent(nextRef)}` });
    await save({
      ...state, tabId, lastRef: nextRef,
      lastVisitAt: new Date().toISOString(), lastError: null
    });
    // Sending is never performed by the runner: each thread's content script
    // must independently verify incoming message, backend AI takeover, toggles,
    // message cursor, daily cap and quiet hours before any Tinder send.
  } catch (error) {
    const state = await load();
    if (state.enabled) await save({
      ...state, lastError: error instanceof Error ? error.message : "Global visit failed."
    });
  } finally { busy = false; }
}

async function start(): Promise<GlobalExistingRunnerState> {
  const config = await getConfig();
  if (!config.automation.enabled) throw new Error("Turn on 'Enable automatic replies on Tinder' in extension Options before starting global existing chats.");
  const session = await getBackendSession();
  if (!session) throw new Error("Connect your TNND backend account before starting.");
  await save({ ...(await load()), enabled: true, userId: session.user.id, lastError: null });
  const maxDelay = Math.max(60, Math.min(3600, Number(config.automation.replyDelayMaxSeconds) || 60));
  await chrome.alarms.create(ALARM, { periodInMinutes: Math.max(3, Math.ceil((maxDelay + 120) / 60)) });
  void tick();
  return load();
}

async function stop(): Promise<GlobalExistingRunnerState> {
  const state = await load();
  await save({ ...state, enabled: false, lastError: null });
  await chrome.alarms.clear(ALARM);
  if (state.tabId !== null) {
    try {
      const tab = await chrome.tabs.get(state.tabId);
      // Do not close a tab repurposed by the user.
      if (tab.url === expectedOwnedUrl(state.lastRef)) await chrome.tabs.remove(state.tabId);
    } catch { /* already closed */ }
  }
  const after = { ...state, enabled: false, userId: null, tabId: null, lastError: null };
  await save(after);
  return after;
}

chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === ALARM) void tick();
});

chrome.runtime.onStartup.addListener(() => {
  void load().then(async state => {
    if (!state.enabled) return;
    const config = await getConfig();
    const maxDelay = Math.max(60, Math.min(3600, Number(config.automation.replyDelayMaxSeconds) || 60));
    await chrome.alarms.create(ALARM, { periodInMinutes: Math.max(3, Math.ceil((maxDelay + 120) / 60)) });
  });
});

chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
  if (!message || typeof message !== "object") return false;
  const input = message as { type?: unknown };
  if (!["TNND_GLOBAL_EXISTING_STATE","TNND_GLOBAL_EXISTING_START","TNND_GLOBAL_EXISTING_STOP"].includes(String(input.type))) return false;
  if (!popupSender(sender)) {
    sendResponse({ ok: false, error: "Global existing controls require the TNND extension popup." });
    return false;
  }
  if (input.type === "TNND_GLOBAL_EXISTING_STATE") {
    void load().then(state => sendResponse({ ok: true, state })).catch(() => sendResponse({ ok: false, error: "read_failed" }));
    return true;
  }
  void (input.type === "TNND_GLOBAL_EXISTING_START" ? start() : stop())
    .then(state => sendResponse({ ok: true, state }))
    .catch(error => sendResponse({ ok: false, error: error instanceof Error ? error.message : "global_control_failed" }));
  return true;
});
