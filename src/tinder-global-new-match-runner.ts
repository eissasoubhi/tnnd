import { getBackendSession, getConfig, getChatSettings } from "./storage";
import { readNewMatchState, saveNewMatchState, updateNewMatchAttempt, newMatchSendPermission } from "./tinder-new-match-background";
import { stopNewMatchObservation } from "./tinder-new-match-observation";
import { assertTinderContentBridge, isMissingTinderReceiver, describeTinderBridgeError } from "./tinder-tab-connection";
import { startExistingRunner } from "./tinder-global-existing-runner";
import { tinderThreadKeyFromPath } from "./tinder-thread-identity";
import { classifyExistingMatchPreparation } from "./tinder-existing-match-preparation-policy";

const ALARM = "tnnd.globalNewMatches.cycle";
const OWNED_TAB = "tnnd.newMatchOwnedTab.v1";
const BASE = "http://127.0.0.1:4000";
const MAX_NEW_OPENERS_PER_DAY = 5;
const CADENCE_KEY = "tnnd.globalExistingRunner.cadenceSeconds.v1";
const ALLOWED_CADENCES = new Set([10, 15, 30, 60, 120]);
let busy = false;

async function fetchBackend(path: string, token: string, method = "GET", body?: unknown): Promise<{ ok: boolean; status: number; data: Record<string, any> }> {
  const response = await fetch(`${BASE}${path}`, {
    method, headers: {
      authorization: `Bearer ${token}`,
      ...(body !== undefined ? { "content-type": "application/json" } : {})
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {})
  });
  const data = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, data };
}

async function prepareNewMatch(ref: string, token: string): Promise<string> {
  const lookup = await fetchBackend(`/api/v1/conversations/by-external-thread?externalThreadId=${encodeURIComponent(ref)}`, token);
  if (!lookup.ok && lookup.status !== 404) throw new Error("Cannot verify server conversation");
  const conversation = lookup.ok ? lookup.data.conversation : null;
  let conversationId = "";
  let needsAuthorization = false;
  if (conversation) {
    if (typeof conversation.id !== "string" || !conversation.id) throw new Error("Server conversation has no ID");
    if (conversation.externalThreadId !== ref) throw new Error("Existing conversation has a different Tinder thread ID");
    const decision = classifyExistingMatchPreparation(conversation);
    if (decision.kind === "blocked") throw new Error(decision.reason);
    const detail = await fetchBackend(`/api/v1/conversations/${encodeURIComponent(conversation.id)}`, token);
    if (!detail.ok || !Array.isArray(detail.data.conversation?.messages)
        || detail.data.conversation.messages.length > 0) throw new Error("Existing chat is not proven empty");
    conversationId = conversation.id;
    // Reuse a previously authorized AI-managed match without resetting its
    // selectedAt, status or management settings. No status PATCH is needed.
    needsAuthorization = decision.kind === "authorize-unmanaged";
  } else {
    const created = await fetchBackend("/api/v1/conversations/sync", token, "POST", {
      externalThreadId: ref, status: "active", messages: []
    });
    if (!created.ok || typeof created.data.conversationId !== "string") throw new Error("Could not create new Tinder match conversation");
    conversationId = created.data.conversationId;
    needsAuthorization = true;
  }
  if (needsAuthorization) {
    const managed = await fetchBackend("/api/v1/conversations/management", token, "PUT", {
      updates: [{ conversationId, managementState: "ai-managed" }]
    });
    if (!managed.ok) throw new Error("Could not authorize this match for AI management");
  }
  // The separate first-message permission guard validates this EXACT thread,
  // the selected user's preferences and that no outgoing message was claimed.
  return conversationId;
}

/** Reuse exactly ONE already opened Tinder tab. Tinder invalidates parallel web
 * sessions, so no popup worker is allowed to open/close a second Tinder tab.
 */
