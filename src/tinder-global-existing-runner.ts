import { getBackendSession, getChatSettings, getConfig, saveChatSettings } from "./storage";
import { waitForTinderContentBridge, isMissingTinderReceiver, describeTinderBridgeError } from "./tinder-tab-connection";
import { tinderThreadKeyFromPath } from "./tinder-thread-identity";
import { partitionExistingChatPermissions } from "./tinder-existing-chat-settings-policy";
import { eligibleExistingThreadRefs } from "./tinder-global-existing-policy";
import { reconcileExistingIndex, markThreadChecked, observeUnreadThreads, nextIndexedExistingThread, isExistingThreadIndex, type ExistingThreadIndex } from "./tinder-existing-thread-index";
import { nextWatchedReply, pendingWatchedReplies, watcherDisplayStatus, newlyVisibleUnread } from "./tinder-reply-watcher";
import { followConversationAfterSignal, shouldKeepConversationInFocus, normalizeConversationActivities, type ConversationActivity } from "./tinder-conversation-activity";
import { emptyWatchedMatches, isWatchedMatches, observeWatchedMatches, type WatchedMatches } from "./tinder-match-watcher";
import { sendSingleWatchedMatch } from "./tinder-global-new-match-runner";
import { nextWatcherMatchAction, nextMatchOpener, type WatcherMatchPhase } from "./tinder-watcher-match-cycle";
import { firstMessageDailyLimit, hasReachedFirstMessageDailyLimit } from "./tinder-first-message-daily-limit";
import { withSpaNavigationTimeout, isStalledOpening, SpaNavigationTimeoutError } from "./tinder-runner-navigation-timeout";

const KEY = "tnnd.globalExistingRunner.v2";
const ALARM = "tnnd.globalExistingRunner.cycle";
const CADENCE_KEY = "tnnd.globalExistingRunner.cadenceSeconds.v1";
const ALLOWED_CADENCES = [10, 15, 30, 60, 120] as const;
const DEFAULT_CADENCE = 15;
async function getCadenceSeconds(): Promise<number> {
  const stored = (await chrome.storage.local.get(CADENCE_KEY))[CADENCE_KEY];
  return typeof stored === "number" && ALLOWED_CADENCES.some(n => n === stored) ? stored : DEFAULT_CADENCE;
}
const API = "http://127.0.0.1:4000";
const LOG_LIMIT = 16;
const WORK_INDEX_KEY = "tnnd.existingThreadWorkIndex.v1";
const WATCHER_ATTEMPTS_KEY = "tnnd.watcherOpenerAttempted.v1";
const PHASES = ["starting", "checking", "loading", "incoming", "waiting", "generating", "sending", "sent", "skipped", "error", "stopped"] as const;
type RunnerPhase = typeof PHASES[number];

interface RunnerActivity {
  at: string;
  phase: RunnerPhase;
  detail: string;
  conversation: string | null;
}
interface GlobalExistingRunnerState {
  enabled: boolean;
  mode: "runner" | "watcher";
  pendingReplies: number;
  autoOpenersEnabled: boolean;
  matchPhase: WatcherMatchPhase;
  matchPhaseStartedAt: string | null;
  lastMatchScanAt: string | null;
  lastIncomingAt: string | null;
  watchedMatches: WatchedMatches | null;
  visibleUnreadRefs: string[];
  watcherStatus: ReturnType<typeof watcherDisplayStatus>;
  userId: string | null;
  tabId: number | null;
  tabMode: "reused" | "created" | null;
  pausedOnStop: boolean;
  phase: RunnerPhase;
  dwellSeconds: number;
  phaseDetail: string;
  currentLabel: string | null;
  eligibleCount: number;
  visitedCount: number;
  sentCount: number;
  skippedCount: number;
  errorCount: number;
  lastRef: string | null;
  activeConversationRef: string | null;
  activeConversationUntil: string | null;
  conversationActivities: ConversationActivity[];
  cursorRef: string | null;
  startedAt: string | null;
  lastActionAt: string | null;
  lastVisitAt: string | null;
  lastError: string | null;
  activity: RunnerActivity[];
}
const initial = (): GlobalExistingRunnerState => ({
  enabled: false, mode: "runner", pendingReplies: 0, autoOpenersEnabled: false,
  matchPhase: "idle", matchPhaseStartedAt: null, lastMatchScanAt: null, lastIncomingAt: null, watchedMatches: null, visibleUnreadRefs: [], watcherStatus: "stopped", userId: null, tabId: null, tabMode: null, pausedOnStop: false,
  phase: "stopped", dwellSeconds: DEFAULT_CADENCE, phaseDetail: "Runner stopped.", currentLabel: null,
  eligibleCount: 0, visitedCount: 0, sentCount: 0, skippedCount: 0, errorCount: 0,
  lastRef: null, activeConversationRef: null, activeConversationUntil: null, conversationActivities: [], cursorRef: null, startedAt: null, lastActionAt: null, lastVisitAt: null,
  lastError: null, activity: []
});
let busy = false;
let starting = false;
const popupSender = (sender: chrome.runtime.MessageSender): boolean =>
  sender.id === chrome.runtime.id && sender.url === `chrome-extension://${chrome.runtime.id}/popup.html`;
