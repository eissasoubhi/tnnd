import { getBackendSession, getConfig } from "./storage";
import { eligibleExistingThreadRefs, nextExistingThreadRef } from "./tinder-global-existing-policy";

const KEY = "tnnd.globalExistingRunner.v2";
const ALARM = "tnnd.globalExistingRunner.cycle";
const API = "http://127.0.0.1:4000";
const LOG_LIMIT = 16;
const PHASES = ["starting", "checking", "loading", "waiting", "generating", "sending", "sent", "skipped", "error", "stopped"] as const;
type RunnerPhase = typeof PHASES[number];

interface RunnerActivity {
  at: string;
  phase: RunnerPhase;
  detail: string;
  conversation: string | null;
}
interface GlobalExistingRunnerState {
  enabled: boolean;
  userId: string | null;
  tabId: number | null;
  tabMode: "reused" | "created" | null;
  phase: RunnerPhase;
  phaseDetail: string;
  currentLabel: string | null;
  eligibleCount: number;
  visitedCount: number;
  sentCount: number;
  skippedCount: number;
  errorCount: number;
  lastRef: string | null;
  startedAt: string | null;
  lastActionAt: string | null;
  lastVisitAt: string | null;
  lastError: string | null;
  activity: RunnerActivity[];
}
const initial = (): GlobalExistingRunnerState => ({
  enabled: false, userId: null, tabId: null, tabMode: null,
  phase: "stopped", phaseDetail: "Runner stopped.", currentLabel: null,
  eligibleCount: 0, visitedCount: 0, sentCount: 0, skippedCount: 0, errorCount: 0,
  lastRef: null, startedAt: null, lastActionAt: null, lastVisitAt: null,
  lastError: null, activity: []
});
let busy = false;
let starting = false;
const popupSender = (sender: chrome.runtime.MessageSender): boolean =>
  sender.id === chrome.runtime.id && sender.url === `chrome-extension://${chrome.runtime.id}/popup.html`;

function isTinderUrl(value: string | undefined): boolean {
  try {
    const url = new URL(value ?? "");
    return ["https://tinder.com", "https://www.tinder.com"].includes(url.origin);
  } catch { return false; }
}
function tinderRefFromUrl(value: string | undefined): string | null {
  try {
    if (!isTinderUrl(value)) return null;
    const pathname = new URL(value!).pathname;
    if (!pathname.startsWith("/app/messages/")) return null;
    return decodeURIComponent(pathname.slice("/app/messages/".length)).replace(/\/+$/, "");
  } catch { return null; }
}
function activity(state: GlobalExistingRunnerState, phase: RunnerPhase, detail: string, ref: string | null = state.lastRef): GlobalExistingRunnerState {
  const at = new Date().toISOString();
  // Keep only bounded operational metadata, never messages, prompts or tokens.
  const recent = [...state.activity, { at, phase, detail: detail.slice(0, 240), conversation: ref ? (state.currentLabel ?? `Thread ${ref.slice(0, 8)}`) : null }].slice(-LOG_LIMIT);
  return { ...state, phase, phaseDetail: detail.slice(0, 240), lastActionAt: at, activity: recent,
    ...(phase === "error" ? { lastError: detail, errorCount: state.errorCount + 1 } : {}),
    ...(phase === "sent" ? { sentCount: state.sentCount + 1 } : {}),
    ...(phase === "skipped" ? { skippedCount: state.skippedCount + 1 } : {})
  };
}
async function load(): Promise<GlobalExistingRunnerState> {
  const value = (await chrome.storage.local.get(KEY))[KEY] as Partial<GlobalExistingRunnerState> | undefined;
  if (!value || typeof value.enabled !== "boolean") return initial();
  return {
    ...initial(), ...value,
    activity: Array.isArray(value.activity) ? value.activity.slice(-LOG_LIMIT) : [],
    phase: PHASES.includes(value.phase as RunnerPhase) ? value.phase as RunnerPhase : "stopped"
  };
}
async function save(state: GlobalExistingRunnerState): Promise<GlobalExistingRunnerState> {
  await chrome.storage.local.set({ [KEY]: state });
  return state;
}
async function listEligible(): Promise<{ refs: string[]; labels: Map<string, string> }> {
  const session = await getBackendSession();
  if (!session) throw new Error("TNND account is not connected.");
  const headers = { authorization: `Bearer ${session.token}` };
  const [managementResponse, listResponse] = await Promise.all([
    fetch(`${API}/api/v1/conversations/management`, { headers }),
    fetch(`${API}/api/v1/conversations`, { headers })
  ]);
  if (!managementResponse.ok || !listResponse.ok) throw new Error("Cannot load TNND conversations. Check the local API and sign-in.");
  const management = await managementResponse.json() as { conversations?: unknown };
  const list = await listResponse.json() as { conversations?: unknown };
  if (!Array.isArray(management.conversations) || !Array.isArray(list.conversations)) throw new Error("TNND conversation responses are invalid.");
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
      pendingHumanActions: typeof record.pendingHumanActions === "number" ? record.pendingHumanActions : 0,
      displayName: typeof record.displayName === "string" ? record.displayName : ""
    }));
  const ids = new Map(records.map(item => [item.id, item.externalThreadId]));
  const labels = new Map<string, string>();
  for (const item of summaries) {
    const ref = ids.get(item.id);
    if (ref) labels.set(ref, item.displayName && !item.displayName.startsWith("Conversation ") ? item.displayName : `Thread ${ref.slice(0, 8)}`);
  }
  return { refs: eligibleExistingThreadRefs(records, summaries), labels };
}

