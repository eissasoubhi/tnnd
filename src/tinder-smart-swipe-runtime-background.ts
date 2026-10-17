import { getBackendSession } from "./storage";
import { readNewMatchState } from "./tinder-new-match-background";
import { validateSmartAutoSwipeConfig, type SmartAutoSwipeConfig } from "./tinder-smart-auto-swipe-policy";
import { planSwipeRuntime } from "./tinder-swipe-runtime-gates";
import { scheduleSmartSwipeSession } from "./tinder-smart-swipe-daily-scheduler";
import { readSmartSwipeProgress } from "./tinder-smart-swipe-progress-store";
import type { SwipeDiscoveryEvidence } from "./tinder-swipe-discovery-evidence";

const API = "http://127.0.0.1:4000";
const PROGRESS_PREFIX = "tnnd.smartSwipeDailyProgress.v1:";
const safeMessage = (reason: string) => ({ ok: false as const, reason });
type SettingsResponse = { settings?: SmartAutoSwipeConfig & { timeZone: string }; liveExecutionAvailable?: boolean };
type ExistingState = {
  enabled?: boolean; userId?: string | null; phase?: string; mode?: string;
  activeConversationRef?: string | null; activeConversationUntil?: string | null;
  pendingReplies?: number;
};
function isTinder(url: string | undefined): boolean {
  try { return ["https://tinder.com", "https://www.tinder.com"].includes(new URL(url ?? "").origin); }
  catch { return false; }
}
async function inspectSmartSwipeStatus(): Promise<Record<string, unknown>> {
  const session = await getBackendSession();
  if (!session) return safeMessage("tnnd_sign_in_required");
  const response = await fetch(API + "/api/v1/automation/smart-swipe", {
    headers: { authorization: "Bearer " + session.token },
    cache: "no-store"
  });
  if (!response.ok) return safeMessage("settings_unavailable");
  const data = await response.json() as SettingsResponse;
  const settings = data.settings;
  if (!settings || validateSmartAutoSwipeConfig(settings).length ||
      typeof settings.timeZone !== "string") return safeMessage("invalid_server_settings");
  try { new Intl.DateTimeFormat("en-US", { timeZone: settings.timeZone }); }
  catch { return safeMessage("invalid_account_timezone"); }
  const armedState = (await chrome.storage.local.get("tnnd.smartSwipeLiveArm.v1:" + session.user.id))
    ["tnnd.smartSwipeLiveArm.v1:" + session.user.id] as { armed?: boolean } | undefined;
  const armed = armedState?.armed === true;
  const resultState = (await chrome.storage.local.get("tnnd.smartSwipeLastResult.v1:" + session.user.id))
    ["tnnd.smartSwipeLastResult.v1:" + session.user.id] as string | undefined;
  let serverAttempts: {
    attemptsToday: number; uiObservedToday: number; unresolvedAttempts: number
  } | null = null;
  try {
    const ledgerResponse = await fetch(API + "/api/v1/automation/smart-swipe/attempts/summary", {
      headers: { authorization: "Bearer " + session.token }, cache: "no-store"
    });
    if (ledgerResponse.ok) serverAttempts = await ledgerResponse.json() as {
      attemptsToday: number; uiObservedToday: number; unresolvedAttempts: number
    };
  } catch { /* Unknown is not zero. */ }

  const now = Date.now();
  const progressKey = PROGRESS_PREFIX + session.user.id;
  const stored = (await chrome.storage.local.get(progressKey))[progressKey];
  const result = readSmartSwipeProgress(stored, now, settings.timeZone);
  if (!result.ok) return safeMessage(result.reason);
  if (result.needsSave) await chrome.storage.local.set({ [progressKey]: result.progress });
  if (!settings.enabled) return {
    ok: true, enabled: false, armed: false, executionAvailable: false,
    status: "disabled", nextActivity: null,
    progress: { startedSessions: result.progress.startedSessions,
      rightSwipesConfirmed: result.progress.rightSwipesConfirmed,
      rightSwipesReserved: result.progress.rightSwipesReserved }
  };
  const tabs = (await chrome.tabs.query({ url: ["https://tinder.com/*", "https://www.tinder.com/*"] }))
    .filter(tab => isTinder(tab.url));
  if (tabs.length !== 1 || !tabs[0].id) return safeMessage("exactly_one_tinder_tab_required");
  const tab = tabs[0];
  const observed = await chrome.tabs.sendMessage(tab.id!, { type: "TNND_SMART_SWIPE_OBSERVE" })
    .catch(() => null) as { ok?: boolean; evidence?: SwipeDiscoveryEvidence } | null;
  if (!observed?.ok || observed.evidence?.version !== 1)
    return safeMessage("discovery_bridge_unavailable");
  const existing = (await chrome.storage.local.get("tnnd.globalExistingRunner.v2"))["tnnd.globalExistingRunner.v2"] as ExistingState | undefined;
  const newMatch = await readNewMatchState();
  const sameUserExisting = existing?.enabled === true && existing.userId === session.user.id;
  const sameUserMatches = newMatch.enabled && newMatch.userId === session.user.id;
  const activeConversation = sameUserExisting && Boolean(existing?.activeConversationRef) &&
    typeof existing?.activeConversationUntil === "string" &&
    Date.parse(existing.activeConversationUntil) > now;
  // A send/generation in flight is never preempted, irrespective of optional pause preference.
  const mandatoryStop = Boolean(sameUserExisting && ["sending", "generating", "incoming", "loading"].includes(existing?.phase ?? ""));
  const availability = {
    activeConversationInProgress: activeConversation,
    activeChatsAvailable: sameUserExisting && ((existing?.pendingReplies ?? 0) > 0 || activeConversation),
    newMatchesAvailable: sameUserMatches && newMatch.pendingRefs.length > 0,
    mandatoryStop
  };
  const decision = planSwipeRuntime(settings, result.progress, observed.evidence, now, settings.timeZone, availability);
  return {
    ok: true, enabled: true, armed, executionAvailable: false,
    status: decision.swipeStatus, nextActivity: decision.activity,
    lastResult: resultState ?? null,
    remainingSessions: Math.max(0, settings.sessionsPerDay - result.progress.startedSessions),
    attemptsToday: serverAttempts?.attemptsToday ?? null,
    uiObservedToday: serverAttempts?.uiObservedToday ?? null,
    unresolvedOnServer: serverAttempts?.unresolvedAttempts ?? null,
    remainingAttempts: serverAttempts
      ? Math.max(0, settings.maxRightSwipesPerDay - serverAttempts.attemptsToday) : null,
    session: result.progress.session ? {
      active: result.progress.session.runningSinceMs !== null,
      remainingMs: Math.max(0, result.progress.session.durationMs -
        (result.progress.session.activeElapsedMs +
         (result.progress.session.runningSinceMs === null ? 0 :
          Math.max(0, now - result.progress.session.runningSinceMs))))
    } : null,
    schedule: scheduleSmartSwipeSession(settings, result.progress, now, settings.timeZone).reason,
    controls: {
      route: observed.evidence.route, status: observed.evidence.status,
      likeControls: observed.evidence.likeControls,
      passControls: observed.evidence.passControls
    },
    progress: {
      startedSessions: result.progress.startedSessions,
      rightSwipesConfirmed: result.progress.rightSwipesConfirmed,
      rightSwipesReserved: result.progress.rightSwipesReserved
    }
  };
}

/** Popup may inspect state only. No content script may trigger a Like through this endpoint. */
chrome.runtime.onMessage.addListener((message: unknown, sender, respond) => {
  if (!message || typeof message !== "object" ||
      (message as { type?: unknown }).type !== "TNND_SMART_SWIPE_RUNTIME_STATUS") return false;
  if (sender.id !== chrome.runtime.id ||
      sender.url !== `chrome-extension://${chrome.runtime.id}/popup.html`) {
    respond(safeMessage("popup_only"));
    return false;
  }
  void inspectSmartSwipeStatus().then(respond)
    .catch(() => respond(safeMessage("runtime_status_unavailable")));
  return true;
});