const webReadOnlySender = (sender: chrome.runtime.MessageSender): boolean => {
  if (sender.id !== chrome.runtime.id) return false;
  try {
    return ["http://127.0.0.1:5173", "http://localhost:5173"].includes(new URL(sender.url ?? "").origin);
  } catch { return false; }
};

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
    mode: value.mode === "watcher" ? "watcher" : "runner",
    activeConversationRef: typeof value.activeConversationRef === "string" ? value.activeConversationRef : null,
    activeConversationUntil: typeof value.activeConversationUntil === "string" ? value.activeConversationUntil : null,
    conversationActivities: normalizeConversationActivities(value.conversationActivities),
    pendingReplies: typeof value.pendingReplies === "number" && value.pendingReplies >= 0 ? value.pendingReplies : 0,
    autoOpenersEnabled: value.autoOpenersEnabled === true,
    matchPhase: ["idle", "verifying", "opener"].includes(String(value.matchPhase)) ? value.matchPhase! : "idle",
    matchPhaseStartedAt: typeof value.matchPhaseStartedAt === "string" ? value.matchPhaseStartedAt : null,
    lastMatchScanAt: typeof value.lastMatchScanAt === "string" ? value.lastMatchScanAt : null,
    lastIncomingAt: typeof value.lastIncomingAt === "string" ? value.lastIncomingAt : null,
    watchedMatches: value.userId && isWatchedMatches(value.watchedMatches, value.userId) ? value.watchedMatches : null,
    visibleUnreadRefs: Array.isArray(value.visibleUnreadRefs) ? value.visibleUnreadRefs.filter(ref => typeof ref === "string").slice(0, 100) : [],
    phase: PHASES.includes(value.phase as RunnerPhase) ? value.phase as RunnerPhase : "stopped"
  };
}
// Serialize changes from the content Match observer and runner ticks to
// prevent an older tick from reverting an already observed Matches baseline.
let pendingStateWrite: Promise<void> = Promise.resolve();
async function save(state: GlobalExistingRunnerState): Promise<GlobalExistingRunnerState> {
  const write = pendingStateWrite.then(async () => {
    const raw = (await chrome.storage.local.get(KEY))[KEY] as GlobalExistingRunnerState | undefined;
    // The user stopped this exact session while an async tick was in flight.
    // Never allow a late observer callback to silently restart the watcher.
    if (state.enabled && raw && !raw.enabled && raw.startedAt === state.startedAt
      && raw.startedAt !== null) return raw;
    const previous = raw?.enabled && raw.userId === state.userId && raw.mode === "watcher"
      && state.mode === "watcher" && isWatchedMatches(raw.watchedMatches, state.userId ?? "")
      ? raw.watchedMatches : null;
    const proposed = state.watchedMatches;
    const latestMatchWatch = previous && (!proposed || (previous.observedAt ?? "") > (proposed.observedAt ?? ""))
      ? previous : proposed;
    // A content-script reply event may arrive while an async tick is reading
    // the backend. Never let that older tick roll back the newest attention
    // observation or its focus window.
    const sameSession = state.enabled && raw?.enabled && raw.userId === state.userId
      && raw.startedAt === state.startedAt;
    const rawAttention = sameSession ? normalizeConversationActivities(raw.conversationActivities) : [];
    const proposedAttention = normalizeConversationActivities(state.conversationActivities);
    const rawIsNewer = Boolean(sameSession && (rawAttention[0]?.lastInteractionAt ?? "")
      > (proposedAttention[0]?.lastInteractionAt ?? ""));
    const merged = {
      ...state,
      ...(rawIsNewer ? {
        activeConversationRef: raw!.activeConversationRef,
        activeConversationUntil: raw!.activeConversationUntil
      } : {}),
      conversationActivities: state.enabled
        ? normalizeConversationActivities([...proposedAttention, ...rawAttention]) : [],
      watchedMatches: state.enabled && state.mode === "watcher"
        ? latestMatchWatch : state.watchedMatches
    };
    const next = { ...merged, watcherStatus: watcherDisplayStatus(merged) };
    await chrome.storage.local.set({ [KEY]: next });
    return next;
  });
  pendingStateWrite = write.then(() => undefined, () => undefined);
  return write;
}
async function listEligible(): Promise<{ refs: string[]; disabledRefs: string[]; labels: Map<string, string>; messageTimes: Map<string, string | null>; messageDirections: Map<string, "incoming" | "outgoing" | null> }> {
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
      lastMessageDirection: record.lastMessageDirection === "incoming" || record.lastMessageDirection === "outgoing"
        ? record.lastMessageDirection as "incoming" | "outgoing" : null,
      pendingHumanActions: typeof record.pendingHumanActions === "number" ? record.pendingHumanActions : 0,
      displayName: typeof record.displayName === "string" ? record.displayName : ""
    }));
  const ids = new Map(records.map(item => [item.id, item.externalThreadId]));
  const messageDirections = new Map<string, "incoming" | "outgoing" | null>();
  const messageTimes = new Map<string, string | null>();
  const labels = new Map<string, string>();
  for (const item of summaries) {
    const ref = ids.get(item.id);
    if (ref) {
      labels.set(ref, item.displayName && !item.displayName.startsWith("Conversation ") ? item.displayName : `Thread ${ref.slice(0, 8)}`);
      messageTimes.set(ref, item.lastMessageAt);
      messageDirections.set(ref, item.lastMessageDirection);
    }
  }

  const authorized = eligibleExistingThreadRefs(records, summaries);
  const settingsByRef = new Map<string, { enabled: boolean }>();
  for (const ref of authorized) {
    const threadKey = tinderThreadKeyFromPath("/app/messages/" + encodeURIComponent(ref));
    settingsByRef.set(ref, await getChatSettings(threadKey));
  }
  const { ready, disabled } = partitionExistingChatPermissions(authorized, settingsByRef);
  return { refs: ready, disabledRefs: disabled, labels, messageTimes, messageDirections };
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
async function readWorkIndex(userId: string): Promise<ExistingThreadIndex | null> {
  const stored = (await chrome.storage.local.get(WORK_INDEX_KEY))[WORK_INDEX_KEY];
  return isExistingThreadIndex(stored) && stored.userId === userId ? stored : null;
}
async function saveWorkIndex(state: ExistingThreadIndex): Promise<void> {
  await chrome.storage.local.set({ [WORK_INDEX_KEY]: state });
}
function isMatchCycleState(state: GlobalExistingRunnerState, source: GlobalExistingRunnerState): boolean {
  return state.enabled && state.mode === "watcher" && state.startedAt === source.startedAt
    && state.userId === source.userId && state.tabId === source.tabId;
}
async function readOpenerAttempts(userId: string): Promise<string[]> {
  const stored = (await chrome.storage.local.get(WATCHER_ATTEMPTS_KEY))[WATCHER_ATTEMPTS_KEY] as
    { userId?: string; refs?: unknown } | undefined;
  return stored?.userId === userId && Array.isArray(stored.refs)
    ? stored.refs.filter((ref): ref is string => typeof ref === "string").slice(-500) : [];
}
async function claimWatchedOpener(userId: string, ref: string): Promise<boolean> {
  // This is durable BEFORE navigating or attempting the irreversible Send.
  // A service-worker crash is fail-closed; no automatic replay.
  const prior = await readOpenerAttempts(userId);
  if (prior.includes(ref)) return false;
  await chrome.storage.local.set({ [WATCHER_ATTEMPTS_KEY]: {
    userId, refs: [...prior, ref].slice(-500)
  } });
  return true;
}
async function watcherSidebar(
  tabId: number, target: "messages" | "matches", expectedRef: string | null
): Promise<{ ok?: boolean; error?: string; refs?: unknown }> {
  return chrome.tabs.sendMessage(tabId, {
    type: "TNND_WATCHER_SELECT_SIDEBAR", target, expectedRef
  });
}
async function returnWatcherToMessages(state: GlobalExistingRunnerState, note: string): Promise<void> {
  if (state.tabId === null) return;
  try {
    const tab = await chrome.tabs.get(state.tabId);
    const result = await watcherSidebar(state.tabId, "messages", tinderRefFromUrl(tab.url));
    if (!result?.ok) throw new Error(result?.error ?? "messages_switch_not_confirmed");
    const live = await load();
    if (!isMatchCycleState(live, state)) return;
    await save(activity({ ...live, matchPhase: "idle", matchPhaseStartedAt: null,
      lastRef: tinderRefFromUrl(tab.url), activeConversationRef: null, activeConversationUntil: null },
      "waiting", note));
  } catch (error) {
    const live = await load();
    if (isMatchCycleState(live, state)) {
      await save(activity({ ...live, enabled: false, autoOpenersEnabled: false,
        matchPhase: "idle", matchPhaseStartedAt: null, pausedOnStop: true },
        "error", "Watcher paused to protect current Tinder state; switch to Messages manually: "
          + (error instanceof Error ? error.message : "sidebar_not_available")));
      await chrome.alarms.clear(ALARM);
    }
  }
}
async function scanMatchesCycle(state: GlobalExistingRunnerState): Promise<void> {
  if (state.tabId === null || !state.userId) return;
  const action = nextWatcherMatchAction(state, {
    activeFollow: false, pendingReplies: state.pendingReplies, replyProcessing: false
  });
  if (action === "none") return;
  if (action === "recover") {
    await returnWatcherToMessages(state, "Returning to Messages to prioritize replies.");
    return;
  }
  if (action === "scan") {
    const tab = await chrome.tabs.get(state.tabId);
    const ref = tinderRefFromUrl(tab.url);
    const result = await watcherSidebar(state.tabId, "matches", ref);
    const live = await load();
    if (!isMatchCycleState(live, state)) return;
    if (!result?.ok) {
      await save(activity({ ...live, lastMatchScanAt: new Date().toISOString() },
        "waiting", "Cannot safely open Tinder Matches: " + (result?.error ?? "not_confirmed")));
      return;
    }
    const now = new Date().toISOString();
    const observed = Array.isArray(result.refs) && live.watchedMatches
      ? observeWatchedMatches(live.watchedMatches, result.refs, now) : live.watchedMatches;
    await save(activity({ ...live, watchedMatches: observed, matchPhase: "verifying",
      matchPhaseStartedAt: now, lastMatchScanAt: now, lastRef: ref },
      "waiting", "Briefly checking visible Tinder Matches; verifying new tiles without sending."));
    return;
  }
  // >=16 s after first observation: confirm new Matches tiles, then prioritize
  // any newly synced replies before considering at most one first message.
  const snapshot = await chrome.tabs.sendMessage(state.tabId, { type: "TNND_WATCHER_READ_MATCHES" }) as
    { ok?: boolean; refs?: unknown };
  const current = await load();
  if (!isMatchCycleState(current, state)) return;
  if (!snapshot?.ok || !Array.isArray(snapshot.refs) || !current.watchedMatches) {
    await returnWatcherToMessages(current, "Matches not visible; returning to Messages.");
    return;
  }
  const inventory = observeWatchedMatches(current.watchedMatches, snapshot.refs);
  await save({ ...current, watchedMatches: inventory });
  const session = await getBackendSession();
  if (!session || session.user.id !== state.userId) {
    await stop("TNND account changed while checking Matches.");
    return;
  }
  const { refs, messageTimes, messageDirections } = await listEligible();
  const work = reconcileExistingIndex(await readWorkIndex(session.user.id), session.user.id,
    refs.map(ref => ({ ref, lastMessageAt: messageTimes.get(ref) ?? null,
      lastMessageDirection: messageDirections.get(ref) ?? null })));
  await saveWorkIndex(work);
  if (pendingWatchedReplies(work) > 0) {
    await returnWatcherToMessages(await load(), "New reply detected; prioritizing Messages.");
    return;
  }
  const after = await load();
  if (!isMatchCycleState(after, state)) return;
  if (after.lastIncomingAt && after.matchPhaseStartedAt
    && Date.parse(after.lastIncomingAt) > Date.parse(after.matchPhaseStartedAt)) {
    await returnWatcherToMessages(after, "New incoming reply preempted Matches; returning to Messages.");
    return;
  }
  if (!after.autoOpenersEnabled) {
    await returnWatcherToMessages(after, "Matches checked; first messages are not enabled.");
    return;
  }
  const currentlyVisible = new Set(snapshot.refs.filter((ref): ref is string => typeof ref === "string"));
  const ref = nextMatchOpener(
    inventory.existingRefs.filter(ref => currentlyVisible.has(ref)),
    inventory.newRefs.filter(ref => currentlyVisible.has(ref)),
    await readOpenerAttempts(session.user.id));
  if (!ref) {
    await returnWatcherToMessages(after, "No eligible unattempted match tiles; watching Messages.");
    return;
  }
  // Do not burn a match's one-shot watcher claim when today's daily opener
  // quota is already exhausted. It remains eligible on a later UTC day.
  const currentConfig = await getConfig();
  const journals = await chrome.storage.local.get([
    "tnnd.newMatchDailyAttempts.v1", "tnnd.firstMessageAttempts.v1"
  ]);
  const daily = journals["tnnd.newMatchDailyAttempts.v1"] as { date?: string; refs?: string[] } | undefined;
  const claims = journals["tnnd.firstMessageAttempts.v1"] as Record<string, number> | undefined;
  const today = new Date().toISOString().slice(0, 10);
  const dailyUsed = daily?.date === today && Array.isArray(daily.refs) ? daily.refs.length : 0;
  const limit = firstMessageDailyLimit(currentConfig.automation.maxFirstMessagesPerDay);
  if (dailyUsed >= limit || hasReachedFirstMessageDailyLimit(claims ?? {}, limit)) {
    await returnWatcherToMessages(after, `Daily first-message quota (${limit}) reached; retry next UTC day without claiming a match.`);
    return;
  }
  // Explicit opt-in, verified Matches tile, no incoming reply and same account.
  // Store a one-shot watcher claim before entering the normal first-message
  // worker. Never retry automatically if navigation/send acknowledgement fails.
  if (!(await claimWatchedOpener(session.user.id, ref))) {
    await returnWatcherToMessages(after, "Match already attempted; watching Messages.");
    return;
  }
  await save(activity({ ...after, matchPhase: "opener", matchPhaseStartedAt: new Date().toISOString() }, "loading",
    "Checking one match opener against daily limits and empty-thread permission."));
  let outcome: { attempted: boolean; sent: boolean; reason: string } | null = null;
  try {
    outcome = await sendSingleWatchedMatch(ref, state.tabId, session.user.id);
  } catch (error) {
    outcome = { attempted: false, sent: false,
      reason: error instanceof Error ? error.message : "opener_failed" };
  }
  const finished = await load();
  if (!isMatchCycleState(finished, state)) return;
  await returnWatcherToMessages(finished, outcome.sent
    ? "First message attempted successfully; returned to Messages."
    : "Opener skipped without automatic retry: " + outcome.reason);
}

