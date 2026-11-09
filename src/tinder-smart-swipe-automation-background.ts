import { getBackendSession } from "./storage";
import { readNewMatchState } from "./tinder-new-match-background";
import { decideAutoSwipeDrive } from "./tinder-smart-swipe-auto-runner-policy";
import {
  validateSmartAutoSwipeConfig, pauseSmartSwipeSession, resumeSmartSwipeSession,
  reserveSmartRightSwipe, confirmSmartRightSwipe, releaseNotClickedSmartRightSwipe,
  planSmartRightSwipe, selectTinderActivity, type SmartAutoSwipeConfig
} from "./tinder-smart-auto-swipe-policy";
import {
  beginScheduledSwipeSession, closeExpiredScheduledSwipeSession,
  recoverPausedSwipeSession, scheduleSmartSwipeSession,
  type ScheduledSwipeProgress
} from "./tinder-smart-swipe-daily-scheduler";
import { readSmartSwipeProgress, validSmartSwipeProgress } from "./tinder-smart-swipe-progress-store";
import { parseDayReconciliationProof, reconcileReviewedLocalSwipeAttempt, publicSwipeReconciliationCounts } from "./tinder-smart-swipe-reconciliation";
import { emptySmartSwipeDay, tinderAccountDayKey } from "./tinder-smart-auto-swipe-policy";
import type { SwipeDiscoveryEvidence } from "./tinder-swipe-discovery-evidence";
import { isProvenNoClickResult, type TinderSwipeActionResult } from "./tinder-swipe-card-transition-policy";
import { withTinderRunnerTransition } from "./tinder-runner-transition";

const API = "http://127.0.0.1:4000";
const STORAGE_PROGRESS = "tnnd.smartSwipeDailyProgress.v1:";
const STORAGE_ARM = "tnnd.smartSwipeLiveArm.v1:";
const STORAGE_HEARTBEAT = "tnnd.smartSwipeHeartbeat.v1:";
const STORAGE_DEVICE = "tnnd.smartSwipeDevice.v1:";
const STORAGE_STATUS = "tnnd.smartSwipeLastResult.v1:";
/** Non-destructive local audit of stale reservations detached at explicit Start.
 * The durable server attempt still exists with UNKNOWN Tinder outcome.
 */
