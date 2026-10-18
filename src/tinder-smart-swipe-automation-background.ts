import { getBackendSession } from "./storage";
import { readNewMatchState } from "./tinder-new-match-background";
import { decideAutoSwipeDrive } from "./tinder-smart-swipe-auto-runner-policy";
import {
  validateSmartAutoSwipeConfig, pauseSmartSwipeSession, resumeSmartSwipeSession,
  reserveSmartRightSwipe, confirmSmartRightSwipe, planSmartRightSwipe,
  selectTinderActivity, type SmartAutoSwipeConfig
} from "./tinder-smart-auto-swipe-policy";
import {
  beginScheduledSwipeSession, closeExpiredScheduledSwipeSession,
  recoverPausedSwipeSession, scheduleSmartSwipeSession,
  type ScheduledSwipeProgress
} from "./tinder-smart-swipe-daily-scheduler";
import { readSmartSwipeProgress } from "./tinder-smart-swipe-progress-store";
import type { SwipeDiscoveryEvidence } from "./tinder-swipe-discovery-evidence";
import type { TinderSwipeActionResult } from "./tinder-swipe-card-transition-policy";
import { withTinderRunnerTransition } from "./tinder-runner-transition";

const API = "http://127.0.0.1:4000";
const STORAGE_PROGRESS = "tnnd.smartSwipeDailyProgress.v1:";
const STORAGE_ARM = "tnnd.smartSwipeLiveArm.v1:";
const STORAGE_HEARTBEAT = "tnnd.smartSwipeHeartbeat.v1:";
const STORAGE_DEVICE = "tnnd.smartSwipeDevice.v1:";
const STORAGE_STATUS = "tnnd.smartSwipeLastResult.v1:";
let busy = false;
const recoveredAccountProgress = new Set<string>();

interface ServerSettings extends SmartAutoSwipeConfig { timeZone: string }
interface ArmState { armed: boolean; userId: string; tabId: number; }
interface ExistingRunnerState {
  enabled?: boolean; userId?: string | null;
  phase?: string; activeConversationRef?: string | null;
  activeConversationUntil?: string | null; pendingReplies?: number;
}
interface AttemptClaim { ok: boolean; claimed?: boolean; reason?: string }

