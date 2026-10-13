import { getBackendSession, getConfig, getChatSettings } from "./storage";
import { readNewMatchState, updateNewMatchAttempt, newMatchSendPermission } from "./tinder-new-match-background";
import { tinderThreadKeyFromPath } from "./tinder-thread-identity";

const ALARM = "tnnd.globalNewMatches.cycle";
const OWNED_TAB = "tnnd.newMatchOwnedTab.v1";
const BASE = "http://127.0.0.1:4000";
const MAX_NEW_OPENERS_PER_DAY = 5;
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
  if (conversation) {
    if (!conversation.id) throw new Error("Server conversation has no ID");
    if (conversation.explicitlySelected || !["unmanaged", undefined].includes(conversation.managementState)
        || ["disabled", "archived", "moved-off-tinder", "action-required", "waiting-for-user"].includes(conversation.status)) {
      throw new Error("Chat was already assigned or explicitly excluded; will not override individual settings");
    }
    const detail = await fetchBackend(`/api/v1/conversations/${encodeURIComponent(conversation.id)}`, token);
    if (!detail.ok || !Array.isArray(detail.data.conversation?.messages)
        || detail.data.conversation.messages.length > 0) throw new Error("Existing chat is not proven empty");
  }
  let conversationId: string = typeof conversation?.id === "string" ? conversation.id : "";
  if (!conversationId) {
    const created = await fetchBackend("/api/v1/conversations/sync", token, "POST", {
      externalThreadId: ref, status: "active", messages: []
    });
    if (!created.ok || typeof created.data.conversationId !== "string") throw new Error("Could not create new Tinder match conversation");
    conversationId = created.data.conversationId;
  } else {
    const activated = await fetchBackend(`/api/v1/conversations/${encodeURIComponent(conversationId)}`, token, "PATCH", { status: "active" });
    if (!activated.ok) throw new Error("Could not activate new match conversation");
  }
  const managed = await fetchBackend("/api/v1/conversations/management", token, "PUT", {
    updates: [{ conversationId, managementState: "ai-managed" }]
  });
  if (!managed.ok) throw new Error("Could not authorize this match for AI management");
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
  const existing = (await chrome.storage.local.get(OWNED_TAB))[OWNED_TAB] as {
    tabId?: number; userId?: string; ref?: string | null
  } | undefined;
  if (existing && (existing.tabId !== tab.id || existing.userId !== userId)) {
    throw new Error("Tinder worker tab/session changed; stop and restart the match batch.");
  }
  const info = await chrome.tabs.sendMessage(tab.id, { type: "TNND_MATCH_SPA_NAVIGATE", ref }) as {
    ok?: boolean; error?: string; currentRef?: string
  };
  if (!info?.ok || info.currentRef !== ref) {
    throw new Error("Could not navigate in Tinder without reload: " + (info?.error ?? "unknown_navigation_error"));
  }
  await chrome.storage.local.set({ [OWNED_TAB]: { tabId: tab.id, userId, ref } });
  return tab.id;
}

async function processNext(): Promise<void> {
  if (busy) return;
  busy = true;
  let ref: string | null = null;
  let sent = false;
  try {
    const state = await readNewMatchState();
    if (!state.enabled || !state.autoSendEnabled || !state.pendingRefs.length) return;
    const session = await getBackendSession();
    if (!session || session.user.id !== state.userId) return;
    const config = await getConfig();
    if (!config.automation.enabled) return;
    const today = new Date().toISOString().slice(0, 10);
    const stored = (await chrome.storage.local.get("tnnd.newMatchDailyAttempts.v1"))["tnnd.newMatchDailyAttempts.v1"] as { date: string; refs: string[] } | undefined;
    const used = stored?.date === today && Array.isArray(stored.refs) ? stored.refs : [];
    if (used.length >= MAX_NEW_OPENERS_PER_DAY) return;
    ref = state.pendingRefs.find(item => !used.includes(item)) ?? null;
    if (!ref) return;
    const threadKey = tinderThreadKeyFromPath(`/app/messages/${encodeURIComponent(ref)}`);
    if (!threadKey || !(await getChatSettings(threadKey)).enabled) {
      await updateNewMatchAttempt(ref, false, "Individual automation disabled for this match");
      return;
    }
    // Persist a per-day claim before opening Tinder; no blind replays.
    await chrome.storage.local.set({ "tnnd.newMatchDailyAttempts.v1": { date: today, refs: [...used, ref] } });
    const tabId = await ownedTab(ref, session.user.id);
    if (!await newMatchSendPermission(ref, tabId)) return;
    // Wait until Tinder's actual matching conversation route/content is ready.
    let info: { composerFound?: boolean; threadKey?: string } | null = null;
    for (let attempt = 0; attempt < 10; attempt++) {
      if (!await newMatchSendPermission(ref, tabId)) return;
      try {
        info = await chrome.tabs.sendMessage(tabId, { type: "TNND_GET_THREAD_INFO" });
        if (info?.composerFound && info.threadKey === threadKey) break;
      } catch { /* content script still loading */ }
      await new Promise(resolve => setTimeout(resolve, 1500));
    }
    if (!info?.composerFound || info.threadKey !== threadKey) throw new Error("Tinder composer/thread was not confirmed");
    // The sender must remain the same verified, empty conversation before authorizing.
    await prepareNewMatch(ref, session.token);
    if (!await newMatchSendPermission(ref, tabId)) return;
    const result = await chrome.tabs.sendMessage(tabId, {
      type: "TNND_AUTO_START_NEW_MATCH", threadKey
    }) as { ok?: boolean; sent?: boolean; error?: string };
    sent = result?.sent === true;
    await updateNewMatchAttempt(ref, sent, sent ? "First message sent via Tinder" : result?.error ?? "No send confirmed; check Tinder");
  } catch (error) {
    if (ref) await updateNewMatchAttempt(ref, false, `Skipped (no automatic retries): ${error instanceof Error ? error.message : "unknown error"}`);
  } finally { busy = false; }
}

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