const STORAGE_STALE_RESERVATIONS = "tnnd.smartSwipeStaleReservations.v1:";
// A Stop request preempts new actions immediately, even if a serialized Start
// is waiting for an API response. The storage latch survives MV3 restarts.
const STORAGE_STOP = "tnnd.smartSwipeStopRequested.v1";
let stopRequested = false;
let stopEpoch = 0;
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
async function stopIsRequested(): Promise<boolean> {
  if (stopRequested) return true;
  const stored = await chrome.storage.local.get(STORAGE_STOP);
  return stored[STORAGE_STOP] === true;
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
  if (busy || stopRequested) return;
  busy = true;
  let userId: string | null = null;
  try {
    if (await stopIsRequested()) return;
    const session = await getBackendSession();
    if (!session) return;
    userId = session.user.id;
    const arm = (await chrome.storage.local.get(STORAGE_ARM + userId))
      [STORAGE_ARM + userId] as ArmState | undefined;
    if (!arm?.armed || stopRequested) return;
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
    if (await stopIsRequested()) return;
    const deviceId = await uniqueDeviceId(userId);
    // Emergency Stop could arrive while the device identifier was loaded.
    if (await stopIsRequested()) return;
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
      // This explicit pre-action failure is safely resolved as NO CLICK:
      // the executor was never invoked. The server still counts the attempt
      // against the quota, but no permanent blocking reservation is needed.
      const resolution = await authenticatedPost<{ ok?: boolean }>(
        session.token, "/api/v1/automation/smart-swipe/attempts/resolve", {
          attemptId, deviceId, status: "not_clicked", outcomeReason: "pre_action_guard_blocked"
        }
      ).catch(() => null);
      await saveStatus(userId, resolution?.ok
        ? "claim_without_local_reservation_closed_no_click"
        : "claim_without_local_reservation_unresolved");
      return; // never initiate a Tinder action in this branch
    }
    await chrome.storage.local.set({ [read.key]: reserved });
    // Recheck ownership after the atomic claim. Session, runners and tabs may
    // change while the server request is in flight. A stopped attempt remains
    // reserved and cannot be replayed automatically.
    const latestSession = await getBackendSession();
    const latestArm = (await chrome.storage.local.get(STORAGE_ARM + userId))
      [STORAGE_ARM + userId] as ArmState | undefined;
    const latestRunners = await competingRunners();
    const latestTabExclusive = await exclusiveTab(tabId);
    const stopPending = await stopIsRequested();
    const preActionGate = decideAutoSwipeDrive({
      armed: latestArm?.armed === true && !stopPending && !stopRequested,
      settingsEnabled: config.enabled,
      authenticated: Boolean(latestSession),
      oneTinderTab: latestTabExclusive,
      selectedTabMatches: latestArm?.tabId === tabId,
      userOwnsTab: latestArm?.userId === userId && latestSession?.user.id === userId,
      existingRunnerEnabled: Boolean(latestRunners.existing?.enabled),
      newMatchRunnerEnabled: latestRunners.newMatchEnabled,
      userTakeover: false
    });
    if (preActionGate !== "allowed") {
      // Verified before any content-script action. Finalize the spent attempt
      // but do NOT falsely claim a Tinder Like; preserve the audit trail.
      const resolution = await authenticatedPost<{ ok?: boolean }>(
        session.token, "/api/v1/automation/smart-swipe/attempts/resolve", {
          attemptId, deviceId, status: "not_clicked", outcomeReason: "pre_action_guard_blocked"
        }
      ).catch(() => null);
      if (resolution?.ok) {
        await chrome.storage.local.set({
          [read.key]: releaseNotClickedSmartRightSwipe(reserved, Date.now())
        });
        await saveStatus(userId, "pre_action_" + preActionGate + "_no_click");
      } else await saveStatus(userId, "pre_action_" + preActionGate + "_unresolved");
      return;
    }
    let action: TinderSwipeActionResult | null = null;
    try {
      const result = await chrome.tabs.sendMessage(tabId, {
        type: "TNND_SMART_SWIPE_EXECUTE_RESERVED", attemptId
      }) as { ok?: boolean; outcome?: TinderSwipeActionResult };
      action = result?.ok ? result.outcome ?? null : null;
    } catch { /* Uncertain and permanently reserved. */ }
    const noClick = isProvenNoClickResult(action);
    const statusForServer = action?.status === "ui_observed" ? "ui_observed" :
      noClick ? "not_clicked" : "uncertain";
    // Only a trusted pre-click blocked result can become not_clicked.
    // Missing/unknown action results always remain uncertain.
    const outcomeReason = action?.reason ?? "action_result_unavailable";
    const resolved = await authenticatedPost<{ ok?: boolean }>(
      session.token, "/api/v1/automation/smart-swipe/attempts/resolve", {
        attemptId, deviceId, status: statusForServer, outcomeReason
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
    } else if (statusForServer === "not_clicked") {
      await chrome.storage.local.set({
        [read.key]: releaseNotClickedSmartRightSwipe(reserved, Date.now())
      });
      await saveStatus(userId, "attempt_closed_without_like");
    } else await saveStatus(userId, action?.reason ?? "uncertain_attempt");
  } catch {
    if (userId) await saveStatus(userId, "runtime_error").catch(() => undefined);
  } finally { busy = false; }
}