async function ownedTab(ref: string, userId: string): Promise<number> {
  const candidates = await chrome.tabs.query({ url: ["https://tinder.com/*", "https://www.tinder.com/*"] });
  if (candidates.length !== 1 || !candidates[0].id) {
    throw new Error("Open exactly one Tinder tab with Matches visible before sending first messages.");
  }
  const tab = candidates[0];
  const tabId = tab.id!;
  await assertTinderContentBridge(tabId);
  const existing = (await chrome.storage.local.get(OWNED_TAB))[OWNED_TAB] as {
    tabId?: number; userId?: string; ref?: string | null
  } | undefined;
  if (existing && (existing.tabId !== tabId || existing.userId !== userId)) {
    throw new Error("Tinder worker tab/session changed; stop and restart the match batch.");
  }
  const info = await chrome.tabs.sendMessage(tabId, { type: "TNND_MATCH_SPA_NAVIGATE", ref }) as unknown as {
    ok?: boolean; error?: string; currentRef?: string
  };
  if (!info?.ok || info.currentRef !== ref) {
    throw new Error("Could not navigate in Tinder without reload: " + (info?.error ?? "unknown_navigation_error"));
  }
  await chrome.storage.local.set({ [OWNED_TAB]: { tabId, userId, ref } });
  return tabId;
}

/** Explicitly authorized automatic handoff after an existing-match batch.
 * One Tinder tab cannot host both global runner modes simultaneously.
 */
async function finishExistingMatchBatch(state: Awaited<ReturnType<typeof readNewMatchState>>, reason: string): Promise<void> {
  if (state.mode !== "existing" || !state.enabled) return;
  await saveNewMatchState({
    ...stopNewMatchObservation(state),
    lastResult: reason + " · starting existing-conversation monitoring…"
  });
  await chrome.alarms.clear(ALARM);
  await chrome.storage.local.remove(OWNED_TAB);
  try {
    await startExistingRunner();
    const current = await readNewMatchState();
    await saveNewMatchState({
      ...current, lastResult: reason + " · existing-conversation AI runner now active."
    });
  } catch (error) {
    const current = await readNewMatchState();
    await saveNewMatchState({
      ...current, lastResult: reason + " · first-message batch stopped. Could not start reply monitoring: "
        + (error instanceof Error ? error.message : "unknown")
    });
  }
}