async function tick(): Promise<void> {
  if (busy) return;
  busy = true;
  try {
    const state = await load();
    if (!state.enabled) return;
    if (isStalledOpening(state.phase, state.lastActionAt)) {
      // Chrome can suspend the worker between a navigation and its response.
      // Do not leave an old Opening chat state running for minutes.
      const paused = activity(state, "error", "Chat opening was never confirmed. Runner paused safely after 20 seconds; inspect Tinder tab and restart. No retry or send.");
      await save({ ...paused, enabled: false, userId: null, pausedOnStop: true });
      await chrome.alarms.clear(ALARM);
      return;
    }
    const dwellSeconds = await getCadenceSeconds();
    // Current attention is derived from recent reciprocal response speed;
    // it shrinks as the chat cools down, independently from reply delay.
    if (state.mode === "watcher" && state.matchPhase === "idle" && state.tabId !== null && state.activeConversationRef) {
      const currentTab = await chrome.tabs.get(state.tabId);
      if (shouldKeepConversationInFocus(state,
        tinderRefFromUrl(currentTab.url), [state.activeConversationRef])) return;
    }
    if (state.lastVisitAt && Date.now() - Date.parse(state.lastVisitAt) < dwellSeconds * 1000) return;
    // A loaded old conversation can still be waiting for the configured cadence
    // or Gemini. Do not navigate away before that pending reply completes.
    const configForLease = await getConfig();
    const maxReplyDelaySeconds = Math.min(3600, Math.max(0, Number(configForLease.automation.replyDelayMaxSeconds) || 60));
    const leaseMs = (maxReplyDelaySeconds + 180) * 1000;
    const elapsed = state.lastActionAt ? Date.now() - Date.parse(state.lastActionAt) : Number.POSITIVE_INFINITY;
    const replyInProgress = state.phase === "generating" || state.phase === "sending"
      || (state.phase === "waiting" && state.phaseDetail.startsWith("Unanswered incoming message found"));
    if (replyInProgress && !(state.mode === "watcher" && state.matchPhase === "verifying")
      && Number.isFinite(elapsed) && elapsed >= 0 && elapsed < leaseMs) {
      // Keep the exact Tinder tab/thread open until Send succeeds, fails, or
      // the lease expires. A later cycle can continue other conversations.
      return;
    }
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
    const { refs, labels, messageTimes, messageDirections } = await listEligible();
    if (!(await load()).enabled) return;
    const work = reconcileExistingIndex(await readWorkIndex(session.user.id), session.user.id,
      refs.map(ref => ({ ref, lastMessageAt: messageTimes.get(ref) ?? null, lastMessageDirection: messageDirections.get(ref) ?? null })));
    let queued = work;
    if (state.mode === "watcher" && state.tabId !== null) {
      // Recover hints after a worker restart: do not depend on a changed
      // fingerprint or on an always-running content timer alone.
      try {
        const snapshot = await chrome.tabs.sendMessage(state.tabId, {
          type: "TNND_WATCHER_READ_UNREAD"
        }) as { ok?: boolean; refs?: unknown };
        if (snapshot?.ok && Array.isArray(snapshot.refs)) {
          const visible = snapshot.refs.filter((ref): ref is string => typeof ref === "string").slice(0, 100);
          const currentState = await load();
          queued = observeUnreadThreads(queued, newlyVisibleUnread(currentState.visibleUnreadRefs, visible));
          await save({ ...currentState, visibleUnreadRefs: visible });
        }
      } catch { /* The open page/alarm may reconnect on the next cycle. */ }
    }
    await saveWorkIndex(queued);
    const pendingReplies = pendingWatchedReplies(queued);
    // Complete/abort an in-flight Matches scan before any reply navigation:
    // it always switches back to Messages first.
    if (state.mode === "watcher" && state.matchPhase !== "idle") {
      const pendingState = await load();
      if (pendingState.enabled && pendingState.mode === "watcher")
        await scanMatchesCycle({ ...pendingState, pendingReplies });
      return;
    }
    const nextRef = state.mode === "watcher" ? nextWatchedReply(queued) : nextIndexedExistingThread(queued);
    if (!nextRef) {
      const detail = state.mode === "watcher"
        ? `Watching ${refs.length} eligible chats. Waiting for incoming replies on Tinder.`
        : `All ${refs.length} indexed chats checked. Waiting for new unread events or changed server message timestamps.`;
      const latestWaiting = await load();
      if (latestWaiting.phase !== "waiting" || latestWaiting.phaseDetail !== detail ||
          latestWaiting.pendingReplies !== pendingReplies) {
        await save(activity({ ...latestWaiting, eligibleCount: refs.length, pendingReplies }, "waiting", detail));
      }
      if (state.mode === "watcher")
        await scanMatchesCycle({ ...await load(), pendingReplies });
      return;
    }
    const current = await load();
    const tabId = await assertRunnerTab(current);
    if (!(await load()).enabled) return;
    const label = labels.get(nextRef) ?? `Thread ${nextRef.slice(0, 8)}`;
    await save(activity({ ...current, tabId, eligibleCount: refs.length, pendingReplies, currentLabel: label },
      "loading", `Opening ${label} · visit ${current.visitedCount + 1}…`, nextRef));
    const tab = await chrome.tabs.get(tabId);
    const expectedRef = tinderRefFromUrl(tab.url);
    // An incoming message can arrive while the backend work list is fetched.
    // Recheck the live focus immediately before any SPA navigation.
    const beforeNavigation = await load();
    if (beforeNavigation.mode === "watcher"
      && shouldKeepConversationInFocus(beforeNavigation, expectedRef, refs)) return;
    const result = await withSpaNavigationTimeout(chrome.tabs.sendMessage(tabId, {
      type: "TNND_EXISTING_SPA_NAVIGATE", ref: nextRef, expectedRef
    })) as { ok?: boolean; error?: string; currentRef?: string; identity?: { firstName?: string; age?: number } };
    if (!result?.ok || result.currentRef !== nextRef) {
      const latest = await load();
      const reason = result?.error ?? "spa_navigation_unconfirmed";
      if (reason === "thread_not_in_visible_sidebar") {
        await saveWorkIndex(markThreadChecked(queued, nextRef));
        await save(activity({ ...latest, cursorRef: nextRef, lastVisitAt: new Date().toISOString() },
          "skipped", `Cannot find ${label} in the currently loaded Tinder Messages sidebar. Scroll/load that chat to include it; no full-page reload.`, nextRef));
      } else if (reason === "conversation_processing_in_progress") {
        // A reply or manual send is still being processed on the Tinder tab.
        // Keep the current conversation, then try the next one in a later tick.
        await save(activity(latest, "waiting", "Current chat is busy replying; switching delayed until it is safe."));
      } else {
        await save(activity(latest, "error", `Navigation to ${label} stopped: ${reason}. Tinder was not reloaded.`, nextRef));
        await stop("Runner paused because in-page chat navigation was not confirmed.");
      }
      return;
    }
    const latest = await load();
    if (!latest.enabled) return;
    const checked = markThreadChecked(queued, nextRef);
    await saveWorkIndex(checked);
    const name = typeof result.identity?.firstName === "string" &&
      /^[\p{L}][\p{L}\p{M}\p{N} ._'’\-]{1,79}$/u.test(result.identity.firstName)
      ? result.identity.firstName : null;
    const displayedLabel = name ?? label;
    // Merely opening an old conversation is not proof that the match is online.
    // A cold thread gets only a short observation window.
    await save(activity({ ...latest, pendingReplies: pendingWatchedReplies(checked), lastRef: nextRef,
      ...(latest.mode === "watcher" ? followConversationAfterSignal(latest, nextRef, "opened") : {}),
      cursorRef: nextRef, currentLabel: displayedLabel, visitedCount: latest.visitedCount + 1,
      lastVisitAt: new Date().toISOString() }, "waiting",
      `Opened ${displayedLabel}. Listening for incoming replies.`, nextRef));
    // Reply sending remains solely in Tinder content script, guarded by both
    // server management and per-chat settings. Runner never calls Send.
  } catch (error) {
    const latest = await load();
    if (latest.enabled) {
      if (error instanceof SpaNavigationTimeoutError) {
        const failed = activity(latest, "error", error.message);
        await save({ ...failed, enabled: false, userId: null, pausedOnStop: true });
        await chrome.alarms.clear(ALARM);
      } else if (isMissingTinderReceiver(error)) {
        const failed = activity(latest, "error", describeTinderBridgeError(error));
        // Pause, preserve the tab and leave the error visible instead of
        // accumulating failures on every 30-second alarm.
        await save({ ...failed, enabled: false, userId: null, pausedOnStop: true });
        await chrome.alarms.clear(ALARM);
      } else {
        await save(activity(latest, "error", error instanceof Error ? error.message : "Runner failed."));
      }
    }
  } finally { busy = false; }
}
export async function startExistingRunner(enablePreviouslyDisabled = false, mode: "runner" | "watcher" = "runner", autoOpenersEnabled = false): Promise<GlobalExistingRunnerState> {
  if (starting) throw new Error("Runner is already starting.");
  starting = true;
  try {
    const current = await load();
    if (current.enabled) {
      if (current.mode !== mode || (mode === "watcher" && current.autoOpenersEnabled !== autoOpenersEnabled))
        throw new Error("Stop the current runner or watcher before switching modes.");
      return current;
    }
    if (mode === "watcher" && enablePreviouslyDisabled) throw new Error("Watcher cannot enable disabled chats in bulk.");
    const config = await getConfig();
    if (!config.automation.enabled) throw new Error("Enable 'Automatic replies' in TNND Options before starting.");
    const session = await getBackendSession();
    if (!session) throw new Error("Connect your TNND account first.");
    const future = (await chrome.storage.local.get("tnnd.newMatchLinkObservation.v3"))["tnnd.newMatchLinkObservation.v3"] as { enabled?: boolean } | undefined;
    if (future?.enabled) throw new Error("New-match AI is active. Stop it before running existing chats: Tinder supports only one active tab.");

    const selection = await listEligible();
    if (mode !== "watcher" && !selection.refs.length && !selection.disabledRefs.length) {
      throw new Error("No eligible existing conversations. Sync chats and authorize AI management in TNND Web.");
    }
    if (mode !== "watcher" && !selection.refs.length && !enablePreviouslyDisabled) {
      throw new Error(selection.disabledRefs.length + " eligible chat(s) are disabled individually. Start again and explicitly confirm bulk reactivation, or re-enable them one by one.");
    }
    // Check Tinder tabs before modifying per-chat settings.
    const tab = await findSingleTinderTab();
    // Fail BEFORE enabling any per-chat settings or the global runner.
    // A stale Tinder page after reloading the extension has no receiver.
    await waitForTinderContentBridge(tab.id);
    if (enablePreviouslyDisabled) {
      // Only backend-confirmed AI-managed active existing chats enter this list.
      // Manual, archived, disabled and human-action-blocked chats stay excluded.
      for (const ref of selection.disabledRefs) {
        const threadKey = tinderThreadKeyFromPath("/app/messages/" + encodeURIComponent(ref));
        const settings = await getChatSettings(threadKey);
        if (settings.enabled === false) await saveChatSettings(threadKey, { ...settings, enabled: true });
      }
    }
    const { refs } = await listEligible();
    if (!refs.length && mode !== "watcher") throw new Error("No chat is enabled after checking current permissions.");
    let next = initial();
    const selectedTab = await chrome.tabs.get(tab.id);
    const selectedRef = mode === "watcher" ? tinderRefFromUrl(selectedTab.url) : null;
    const activeRef = selectedRef && refs.includes(selectedRef) ? selectedRef : null;
    next = activity({ ...next, enabled: true, mode, autoOpenersEnabled: mode === "watcher" && autoOpenersEnabled,
      userId: session.user.id, tabId: tab.id, tabMode: tab.mode,
      ...(mode === "watcher" ? { watchedMatches: emptyWatchedMatches(session.user.id) } : {}),
      ...(activeRef ? { lastRef: activeRef, currentLabel: selection.labels.get(activeRef) ?? `Thread ${activeRef.slice(0, 8)}`,
        ...followConversationAfterSignal(next, activeRef, "opened") } : {}),
      eligibleCount: refs.length, dwellSeconds: await getCadenceSeconds(), startedAt: new Date().toISOString() },
      "starting", `${mode === "watcher" ? "Watching" : "Checking"} ${refs.length} eligible chats on ${tab.mode === "reused" ? "the existing" : "a newly opened"} Tinder tab.`);
    await save(next);
    // Bootstrap Matches baseline if the user has the actual Tinder Matches tab
    // selected. No attempt to navigate away from an active conversation.
    if (mode === "watcher") {
      try {
        const baseline = await chrome.tabs.sendMessage(tab.id, { type: "TNND_WATCHER_READ_MATCHES" }) as { ok?: boolean; refs?: unknown };
        if (baseline?.ok && Array.isArray(baseline.refs) && baseline.refs.length) {
          const latest = await load();
          if (latest.enabled && latest.mode === "watcher" && latest.userId === session.user.id && latest.watchedMatches)
            await save({ ...latest, watchedMatches: observeWatchedMatches(latest.watchedMatches, baseline.refs) });
        }
      } catch { /* Matches may not be visible yet; observe once user opens them. */ }
    }
    // Chrome alarms provide a 30s fallback. The open Tinder content script
    // requests faster rotation every ~2.5s, bounded by saved dwellSeconds.
    await chrome.alarms.create(ALARM, { periodInMinutes: 0.5 });
    void tick();
    return load();
  } finally { starting = false; }
}
async function stop(reason = "Runner stopped. Tinder tab kept open."): Promise<GlobalExistingRunnerState> {
  const state = await load();
  // Do not close a reused or newly created tab; it belongs to the user after
  // taking over the sole Tinder session. Never force logout by opening another.
  const next = activity({ ...state, enabled: false, autoOpenersEnabled: false,
    matchPhase: "idle", matchPhaseStartedAt: null, userId: null, pendingReplies: 0, watchedMatches: null, activeConversationRef: null, activeConversationUntil: null, pausedOnStop: state.tabId !== null }, "stopped", reason);
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
    || !["incoming", "waiting", "generating", "sending", "sent", "skipped", "error"].includes(message.phase)) return;
  const phase = message.phase as RunnerPhase;
  const detail = typeof message.detail === "string" ? message.detail.slice(0, 240) : phase;
  // Ignore duplicate status events, especially periodic "no incoming" scans.
  if (state.phase === phase && state.phaseDetail === detail && phase !== "sent" && phase !== "incoming") return;
  // Reject late navigation events from an older chat tab.
  const fresh = await load();
  if (!fresh.enabled || fresh.lastRef !== senderRef || fresh.tabId !== sender.tab.id) return;
  // Generating/sending is protected by the existing in-flight operation lease;
  // only observed incoming or confirmed outgoing events affect activity scores.
  const focus = fresh.mode === "watcher" && (phase === "incoming" || phase === "sent")
    ? followConversationAfterSignal(fresh, senderRef, phase) : {};
  await save(activity({
    ...fresh, ...focus,
    ...(phase === "incoming" ? { lastIncomingAt: new Date().toISOString() } : {})
  }, phase, detail, senderRef));
}
chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === ALARM) void tick();
});
chrome.runtime.onStartup.addListener(() => {
  void load().then(async state => {
    if (!state.enabled) return;
    await chrome.alarms.create(ALARM, { periodInMinutes: 0.5 });
    void tick();
  });
});
chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
  if (!message || typeof message !== "object") return false;
  const input = message as { type?: unknown; phase?: unknown; detail?: unknown; ref?: unknown; refs?: unknown; conversationRef?: unknown; firstName?: unknown; enablePreviouslyDisabled?: unknown; cadenceSeconds?: unknown };
  if (input.type === "TNND_EXISTING_RUNNER_TAB_PAUSED") {
    const statePromise = load();
    void statePromise.then(state => sendResponse({
      ok: true,
      paused: !state.enabled && state.pausedOnStop && sender.tab?.id === state.tabId
        && typeof input.ref === "string" && input.ref === tinderRefFromUrl(sender.url)
    })).catch(() => sendResponse({ ok: true, paused: false }));
    return true;
  }
  if (input.type === "TNND_EXISTING_RUNNER_CLEAR_PAUSE") {
    if (!popupSender(sender)) {
      sendResponse({ ok: false, error: "manual_override_requires_popup" });
      return false;
    }
    void (async () => {
      const state = await load();
      if (!state.enabled && state.pausedOnStop && typeof input.ref === "string" && state.tabId !== null) {
        const active = await chrome.tabs.query({ active: true, currentWindow: true });
        if (active.length === 1 && active[0].id === state.tabId && tinderRefFromUrl(active[0].url) === input.ref) {
          await save({ ...state, pausedOnStop: false });
        }
      }
      return { ok: true };
    })().then(sendResponse).catch(() => sendResponse({ ok: false }));
    return true;
  }
  if (input.type === "TNND_EXISTING_RUNNER_IDENTITY") {
    void (async () => {
      if (sender.id !== chrome.runtime.id || !isTinderUrl(sender.url) || !sender.tab?.id) return { ok: false };
      const state = await load();
      if (!state.enabled || state.tabId !== sender.tab.id || typeof input.conversationRef !== "string"
        || state.lastRef !== input.conversationRef || typeof input.firstName !== "string") return { ok: false };
      const firstName = input.firstName.trim();
      if (!/^[\p{L}][\p{L}\p{M}\p{N} ._'’\-]{1,79}$/u.test(firstName)
        || /^(?:conversation|messages?|profile|tinder)$/i.test(firstName)) return { ok: false };
      // Sender's captured SPA URL may be stale; verify the actual live Tinder
      // tab route before changing a label for this exact match.
      const tab = await chrome.tabs.get(sender.tab.id);
      if (tinderRefFromUrl(tab.url) !== state.lastRef) return { ok: false };
      const fresh = await load();
      if (!fresh.enabled || fresh.tabId !== state.tabId || fresh.lastRef !== state.lastRef) return { ok: false };
      if (fresh.currentLabel !== firstName) await save({ ...fresh, currentLabel: firstName });
      return { ok: true };
    })().then(sendResponse).catch(() => sendResponse({ ok: false }));
    return true;
  }
  if (input.type === "TNND_WATCHER_MATCHES_SEEN") {
    void (async () => {
      const state = await load();
      const session = await getBackendSession();
      if (!state.enabled || state.mode !== "watcher" || !state.watchedMatches
        || !session || session.user.id !== state.userId
        || sender.id !== chrome.runtime.id || sender.tab?.id !== state.tabId
        || !isTinderUrl(sender.url) || !Array.isArray(input.refs) || input.refs.length > 500) return { ok: false };
      const watchedMatches = observeWatchedMatches(state.watchedMatches, input.refs);
      if (watchedMatches === state.watchedMatches) return { ok: true };
      const fresh = await load();
      if (!fresh.enabled || fresh.mode !== "watcher" || fresh.userId !== state.userId
        || fresh.tabId !== state.tabId) return { ok: false };
      await save({ ...fresh, watchedMatches });
      // Match discovery is read-only: it must never take over an active chat,
      // enqueue an opener or call the first-message send worker.
      return { ok: true };
    })().then(sendResponse).catch(() => sendResponse({ ok: false }));
    return true;
  }
  if (input.type === "TNND_EXISTING_RUNNER_UNREAD") {
    void (async () => {
      const state = await load();
      const session = await getBackendSession();
      if (!state.enabled || !session || session.user.id !== state.userId || sender.tab?.id !== state.tabId
        || !isTinderUrl(sender.url) || !Array.isArray(input.refs)) return { ok: false };
      const current = await readWorkIndex(session.user.id);
      if (!current) return { ok: false };
      const visible = input.refs.filter((ref): ref is string => typeof ref === "string").slice(0, 100);
      const unseen = state.mode === "watcher"
        ? newlyVisibleUnread(state.visibleUnreadRefs, visible) : visible;
      const next = observeUnreadThreads(current, unseen);
      await saveWorkIndex(next);
      if (state.mode === "watcher") {
        await save({ ...state, visibleUnreadRefs: visible, pendingReplies: pendingWatchedReplies(next) });
        if (unseen.length) void tick();
      }
      return { ok: true };
    })().then(sendResponse).catch(() => sendResponse({ ok: false }));
    return true;
  }
  if (input.type === "TNND_EXISTING_RUNNER_TICK") {
    void load().then(state => {
      if (sender.id === chrome.runtime.id && sender.tab?.id === state.tabId && state.enabled
        && typeof input.ref === "string" && input.ref === state.lastRef && tinderRefFromUrl(sender.url) === state.lastRef) {
        void tick();
      }
      sendResponse({ ok: true });
    }).catch(() => sendResponse({ ok: false }));
    return true;
  }
  if (input.type === "TNND_EXISTING_RUNNER_EVENT") {
    if (sender.id !== chrome.runtime.id || !isTinderUrl(sender.url)) return false;
    void contentEvent(sender, input).then(() => sendResponse({ ok: true }))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }
  if (!["TNND_GLOBAL_EXISTING_STATE", "TNND_GLOBAL_EXISTING_PREFLIGHT", "TNND_GLOBAL_EXISTING_SET_CADENCE", "TNND_GLOBAL_EXISTING_START", "TNND_GLOBAL_WATCHER_START", "TNND_GLOBAL_WATCHER_AUTO_START", "TNND_GLOBAL_EXISTING_STOP"].includes(String(input.type))) return false;
  if (input.type === "TNND_GLOBAL_EXISTING_STATE" && (popupSender(sender) || webReadOnlySender(sender))) {
    void Promise.all([load(), getCadenceSeconds()]).then(([state, dwellSeconds]) => sendResponse({ ok: true, state: { ...state, dwellSeconds } }))
      .catch(() => sendResponse({ ok: false, error: "state_unavailable" }));
    return true;
  }

  if (!popupSender(sender)) {
    sendResponse({ ok: false, error: "Runner Start/Stop requires the TNND extension popup." });
    return false;
  }
  if (input.type === "TNND_GLOBAL_EXISTING_SET_CADENCE") {
    const next = input.cadenceSeconds;
    if (typeof next !== "number" || !ALLOWED_CADENCES.some(seconds => seconds === next)) {
      sendResponse({ ok: false, error: "Invalid chat switching interval." });
      return false;
    }
    void (async () => {
      await chrome.storage.local.set({ [CADENCE_KEY]: next });
      const state = await load();
      await save({ ...state, dwellSeconds: next });
      return { ok: true, dwellSeconds: next };
    })().then(sendResponse).catch(() => sendResponse({ ok: false, error: "Unable to save runner speed." }));
    return true;
  }
  if (input.type === "TNND_GLOBAL_EXISTING_PREFLIGHT") {
    void listEligible().then(({ refs, disabledRefs }) => sendResponse({
      ok: true, readyCount: refs.length, disabledCount: disabledRefs.length,
      totalAuthorizedCount: refs.length + disabledRefs.length
    })).catch(error => sendResponse({ ok: false, error: error instanceof Error ? error.message : "preflight_failed" }));
    return true;
  }
  void (input.type === "TNND_GLOBAL_EXISTING_START"
    ? startExistingRunner(input.enablePreviouslyDisabled === true)
    : input.type === "TNND_GLOBAL_WATCHER_START"
      ? startExistingRunner(false, "watcher")
      : input.type === "TNND_GLOBAL_WATCHER_AUTO_START"
        ? startExistingRunner(false, "watcher", true)
        : stop())
    .then(state => sendResponse({ ok: true, state }))
    .catch(error => sendResponse({ ok: false, error: error instanceof Error ? error.message : "runner_failed" }));
  return true;
});