async function setArmed(arm: boolean, expectedStopEpoch: number): Promise<Record<string, unknown>> {
  // Stop is always available, including when signed out or disconnected.
  if (!arm) {
    const all = await chrome.storage.local.get(null);
    const disabled: Record<string, ArmState> = {};
    const paused: Record<string, ScheduledSwipeProgress> = {};
    for (const key of Object.keys(all)) {
      if (key.startsWith(STORAGE_ARM)) {
        disabled[key] = { armed: false, userId: key.slice(STORAGE_ARM.length), tabId: -1 };
      } else if (key.startsWith(STORAGE_PROGRESS)) {
        const progress = all[key];
        if (!validSmartSwipeProgress(progress) || !progress.session ||
            progress.session.runningSinceMs === null) continue;
        const accountId = key.slice(STORAGE_PROGRESS.length);
        const heartbeat = all[STORAGE_HEARTBEAT + accountId];
        // Freeze only time backed by an observed heartbeat, never idle time.
        paused[key] = recoverPausedSwipeSession(
          progress, typeof heartbeat === "number" ? heartbeat : Number.NaN, Date.now()
        );
      }
    }
    // Persist the emergency latch even if no account is currently signed in.
    // Stop freezes the local clock without resetting quotas or attempt history.
    // This is the final write after any previously queued Start.
    await chrome.storage.local.set({ ...disabled, ...paused, [STORAGE_STOP]: true });
    return { ok: true, armed: false };
  }
  if (expectedStopEpoch !== stopEpoch) return { ok: false, reason: "stop_superseded_start" };
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
  // User-initiated Start: compare local reservation with the authoritative
  // account/day counts. An old unknown Like is never retried or relabeled.
  const progressKey = STORAGE_PROGRESS + session.user.id;
  const now = Date.now();
  const storedProgress = (await chrome.storage.local.get(progressKey))[progressKey];
  if (storedProgress !== undefined && !validSmartSwipeProgress(storedProgress))
    return { ok: false, reason: "corrupt_local_progress_requires_review" };
  const initial = storedProgress ?? emptySmartSwipeDay(tinderAccountDayKey(now, settings.timeZone));
  const proofResponse = await fetch(
    API + "/api/v1/automation/smart-swipe/attempts/reconciliation?dayKey=" +
      encodeURIComponent(initial.dayKey),
    { headers: { authorization: "Bearer " + session.token }, cache: "no-store" }
  );
  if (!proofResponse.ok) return { ok: false, reason: "server_reconciliation_unavailable" };
  const proof = parseDayReconciliationProof(await proofResponse.json(), initial.dayKey);
  if (!proof) return { ok: false, reason: "invalid_server_reconciliation" };
  const review = reconcileReviewedLocalSwipeAttempt(initial, proof);
  // Long-expired server reservations are NOT ongoing Like clicks. Only a
  // new, explicit Start may detach their local progress from the new session.
  // The backend still holds EVERY original attempt unchanged as Reserved /
  // unknown; the old attempt ID is never reused or automatically retried.
  // A fresh (<5min) unresolved action still blocks Start and all other Likes.
  let canDetach = false;
  if (!review.ok && (review.reason === "server_attempt_unresolved" ||
                     review.reason === "server_attempts_not_fully_resolved")) {
    // Only the repair path requires an extra authenticated summary. Healthy
    // Start does not become dependent on unrelated read-only counters.
    const response = await fetch(API + "/api/v1/automation/smart-swipe/attempts/summary", {
      headers: { authorization: "Bearer " + session.token }, cache: "no-store"
    }).catch(() => null);
    const summary = response?.ok ? await response.json().catch(() => null) as {
      dayKey?: unknown; unresolvedAttempts?: unknown; blockingUnresolvedAttempts?: unknown
    } | null : null;
    canDetach = summary?.blockingUnresolvedAttempts === 0 &&
      typeof summary.unresolvedAttempts === "number" &&
      Number.isSafeInteger(summary.unresolvedAttempts) && summary.unresolvedAttempts > 0 &&
      summary.unresolvedAttempts === proof.unresolvedAcrossDays &&
      summary.dayKey === tinderAccountDayKey(now, settings.timeZone);
  }
  if (!review.ok && !canDetach) return {
    ok: false, reason: review.reason,
    reconciliationCounts: publicSwipeReconciliationCounts(initial, proof)
  };
  const currentDay = tinderAccountDayKey(now, settings.timeZone);
  const recovered = canDetach
    ? initial.dayKey === currentDay
      ? { ...initial, rightSwipesReserved: 0, rightSwipesConfirmed: proof.uiObserved }
      : emptySmartSwipeDay(currentDay)
    : review.progress;
  const read = readSmartSwipeProgress(recovered, now, settings.timeZone);
  if (!read.ok) return { ok: false, reason: read.reason };
  let updatedProgress = read.progress;
  // Avoid counting offline time as active when restoring an old session.
  if (updatedProgress.session?.runningSinceMs !== null && updatedProgress.session) {
    const savedHeartbeat = (await chrome.storage.local.get(STORAGE_HEARTBEAT + session.user.id))
      [STORAGE_HEARTBEAT + session.user.id] as number | undefined;
    updatedProgress = recoverPausedSwipeSession(
      updatedProgress, savedHeartbeat ?? Number.NaN, Date.now()
    );
  }
  const deviceId = await uniqueDeviceId(session.user.id);
  if (expectedStopEpoch !== stopEpoch) return { ok: false, reason: "stop_superseded_start" };
  const rearm = await authenticatedPost<{ ok?: boolean; reason?: string }>(
    session.token, "/api/v1/automation/smart-swipe/attempts/rearm", { deviceId }
  );
  if (!rearm.ok) return { ok: false, reason: rearm.reason ?? "explicit_rearm_denied" };
  if (expectedStopEpoch !== stopEpoch) return { ok: false, reason: "stop_superseded_start" };
  // Do not lose evidence of a local reservation merely because its former
  // worker is no longer alive. Archive its counts before clearing the daily
  // session progress; server ledger/history stays completely untouched.
  const archivedKey = STORAGE_STALE_RESERVATIONS + session.user.id;
  const archivedRaw = canDetach && initial.rightSwipesReserved > 0
    ? (await chrome.storage.local.get(archivedKey))[archivedKey] : null;
  const archivedEntries = Array.isArray(archivedRaw) ? archivedRaw.slice(-29) : [];
  if (canDetach && initial.rightSwipesReserved > 0)
    archivedEntries.push({
      dayKey: initial.dayKey, reserved: initial.rightSwipesReserved,
      uiObserved: initial.rightSwipesConfirmed, detachedAt: new Date().toISOString(),
      reason: "stale_unknown_not_retried"
    });
  await chrome.storage.local.set({
    [progressKey]: updatedProgress,
    ...(canDetach && initial.rightSwipesReserved > 0 ? { [archivedKey]: archivedEntries } : {}),
    [key]: { armed: true, userId: session.user.id, tabId: tabs[0].id },
    [STORAGE_STOP]: false
  });
  if (canDetach) await saveStatus(session.user.id, "stale_reserved_archived_no_retry");
  // Stop may have arrived while the storage write was in flight. Its queued
  // final disarm wins; never report a successful Start in that case.
  if (expectedStopEpoch !== stopEpoch) return { ok: false, reason: "stop_superseded_start" };
  stopRequested = false;
  return { ok: true, armed: true };
}

/** Internal service-worker entry for the new single-button launcher.
 * Legacy popup authorization remains unchanged. Stop preempts queued Starts.
 */
export function startUnifiedSwipe(): Promise<Record<string, unknown>> {
  const expected = stopEpoch;
  return withTinderRunnerTransition(() => setArmed(true, expected));
}
export function stopUnifiedSwipe(): Promise<Record<string, unknown>> {
  stopRequested = true;
  const expected = ++stopEpoch;
  const latch = chrome.storage.local.set({ [STORAGE_STOP]: true });
  return withTinderRunnerTransition(async () => {
    await latch;
    return setArmed(false, expected);
  });
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
    // Raising this flag is synchronous: Stop blocks subsequent attempt claims
    // and the final pre-action gate before the queued storage write completes.
    const expectedStopEpoch = armed ? stopEpoch : ++stopEpoch;
    if (!armed) stopRequested = true;
    const latch = armed ? Promise.resolve() : chrome.storage.local.set({ [STORAGE_STOP]: true });
    void withTinderRunnerTransition(async () => {
      await latch;
      return setArmed(armed, expectedStopEpoch);
    }).then(respond).catch(() => respond({ ok: false, reason: "start_stop_failed" }));
    return true;
  }
  return false;
});