async function processNext(): Promise<void> {
  if (busy) return;
  busy = true;
  let ref: string | null = null;
  let sent = false;
  let sendRequested = false;
  try {
    const state = await readNewMatchState();
    if (!state.enabled || !state.autoSendEnabled) return;
    if (!state.pendingRefs.length) {
      await finishExistingMatchBatch(state, "First-message batch completed");
      return;
    }
    const session = await getBackendSession();
    if (!session || session.user.id !== state.userId) return;
    const config = await getConfig();
    if (!config.automation.enabled) return;
    const dwell = (await chrome.storage.local.get(CADENCE_KEY))[CADENCE_KEY];
    const dwellSeconds = typeof dwell === "number" && ALLOWED_CADENCES.has(dwell) ? dwell : 15;
    if (state.lastAttemptAt && Date.now() - Date.parse(state.lastAttemptAt) < dwellSeconds * 1000) return;
    const today = new Date().toISOString().slice(0, 10);
    const stored = (await chrome.storage.local.get("tnnd.newMatchDailyAttempts.v1"))["tnnd.newMatchDailyAttempts.v1"] as { date: string; refs: string[] } | undefined;
    const used = stored?.date === today && Array.isArray(stored.refs) ? stored.refs : [];
    if (used.length >= MAX_NEW_OPENERS_PER_DAY) {
      await finishExistingMatchBatch(state, "Daily first-message limit reached; remaining matches can be resumed later");
      return;
    }
    ref = state.pendingRefs.find(item => !used.includes(item)) ?? null;
    if (!ref) return;
    const threadKey = tinderThreadKeyFromPath(`/app/messages/${encodeURIComponent(ref)}`);
    if (!threadKey || !(await getChatSettings(threadKey)).enabled) {
      await updateNewMatchAttempt(ref, false, "Individual automation disabled for this match");
      return;
    }
    // Tinder navigation is read-only. Do not consume a daily send claim when
    // the updated extension cannot communicate with this tab.
    const tabId = await ownedTab(ref, session.user.id);
    if (!await newMatchSendPermission(ref, tabId)) return;
    // Wait until Tinder's actual matching conversation route/content is ready.
    let info: { composerFound?: boolean; threadKey?: string } | null = null;
    for (let attempt = 0; attempt < 10; attempt++) {
      if (!await newMatchSendPermission(ref, tabId)) return;
      try {
        info = await chrome.tabs.sendMessage(tabId, { type: "TNND_GET_THREAD_INFO" });
        if (info?.composerFound && info.threadKey === threadKey) break;
      } catch (error) {
        // The previous Tinder content script may have been invalidated by
        // an extension reload. A missing receiver is not a send attempt.
        if (isMissingTinderReceiver(error)) throw error;
      }
      await new Promise(resolve => setTimeout(resolve, 1500));
    }
    if (!info?.composerFound || info.threadKey !== threadKey) throw new Error("Tinder composer/thread was not confirmed");
    // The sender must remain the same verified, empty conversation before authorizing.
    await prepareNewMatch(ref, session.token);
    if (!await newMatchSendPermission(ref, tabId)) return;
    // Store durable intent immediately BEFORE the irreversible Send request.
    await chrome.storage.local.set({ "tnnd.newMatchDailyAttempts.v1": { date: today, refs: [...used, ref] } });
    sendRequested = true;
    const result = await chrome.tabs.sendMessage(tabId, {
      type: "TNND_AUTO_START_NEW_MATCH", threadKey
    }) as { ok?: boolean; sent?: boolean; error?: string };
    sent = result?.sent === true;
    await updateNewMatchAttempt(ref, sent, sent ? "First message sent via Tinder" : result?.error ?? "No send confirmed; check Tinder");
  } catch (error) {
    if (isMissingTinderReceiver(error) && !sendRequested) {
      // No content receiver means no Tinder Send was requested. Pause and
      // preserve ALL pending refs; retry only after an explicit restart.
      const current = await readNewMatchState();
      await saveNewMatchState({
        ...stopNewMatchObservation(current),
        lastResult: describeTinderBridgeError(error)
      });
      await chrome.alarms.clear(ALARM);
      await chrome.storage.local.remove(OWNED_TAB);
    } else if (ref) {
      // A missing reply after Send was requested could mean unknown delivery.
      // Never replay automatically once the click might have happened.
      await updateNewMatchAttempt(ref, false,
        `Skipped (no automatic retries): ${error instanceof Error ? error.message : "unknown error"}`);
    }
  } finally { busy = false; }
}

chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
  if (!message || typeof message !== "object" || (message as { type?: unknown }).type !== "TNND_MATCH_RUNNER_TICK") return false;
  void (async () => {
    const state = await readNewMatchState();
    if (!state.enabled || !state.autoSendEnabled || sender.id !== chrome.runtime.id) return;
    const owner = (await chrome.storage.local.get(OWNED_TAB))[OWNED_TAB] as { tabId?: number; userId?: string } | undefined;
    const session = await getBackendSession();
    if (owner?.tabId !== sender.tab?.id || session?.user.id !== state.userId
      || owner?.userId !== state.userId) return;
    await processNext();
  })().then(() => sendResponse({ ok: true })).catch(() => sendResponse({ ok: false }));
  return true;
});

chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === ALARM) void processNext();
});

export async function refreshNewMatchAlarm(): Promise<void> {
  const state = await readNewMatchState();
  if (state.enabled && state.autoSendEnabled) {
    await chrome.alarms.create(ALARM, { periodInMinutes: 1 });
  } else {
    await chrome.alarms.clear(ALARM);
  }
}
export async function stopNewMatchWorker(): Promise<void> {
  await chrome.alarms.clear(ALARM);
  const raw = (await chrome.storage.local.get(OWNED_TAB))[OWNED_TAB] as { tabId?: number; ref?: string } | undefined;
  // Revoke worker ownership but leave the user's Tinder tab untouched.
  if (raw?.tabId) await chrome.storage.local.remove(OWNED_TAB);
}
chrome.runtime.onStartup.addListener(() => { void refreshNewMatchAlarm(); });