function isRecs(url: string | undefined): boolean {
  try {
    const u = new URL(url ?? "");
    return (u.origin === "https://tinder.com" || u.origin === "https://www.tinder.com") &&
      u.pathname.replace(/\/+$/, "") === "/app/recs";
  } catch { return false; }
}
async function getSettings(token: string): Promise<ServerSettings> {
  const response = await fetch(API + "/api/v1/automation/smart-swipe", {
    headers: { authorization: "Bearer " + token }, cache: "no-store"
  });
  if (!response.ok) throw new Error("settings_unavailable");
  const data = await response.json() as { settings?: ServerSettings };
  if (!data.settings || validateSmartAutoSwipeConfig(data.settings).length ||
      typeof data.settings.timeZone !== "string") throw new Error("invalid_settings");
  return data.settings;
}
async function authenticatedPost<T>(
  token: string, path: string, payload: Record<string, string>
): Promise<T> {
  const response = await fetch(API + path, {
    method: "POST",
    headers: { authorization: "Bearer " + token, "content-type": "application/json" },
    body: JSON.stringify(payload), cache: "no-store"
  });
  const data = await response.json().catch(() => null);
  if (!data || typeof data !== "object") throw new Error("attempt_service_unavailable");
  return data as T;
}
async function uniqueDeviceId(userId: string): Promise<string> {
  const key = STORAGE_DEVICE + userId;
  const stored = (await chrome.storage.local.get(key))[key];
  if (typeof stored === "string" && /^[0-9a-f-]{36}$/i.test(stored)) return stored;
  const deviceId = crypto.randomUUID();
  await chrome.storage.local.set({ [key]: deviceId });
  return deviceId;
}
async function saveStatus(userId: string, reason: string): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_STATUS + userId]: reason.slice(0, 100) });
}
async function exclusiveTab(tabId: number): Promise<boolean> {
  const tabs = await chrome.tabs.query({ url: ["https://tinder.com/*", "https://www.tinder.com/*"] });
  return tabs.length === 1 && tabs[0].id === tabId && isRecs(tabs[0].url);
}
async function competingRunners(): Promise<{ existing: ExistingRunnerState | undefined; newMatchEnabled: boolean }> {
  const existing = (await chrome.storage.local.get("tnnd.globalExistingRunner.v2"))
    ["tnnd.globalExistingRunner.v2"] as ExistingRunnerState | undefined;
  const newMatch = await readNewMatchState();
  return { existing, newMatchEnabled: newMatch.enabled && newMatch.autoSendEnabled };
}
async function observe(tabId: number): Promise<SwipeDiscoveryEvidence | null> {
  try {
    const response = await chrome.tabs.sendMessage(tabId, { type: "TNND_SMART_SWIPE_OBSERVE" }) as
      { ok?: boolean; evidence?: SwipeDiscoveryEvidence };
    return response?.ok && response.evidence?.version === 1 ? response.evidence : null;
  } catch { return null; }
}
async function progressForUser(
  userId: string, settings: ServerSettings, now: number
): Promise<{ progress: ScheduledSwipeProgress; key: string } | null> {
  const key = STORAGE_PROGRESS + userId;
  const raw = (await chrome.storage.local.get(key))[key];
  const result = readSmartSwipeProgress(raw, now, settings.timeZone);
  if (!result.ok) { await saveStatus(userId, result.reason); return null; }
  let progress: ScheduledSwipeProgress = result.progress;
  if (!recoveredAccountProgress.has(userId) && progress.session?.runningSinceMs !== null && progress.session) {
    const heartbeat = (await chrome.storage.local.get(STORAGE_HEARTBEAT + userId))
      [STORAGE_HEARTBEAT + userId] as number | undefined;
    progress = recoverPausedSwipeSession(progress, heartbeat ?? Number.NaN, now);
    await chrome.storage.local.set({ [key]: progress });
  } else if (result.needsSave) await chrome.storage.local.set({ [key]: progress });
  recoveredAccountProgress.add(userId);
  return { progress, key };
}
async function tick(tabId: number): Promise<void> {
  if (busy) return;
  busy = true;
  let userId: string | null = null;
  try {
    const session = await getBackendSession();
    if (!session) return;
    userId = session.user.id;
    const arm = (await chrome.storage.local.get(STORAGE_ARM + userId))
      [STORAGE_ARM + userId] as ArmState | undefined;
    if (!arm?.armed) return;
    const config = await getSettings(session.token);
    const oneTinderTab = await exclusiveTab(tabId);
    const { existing, newMatchEnabled } = await competingRunners();
    const drive = decideAutoSwipeDrive({
      armed: arm.armed, settingsEnabled: config.enabled,
      authenticated: true, oneTinderTab, selectedTabMatches: arm.tabId === tabId,
      userOwnsTab: arm.userId === userId && (!existing?.enabled || existing.userId === userId),
      existingRunnerEnabled: Boolean(existing?.enabled),
      newMatchRunnerEnabled: newMatchEnabled, userTakeover: false
    });
    if (drive !== "allowed") {
      if (drive === "disabled" || drive === "account_mismatch") {
        await chrome.storage.local.set({
          [STORAGE_ARM + userId]: { armed: false, userId, tabId: -1 }
        });
      }
      await saveStatus(userId, drive);
      const prev = await progressForUser(userId, config, Date.now());
      if (prev?.progress.session) await chrome.storage.local.set({
        [prev.key]: pauseSmartSwipeSession(prev.progress, Date.now())
      });
      return;
    }
    const now = Date.now();
    const read = await progressForUser(userId, config, now);
    if (!read) return;
    let progress = read.progress;
    const heartbeatKey = STORAGE_HEARTBEAT + userId;
    const last = (await chrome.storage.local.get(heartbeatKey))[heartbeatKey] as number | undefined;
    if (progress.session?.runningSinceMs !== null && progress.session &&
        typeof last === "number" && now - last > 30_000) {
      progress = recoverPausedSwipeSession(progress, last, now);
      await chrome.storage.local.set({ [read.key]: progress });
    }
    const evidence = await observe(tabId);
    if (!evidence || evidence.status !== "observed" || evidence.route !== "recs") {
      await saveStatus(userId, "discovery_controls_unavailable");
      if (progress.session) await chrome.storage.local.set({
        [read.key]: pauseSmartSwipeSession(progress, now)
      });
      return;
    }
    const availability = {
      swipeSessionAvailable: true,
      newMatchesAvailable: false, activeChatsAvailable: false,
      activeConversationInProgress: false, mandatoryStop: false
    };
    if (selectTinderActivity(config, availability) !== "swipe") return;
    const schedule = scheduleSmartSwipeSession(config, progress, now, config.timeZone);
    if (schedule.action === "end") {
      progress = closeExpiredScheduledSwipeSession(config, progress, now, config.timeZone);
      await chrome.storage.local.set({ [read.key]: progress });
      await saveStatus(userId, "session_completed");
      return;
    }
    if (schedule.action === "due") {
      const started = beginScheduledSwipeSession(config, progress, now, config.timeZone, Math.random);
      if (!started) return;
      progress = started;
      await chrome.storage.local.set({ [read.key]: progress });
    } else if (schedule.action === "running" && progress.session?.runningSinceMs === null) {
      progress = resumeSmartSwipeSession(progress, now);
      await chrome.storage.local.set({ [read.key]: progress });
    } else if (schedule.action !== "running") {
      await saveStatus(userId, schedule.reason);
      return;
    }
    await chrome.storage.local.set({ [heartbeatKey]: now });
    const status = planSmartRightSwipe(config, progress, now, config.timeZone, {
      activeConversationInProgress: false, mandatoryStop: false
    });
    if (status !== "ready") {
      await saveStatus(userId, status);
      return;
    }
    const deviceId = await uniqueDeviceId(userId);
    const attemptId = crypto.randomUUID();
    // Claim is atomic across every device before touching Tinder. An unknown
    // claim response is never repeated with a different attempt ID.
    const claimed = await authenticatedPost<AttemptClaim>(
      session.token, "/api/v1/automation/smart-swipe/attempts/claim", { attemptId, deviceId }
    );
    if (!claimed.ok || !claimed.claimed) {
      await saveStatus(userId, claimed.reason ?? "claim_refused");
      return;
    }
    const reserved = reserveSmartRightSwipe(config, progress, Date.now(), config.timeZone,
      Math.random, { activeConversationInProgress: false, mandatoryStop: false });
    if (!reserved) {
      await saveStatus(userId, "claim_without_local_reservation");
      return; // server reservation remains unresolved. Never retry.
    }
    await chrome.storage.local.set({ [read.key]: reserved });
    // Recheck ownership after the atomic claim. Session, runners and tabs may
    // change while the server request is in flight. A stopped attempt remains
    // reserved and cannot be replayed automatically.
    const latestSession = await getBackendSession();
    const latestArm = (await chrome.storage.local.get(STORAGE_ARM + userId))
      [STORAGE_ARM + userId] as ArmState | undefined;
    const latestRunners = await competingRunners();
    const preActionGate = decideAutoSwipeDrive({
      armed: latestArm?.armed === true,
      settingsEnabled: config.enabled,
      authenticated: Boolean(latestSession),
      oneTinderTab: await exclusiveTab(tabId),
      selectedTabMatches: latestArm?.tabId === tabId,
      userOwnsTab: latestArm?.userId === userId && latestSession?.user.id === userId,
      existingRunnerEnabled: Boolean(latestRunners.existing?.enabled),
      newMatchRunnerEnabled: latestRunners.newMatchEnabled,
      userTakeover: false
    });
    if (preActionGate !== "allowed") {
      await saveStatus(userId, "pre_action_" + preActionGate);
      return; // reserved permanently pending review
    }
    let action: TinderSwipeActionResult | null = null;
    try {
      const result = await chrome.tabs.sendMessage(tabId, {
        type: "TNND_SMART_SWIPE_EXECUTE_RESERVED", attemptId
      }) as { ok?: boolean; outcome?: TinderSwipeActionResult };
      action = result?.ok ? result.outcome ?? null : null;
    } catch { /* Uncertain and permanently reserved. */ }
    const statusForServer = action?.status === "ui_observed" ? "ui_observed" : "uncertain";
    const resolved = await authenticatedPost<{ ok?: boolean }>(
      session.token, "/api/v1/automation/smart-swipe/attempts/resolve", {
        attemptId, deviceId, status: statusForServer
      }
    );
    if (!resolved.ok) {
      await saveStatus(userId, "attempt_resolution_unavailable");
      return;
    }
    if (statusForServer === "ui_observed") {
      await chrome.storage.local.set({
        [read.key]: confirmSmartRightSwipe(reserved, true)
      });
      await saveStatus(userId, "ui_transition_observed");
    } else await saveStatus(userId, action?.reason ?? "uncertain_attempt");
  } catch {
    if (userId) await saveStatus(userId, "runtime_error").catch(() => undefined);
  } finally { busy = false; }
}