/** Reuse the EXISTING Tinder tab. Opening a second one can invalidate Tinder's
 * single active web session. Never silently close or steal an unrelated tab. */
async function findSingleTinderTab(): Promise<{ id: number; mode: "reused" | "created" }> {
  const existing = await chrome.tabs.query({ url: ["https://tinder.com/*", "https://www.tinder.com/*"] });
  const tinder = existing.filter(tab => typeof tab.id === "number");
  if (tinder.length > 1) throw new Error("Several Tinder tabs are open. Close the extras and start again; TNND won't close your tabs.");
  if (tinder.length === 1) return { id: tinder[0].id!, mode: "reused" };
  const created = await chrome.tabs.create({ url: "https://tinder.com/app/messages", active: true });
  if (!created.id) throw new Error("Could not open Tinder.");
  return { id: created.id, mode: "created" };
}
async function assertRunnerTab(state: GlobalExistingRunnerState): Promise<number> {
  if (state.tabId === null) throw new Error("Tinder tab is not assigned.");
  const tab = await chrome.tabs.get(state.tabId);
  if (!isTinderUrl(tab.url)) throw new Error("Tinder tab navigated away. Stop runner, reopen Tinder and start again.");
  if (state.lastRef !== null && tinderRefFromUrl(tab.url) !== state.lastRef) {
    throw new Error("Tinder tab changed to a different conversation. Stop runner or return to the managed chat.");
  }
  return state.tabId;
}
async function tick(): Promise<void> {
  if (busy) return;
  busy = true;
  try {
    const state = await load();
    if (!state.enabled) return;
    await save(activity(state, "checking", "Checking account, automation settings and eligible conversations…"));
    const session = await getBackendSession();
    if (!session || session.user.id !== state.userId) {
      await stop("TNND account changed or disconnected; runner stopped.");
      return;
    }
    const config = await getConfig();
    if (!config.automation.enabled) {
      await save(activity(await load(), "waiting", "Automatic replies are OFF in TNND Options. Enable them to continue."));
      return;
    }
    const { refs, labels } = await listEligible();
    if (!(await load()).enabled) return;
    const nextRef = nextExistingThreadRef(refs, state.lastRef);
    if (!nextRef) {
      await save(activity({ ...await load(), eligibleCount: refs.length }, "waiting", "No eligible AI-managed conversations with synchronized messages. Authorize and sync them in TNND Web."));
      return;
    }
    const current = await load();
    const tabId = await assertRunnerTab(current);
    if (!(await load()).enabled) return;
    const label = labels.get(nextRef) ?? `Thread ${nextRef.slice(0, 8)}`;
    const target = `https://tinder.com/app/messages/${encodeURIComponent(nextRef)}`;
    await save(activity({ ...current, tabId, eligibleCount: refs.length, currentLabel: label },
      "loading", `Opening ${label} · visit ${current.visitedCount + 1}…`, nextRef));
    await chrome.tabs.update(tabId, { url: target });
    const latest = await load();
    if (!latest.enabled) return;
    await save({ ...latest, lastRef: nextRef, currentLabel: label, visitedCount: latest.visitedCount + 1,
      lastVisitAt: new Date().toISOString() });
    // Reply sending remains solely in Tinder content script, guarded by both
    // server management and per-chat settings. Runner never calls Send.
  } catch (error) {
    const latest = await load();
    if (latest.enabled) await save(activity(latest, "error", error instanceof Error ? error.message : "Runner failed."));
  } finally { busy = false; }
}
async function start(): Promise<GlobalExistingRunnerState> {
  if (starting) throw new Error("Runner is already starting.");
  starting = true;
  try {
    const current = await load();
    if (current.enabled) return current;
    const config = await getConfig();
    if (!config.automation.enabled) throw new Error("Enable 'Automatic replies' in TNND Options before starting.");
    const session = await getBackendSession();
    if (!session) throw new Error("Connect your TNND account first.");
    const future = (await chrome.storage.local.get("tnnd.newMatchLinkObservation.v3"))["tnnd.newMatchLinkObservation.v3"] as { enabled?: boolean } | undefined;
    if (future?.enabled) throw new Error("New-match AI is active. Stop it before running existing chats: Tinder supports only one active tab.");
    const { refs } = await listEligible();
    if (!refs.length) throw new Error("No eligible existing conversations. Check synchronized message history and AI-managed status in TNND Web.");
    const tab = await findSingleTinderTab();
    let next = initial();
    next = activity({ ...next, enabled: true, userId: session.user.id, tabId: tab.id, tabMode: tab.mode,
      eligibleCount: refs.length, startedAt: new Date().toISOString() },
      "starting", `Using ${tab.mode === "reused" ? "the existing" : "a newly opened"} Tinder tab · ${refs.length} eligible chats.`);
    await save(next);
    const maxDelay = Math.max(60, Math.min(3600, Number(config.automation.replyDelayMaxSeconds) || 60));
    await chrome.alarms.create(ALARM, { periodInMinutes: Math.max(3, Math.ceil((maxDelay + 120) / 60)) });
    void tick();
    return load();
  } finally { starting = false; }
}
async function stop(reason = "Runner stopped. Tinder tab kept open."): Promise<GlobalExistingRunnerState> {
  const state = await load();
  // Do not close a reused or newly created tab; it belongs to the user after
  // taking over the sole Tinder session. Never force logout by opening another.
  const next = activity({ ...state, enabled: false, userId: null }, "stopped", reason);
  await save(next);
  await chrome.alarms.clear(ALARM);
  return next;
}
async function contentEvent(sender: chrome.runtime.MessageSender, message: { phase?: unknown; detail?: unknown; ref?: unknown }): Promise<void> {
  const state = await load();
  if (!state.enabled || typeof sender.tab?.id !== "number" || sender.tab.id !== state.tabId) return;
  const senderRef = tinderRefFromUrl(sender.url);
  if (!senderRef || state.lastRef !== senderRef || message.ref !== senderRef) return;
  if (typeof message.phase !== "string" || !PHASES.includes(message.phase as RunnerPhase)
    || !["waiting", "generating", "sending", "sent", "skipped", "error"].includes(message.phase)) return;
  const phase = message.phase as RunnerPhase;
  const detail = typeof message.detail === "string" ? message.detail.slice(0, 240) : phase;
  // Ignore duplicate status events, especially periodic "no incoming" scans.
  if (state.phase === phase && state.phaseDetail === detail && phase !== "sent") return;
  // Reject late navigation events from an older chat tab.
  await save(activity(state, phase, detail, senderRef));
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
  const input = message as { type?: unknown; phase?: unknown; detail?: unknown; ref?: unknown };
  if (input.type === "TNND_EXISTING_RUNNER_EVENT") {
    if (sender.id !== chrome.runtime.id || !isTinderUrl(sender.url)) return false;
    void contentEvent(sender, input).then(() => sendResponse({ ok: true }))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }
  if (!["TNND_GLOBAL_EXISTING_STATE", "TNND_GLOBAL_EXISTING_START", "TNND_GLOBAL_EXISTING_STOP"].includes(String(input.type))) return false;
  if (!popupSender(sender)) {
    sendResponse({ ok: false, error: "Global existing controls require the TNND extension popup." });
    return false;
  }
  if (input.type === "TNND_GLOBAL_EXISTING_STATE") {
    void load().then(state => sendResponse({ ok: true, state }))
      .catch(() => sendResponse({ ok: false, error: "state_unavailable" }));
    return true;
  }
  void (input.type === "TNND_GLOBAL_EXISTING_START" ? start() : stop())
    .then(state => sendResponse({ ok: true, state }))
    .catch(error => sendResponse({ ok: false, error: error instanceof Error ? error.message : "runner_failed" }));
  return true;
});