async function setArmed(arm: boolean): Promise<Record<string, unknown>> {
  // Stop is always available, including when signed out or disconnected.
  if (!arm) {
    const all = await chrome.storage.local.get(null);
    const disabled: Record<string, ArmState> = {};
    for (const key of Object.keys(all)) {
      if (key.startsWith(STORAGE_ARM)) {
        disabled[key] = { armed: false, userId: key.slice(STORAGE_ARM.length), tabId: -1 };
      }
    }
    if (Object.keys(disabled).length) await chrome.storage.local.set(disabled);
    return { ok: true, armed: false };
  }
  const session = await getBackendSession();
  if (!session) return { ok: false, reason: "tnnd_sign_in_required" };
  const key = STORAGE_ARM + session.user.id;
  const settings = await getSettings(session.token);
  if (!settings.enabled) return { ok: false, reason: "enable_smart_swipe_in_web_settings" };
  const tabs = await chrome.tabs.query({ url: ["https://tinder.com/*", "https://www.tinder.com/*"] });
  if (tabs.length !== 1 || !tabs[0].id || !isRecs(tabs[0].url))
    return { ok: false, reason: "open_one_tinder_discovery_tab" };
  const existing = await competingRunners();
  if (existing.existing?.enabled || existing.newMatchEnabled)
    return { ok: false, reason: "stop_other_tinder_runners_first" };
  const evidence = await observe(tabs[0].id);
  if (!evidence || evidence.status !== "observed") return { ok: false, reason: "discovery_not_ready" };
  await chrome.storage.local.set({
    [key]: { armed: true, userId: session.user.id, tabId: tabs[0].id }
  });
  return { ok: true, armed: true };
}

chrome.runtime.onMessage.addListener((message: unknown, sender, respond) => {
  if (!message || typeof message !== "object") return false;
  const type = (message as { type?: unknown }).type;
  if (type === "TNND_SMART_SWIPE_AUTOMATION_TICK") {
    if (sender.id !== chrome.runtime.id || !sender.tab?.id || !isRecs(sender.url))
      return false;
    void tick(sender.tab.id).then(() => respond({ ok: true }))
      .catch(() => respond({ ok: false }));
    return true;
  }
  if (type === "TNND_SMART_SWIPE_SET_ARMED") {
    if (sender.id !== chrome.runtime.id ||
        sender.url !== `chrome-extension://${chrome.runtime.id}/popup.html`) {
      respond({ ok: false, reason: "popup_only" }); return false;
    }
    const armed = (message as { armed?: unknown }).armed;
    if (typeof armed !== "boolean") {
      respond({ ok: false, reason: "invalid_start_stop" }); return false;
    }
    void withTinderRunnerTransition(() => setArmed(armed)).then(respond)
      .catch(() => respond({ ok: false, reason: "start_stop_failed" }));
    return true;
  }
  return false;
});
