import { getBackendSession, getConfig } from "./storage";
import { initialUnifiedActivity, fallbackAfterBlockedSwipe } from "./unified-activity-policy";
import { validateSmartAutoSwipeConfig, type SmartAutoSwipeConfig,
  type ManagedTinderActivity } from "./tinder-smart-auto-swipe-policy";
import { startUnifiedSwipe, stopUnifiedSwipe } from "./tinder-smart-swipe-automation-background";
import { startExistingRunner, stopUnifiedExistingRunner } from "./tinder-global-existing-runner";
import { readNewMatchState, stopUnifiedNewMatchRunner } from "./tinder-new-match-background";
import { verifiedDailyQuota } from "./unified-quota-status";
import { reachedUnifiedLimits, type UnifiedLimitSnapshot } from "./unified-reached-limits";
import { manualActivity, manualSwipeReleaseSafe, watcherSwitchSafety } from "./unified-manual-mode-policy";

const API = "http://127.0.0.1:4000";
const MASTER = "tnnd.unifiedLauncher.v1";
const SWIPE_ARM = "tnnd.smartSwipeLiveArm.v1:";
const WATCHER_KEY = "tnnd.globalExistingRunner.v2";
const CAP_ALARM = "tnnd.unifiedLauncher.quotaHandoff";
let handoffBusy = false;
let commandEpoch = 0;
let working = false;

interface OwnerSnapshot {
  running: boolean;
  mode: ManagedTinderActivity | null;
  conflict: boolean;
}
function isTinderTab(tab: chrome.tabs.Tab): boolean {
  try { return ["https://tinder.com", "https://www.tinder.com"]
    .includes(new URL(tab.url ?? "").origin); } catch { return false; }
}
async function owners(): Promise<OwnerSnapshot> {
  const stored = await chrome.storage.local.get(null);
  const swipe = Object.entries(stored).some(([key, value]) =>
    key.startsWith(SWIPE_ARM) && value && typeof value === "object" &&
      (value as { armed?: unknown }).armed === true);
  const existing = stored[WATCHER_KEY] as
    { enabled?: boolean; mode?: string; autoOpenersEnabled?: boolean;
      preferUnstartedMatches?: boolean; manualActivity?: string } | undefined;
  const matches = await readNewMatchState();
  const active = [swipe, existing?.enabled === true, matches.enabled === true]
    .filter(Boolean).length;
  return {
    running: active > 0,
    conflict: active > 1,
    mode: swipe ? "swipe" :
      existing?.enabled ? (existing.manualActivity === "new-match" ||
        (existing.autoOpenersEnabled && existing.preferUnstartedMatches) ? "new-match" : "active-chat") :
      matches.enabled ? "new-match" : null
  };
}
async function readReachedLimits(): Promise<UnifiedLimitSnapshot | null> {
  try {
    const session = await getBackendSession();
    if (!session) return null;
    const headers = { authorization: "Bearer " + session.token };
    const [settingsResponse, attemptsResponse] = await Promise.all([
      fetch(API + "/api/v1/automation/smart-swipe", { headers, cache: "no-store" }),
      fetch(API + "/api/v1/automation/smart-swipe/attempts/summary", { headers, cache: "no-store" })
    ]);
    if (!settingsResponse.ok) return null;
    const settingsBody = await settingsResponse.json() as {
      settings?: SmartAutoSwipeConfig & { timeZone: string }
    };
    const settings = settingsBody.settings;
    if (!settings || validateSmartAutoSwipeConfig(settings).length) return null;
    const key = "tnnd.smartSwipeDailyProgress.v1:" + session.user.id;
    const storedProgress = (await chrome.storage.local.get(key))[key];
    // Keep visible configured maxima and local sessions when the remote
    // attempt journal is offline. Unknown attempts stay unknown, not 0.
    const summary = attemptsResponse.ok ? await attemptsResponse.json().catch(() => null) : null;
    return reachedUnifiedLimits(settings, summary, storedProgress, Date.now());
  } catch {
    // Unavailable ledger information is unknown, not a zero counter or a
    // successful Tinder action. Never reset or infer any quota.
    return null;
  }
}
async function status(): Promise<Record<string, unknown>> {
  const owner = await owners();
  const store = (await chrome.storage.local.get(MASTER))[MASTER] as
    { enabled?: boolean; mode?: ManagedTinderActivity; pausedSwipeReason?: string | null;
      handoffBlock?: string | null; manualMode?: ManagedTinderActivity | null } | undefined;
  // Quotas remain visible even when Start was REFUSED: an exhausted Swipe
  // attempt cap is useful information when the engine is stopped.
  const limitSnapshot = await readReachedLimits();
  const quota = limitSnapshot?.swipeQuota ?? null;
  const quotaReached = owner.mode === "swipe" && !owner.conflict && quota?.reached === true;
  // Extension reloads may restore a previously armed Swipe without firing
  // onStartup; recreate the periodic cap guard on its next status check.
  if (owner.mode === "swipe" && !owner.conflict && store?.enabled &&
      !(await chrome.alarms.get(CAP_ALARM)))
    await chrome.alarms.create(CAP_ALARM, { periodInMinutes: 1 });
  // Never report active based solely on a stale master flag.
  return {
    ok: true, running: owner.running, mode: owner.mode,
    manualMode: owner.running && !owner.conflict && store?.enabled && store.manualMode === owner.mode
      ? store.manualMode : null,
    quotaPaused: quotaReached, quota: quotaReached ? quota : null,
    reachedLimits: limitSnapshot?.reached ?? [],
    limitCounters: limitSnapshot?.counters ?? [],
    reason: owner.conflict ? "Plusieurs moteurs déjà actifs. Clique Arrêter pour les désarmer." :
      quotaReached
        ? "Quota quotidien de Swipe atteint (" + quota!.used + "/" + quota!.limit +
          "). Aucun nouveau Like possible aujourd'hui. Arrête puis redémarre pour choisir une autre activité autorisée."
        :
      owner.running && !store?.enabled
        ? "Un ancien moteur est actif. Arrêter permet de reprendre le contrôle."
        : owner.running && store?.enabled &&
            (store.mode === owner.mode || (store.mode === "new-match" && owner.mode === "active-chat")) &&
            store.pausedSwipeReason
          ? store.pausedSwipeReason === "daily_cap"
            ? (owner.mode === "new-match"
                ? "Quota Swipe atteint. Phase 1 : nouveaux matchs ; ensuite conversations en attente."
                : "Quota Swipe atteint. Phase 2 : réponses aux conversations en attente.")
            : "Swipe en attente (ancien Like non résolu). Surveillance active, sans rejouer le Like."
          : owner.running
            ? "Activité lancée selon les priorités configurées."
            : store?.handoffBlock ?? ""
  };
}
async function stopEverything(): Promise<{ ok: boolean; reason?: string }> {
  // Immediate preemption of the Swipe claim guard; never await a backend API
  // before stopping. Each existing engine retains its own safe Stop semantics.
  const results = await Promise.allSettled([
    stopUnifiedSwipe(), stopUnifiedExistingRunner(), stopUnifiedNewMatchRunner()
  ]);
  const rejected = results.some(r => r.status === "rejected" ||
    (r.status === "fulfilled" && r.value && "ok" in r.value && r.value.ok !== true));
  if (rejected) return { ok: false, reason: "Arrêt partiel : vérifie les moteurs actifs. Aucun journal n'a été supprimé." };
  await chrome.alarms.clear(CAP_ALARM);
  await chrome.storage.local.set({ [MASTER]: { enabled: false, mode: null, stoppedAt: Date.now() } });
  return { ok: true };
}
async function stop(epoch: number): Promise<Record<string, unknown>> {
  const outcome = await stopEverything();
  if (epoch !== commandEpoch) return { ok: false, reason: "Commande remplacée par une action plus récente." };
  if (!outcome.ok) return { ok: false, reason: outcome.reason };
  const observed = await owners();
  if (observed.running) return { ok: false, reason: "Un moteur est encore actif; arrêt non confirmé." };
  return { ok: true, running: false, mode: null };
}
/** Do not switch away from Swipe unless all authoritative Like claims are settled. */
async function safeSwipeHandoff(
  session: { token: string; user: { id: string } },
  settings: SmartAutoSwipeConfig & { timeZone: string }
): Promise<boolean> {
  try {
    const response = await fetch(API + "/api/v1/automation/smart-swipe/attempts/summary", {
      headers: { authorization: "Bearer " + session.token }, cache: "no-store"
    });
    if (!response.ok) return false;
    const summary = await response.json();
    const key = "tnnd.smartSwipeDailyProgress.v1:" + session.user.id;
    const stored = (await chrome.storage.local.get(key))[key];
    return manualSwipeReleaseSafe(settings, summary, stored, Date.now());
  } catch { return false; }
}
async function start(epoch: number, requestedMode: ManagedTinderActivity | null = null): Promise<Record<string, unknown>> {
  if (working || handoffBusy) return { ok: false, reason: "Transition déjà en cours." };
  working = true;
  try {
    const before = await owners();
    if (before.running && !requestedMode) return { ok: false, reason: "Un moteur est déjà actif. Clique Arrêter avant de redémarrer." };
    if (before.conflict) return { ok: false, reason: "Plusieurs moteurs actifs : utilise Arrêter pour sécuriser la session." };
    if (before.running && before.mode === requestedMode) {
      const currentMaster = (await chrome.storage.local.get(MASTER))[MASTER] as
        { enabled?: boolean; manualMode?: ManagedTinderActivity | null } | undefined;
      if (currentMaster?.enabled && currentMaster.manualMode === requestedMode) return status();
    }
    const session = await getBackendSession();
    if (!session) return { ok: false, reason: "tnnd_extension_session_missing" };
    const response = await fetch(API + "/api/v1/automation/smart-swipe", {
      headers: { authorization: "Bearer " + session.token }, cache: "no-store"
    });
    if (!response.ok) return { ok: false, reason: "Impossible de lire les priorités TNND Web." };
    const data = await response.json() as { settings?: SmartAutoSwipeConfig & { timeZone: string } };
    const settings = data.settings;
    if (!settings || validateSmartAutoSwipeConfig(settings).length)
      return { ok: false, reason: "Configuration Web invalide. Corrige les priorités avant de démarrer." };
    if (!settings.enabled)
      return { ok: false, reason: "Active l'automatisation dans les paramètres TNND Web." };
    const tabs = (await chrome.tabs.query({
      url: ["https://tinder.com/*", "https://www.tinder.com/*"]
    })).filter(isTinderTab);
    if (tabs.length !== 1 || !tabs[0].id)
      return { ok: false, reason: "Une seule fenêtre Tinder est nécessaire." };
    const config = await getConfig();
    let selected = requestedMode ?? initialUnifiedActivity(settings, {
      tinderTabPresent: true,
      discoveryVisible: new URL(tabs[0].url!).pathname.replace(/\/+$/, "") === "/app/recs",
      automaticRepliesEnabled: config.automation.enabled
    });
    if (!selected) return { ok: false, reason:
      "Aucune activité autorisée ici. Vérifie Tinder et les paramètres d'automatisation." };
    if (requestedMode && !settings.priority.includes(requestedMode))
      return { ok: false, reason: "Cette activité n'est pas autorisée dans TNND Web." };
    if (selected === "swipe" && !["/app/recs", "/app/recs/"].includes(new URL(tabs[0].url!).pathname))
      return { ok: false, reason: "Ouvre Découvrir dans Tinder pour passer à Swipe. Le mode actuel reste actif." };
    if (selected !== "swipe" && !config.automation.enabled)
      return { ok: false, reason: "Active les réponses automatiques dans TNND Options pour ce mode." };
    if (before.running) {
      const master = (await chrome.storage.local.get(MASTER))[MASTER] as
        { enabled?: boolean; userId?: string } | undefined;
      if (!master?.enabled || master.userId !== session.user.id)
        return { ok: false, reason: "Moteur non géré par ce lanceur ou compte différent. Utilise Arrêter." };
      if (before.mode === "swipe") {
        if (!(await safeSwipeHandoff(session, settings)))
          return { ok: false, reason: "Swipe : tentative en cours ou journal indisponible. Aucune bascule effectuée." };
      } else {
        const watcher = (await chrome.storage.local.get(WATCHER_KEY))[WATCHER_KEY];
        const safety = watcherSwitchSafety(watcher);
        if (!safety.allowed) return { ok: false, reason: safety.reason };
      }
      if (epoch !== commandEpoch) return { ok: false, reason: "Bascule annulée par Arrêter." };
      const stopped = await stopEverything();
      if (!stopped.ok || (await owners()).running)
        return { ok: false, reason: "Arrêt de l'ancien mode non confirmé. Aucun autre moteur lancé." };
      if (before.mode === "swipe" && !(await safeSwipeHandoff(session, settings)))
        return { ok: false, reason: "Swipe arrêté, mais une tentative reste incertaine. Aucun autre moteur lancé." };
    }
    if (epoch !== commandEpoch) return { ok: false, reason: "Démarrage annulé par Stop." };
    let pausedSwipeReason: string | null = null;
    if (selected === "swipe") {
      // Before arming any Like executor, compare this account's authoritative
      // quota to the current calendar day in its configured timezone.
      // An unreachable/stale summary is UNKNOWN, not permission for Likes or
      // a switch that could overlap an in-flight Like from another client.
      const summaryResponse = await fetch(API + "/api/v1/automation/smart-swipe/attempts/summary", {
        headers: { authorization: "Bearer " + session.token }, cache: "no-store"
      });
      if (!summaryResponse.ok) return { ok: false, reason: "swipe_quota_unavailable" };
      const quota = verifiedDailyQuota(settings, await summaryResponse.json(), Date.now());
      if (!quota) return { ok: false, reason: "swipe_quota_unavailable" };
      if (quota.reached) {
        if (requestedMode === "swipe") return { ok: false, reason:
          "Quota Swipe atteint pour aujourd'hui. Choisis Matches ou Chat si autorisé." };
        const next = fallbackAfterBlockedSwipe(settings, "daily_cap", config.automation.enabled);
        if (!next) return {
          ok: false,
          reason: !config.automation.enabled
            ? "daily_cap_auto_replies_disabled"
            : "daily_cap_no_lower_priority_activity"
        };
        const currentOwners = await owners();
        if (currentOwners.running || currentOwners.conflict)
          return { ok: false, reason: "Mode concurrent détecté après vérification du quota." };
        if (epoch !== commandEpoch) return { ok: false, reason: "Démarrage annulé par Stop." };
        selected = "new-match";
        pausedSwipeReason = "daily_cap";
      }
    }
    if (selected === "swipe") {
      const result = await startUnifiedSwipe();
      if (result.ok !== true || result.armed !== true) {
        const reason = typeof result.reason === "string" ? result.reason : "swipe_start_unknown";
        const next = fallbackAfterBlockedSwipe(settings, reason, config.automation.enabled);
        if (requestedMode) return { ok: false, reason };
        if (!next) return { ok: false, reason };
        // A refusal due to an unresolved old Like is NOT permission to
        // start a different engine if Swipe was armed concurrently.
        const currentOwners = await owners();
        if (currentOwners.running || currentOwners.conflict)
          return { ok: false, reason: "Mode concurrent détecté après le refus Swipe." };
        if (epoch !== commandEpoch)
          return { ok: false, reason: "Démarrage annulé par Stop." };
        selected = next;
        pausedSwipeReason = reason;
      }
    }
    if (selected !== "swipe") {
      // The established watcher performs BOTH authorized chat/match tasks.
      // Swipe's original quota/uncertain attempts remain untouched; no Likes.
      if (epoch !== commandEpoch) return { ok: false, reason: "Démarrage annulé par Stop." };
      const result = await startExistingRunner(false, "watcher", selected === "new-match",
        selected === "new-match", requestedMode === "new-match" || requestedMode === "active-chat" ? selected : null);
      if (!result.enabled || result.mode !== "watcher")
        return { ok: false, reason: "Surveillance non confirmée." };
    }
    if (epoch !== commandEpoch) {
      await stopEverything();
      return { ok: false, reason: "Stop reçu pendant le démarrage." };
    }
    await chrome.storage.local.set({ [MASTER]: {
      enabled: true, mode: selected, userId: session.user.id, startedAt: Date.now(),
      pausedSwipeReason, manualMode: requestedMode
    } });
    if (selected === "swipe") await chrome.alarms.create(CAP_ALARM, { periodInMinutes: 1 });
    else await chrome.alarms.clear(CAP_ALARM);
    return {
      ok: true, running: true, mode: selected, manualMode: requestedMode,
      reason: pausedSwipeReason === "daily_cap"
        ? "Quota Swipe atteint. Phase 1 : nouveaux matchs ; ensuite conversations en attente."
        : pausedSwipeReason
          ? "Swipe en attente (ancien Like non résolu). Surveillance des conversations et matchs autorisée."
          : undefined
    };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message.slice(0, 180) : "Erreur de démarrage." };
  } finally {
    working = false;
  }
}
/** A verified daily cap may exhaust *during* an already armed Swipe
 * session. Handoff is a real serialized STOP before any watcher Start.
 * No periodic auto-rearm and no retries of uncertain Likes.
 */
async function handoffOnReachedCap(): Promise<void> {
  if (handoffBusy || working) return;
  handoffBusy = true;
  const epoch = commandEpoch;
  try {
    const master = (await chrome.storage.local.get(MASTER))[MASTER] as
      { enabled?: boolean; mode?: ManagedTinderActivity; userId?: string;
        manualMode?: ManagedTinderActivity | null } | undefined;
    if (!master?.enabled || master.mode !== "swipe" || !master.userId || master.manualMode) {
      await chrome.alarms.clear(CAP_ALARM);
      return;
    }
    const owner = await owners();
    if (!owner.running || owner.conflict || owner.mode !== "swipe") return;
    const session = await getBackendSession();
    const config = await getConfig();
    if (!session || session.user.id !== master.userId || !config.automation.enabled) return;
    const settingsResponse = await fetch(API + "/api/v1/automation/smart-swipe", {
      headers: { authorization: "Bearer " + session.token }, cache: "no-store"
    });
    if (!settingsResponse.ok) return;
    const settingsBody = await settingsResponse.json() as {
      settings?: SmartAutoSwipeConfig & { timeZone: string }
    };
    const settings = settingsBody.settings;
    if (!settings?.enabled || validateSmartAutoSwipeConfig(settings).length ||
        !settings.priority.includes("new-match")) return;
    const check = await readReachedLimits();
    if (!check?.safeToReleaseSwipe) return;
    // Do not switch the user away from their own active/other Tinder tab.
    const tabs = (await chrome.tabs.query({
      url: ["https://tinder.com/*", "https://www.tinder.com/*"]
    })).filter(isTinderTab);
    if (tabs.length !== 1 || !tabs[0].id) return;
    if (epoch !== commandEpoch || (await owners()).mode !== "swipe") return;

    const disarmed = await stopUnifiedSwipe();
    if (disarmed.ok !== true || disarmed.armed !== false) return;
    // STOP has already put up the durable latch. Recheck local and server
    // reservations after it; a claim could have raced the first cap check.
    const second = await readReachedLimits();
    const stoppedOwner = await owners();
    const masterAfter = (await chrome.storage.local.get(MASTER))[MASTER] as
      { enabled?: boolean; mode?: string; userId?: string } | undefined;
    if (epoch !== commandEpoch || !masterAfter?.enabled ||
        masterAfter.mode !== "swipe" || masterAfter.userId !== session.user.id) return;
    if (!second?.safeToReleaseSwipe || stoppedOwner.running || stoppedOwner.conflict) {
      await chrome.storage.local.set({ [MASTER]: { enabled: false, mode: null,
        handoffBlock: "Swipe arrêté après quota ; tentative en cours ou état incertain. Vérifie les tentatives avant de relancer." } });
      await chrome.alarms.clear(CAP_ALARM);
      return;
    }
    const watcher = await startExistingRunner(false, "watcher", true, true);
    if (!watcher.enabled || watcher.mode !== "watcher" || !watcher.autoOpenersEnabled)
      throw new Error("watcher_start_unconfirmed");
    if (epoch !== commandEpoch) {
      await stopEverything();
      return;
    }
    await chrome.storage.local.set({ [MASTER]: {
      enabled: true, mode: "new-match", userId: session.user.id,
      pausedSwipeReason: "daily_cap", startedAt: Date.now()
    } });
    await chrome.alarms.clear(CAP_ALARM);
  } catch {
    // Stay disarmed if the handoff fails. Never silently re-arm an exhausted
    // or unresolved Swipe, and never run competing owners.
    if (epoch === commandEpoch && !(await owners()).running) {
      await chrome.storage.local.set({ [MASTER]: { enabled: false, mode: null,
        handoffBlock: "Quota Swipe atteint ; reprise automatique des matchs indisponible. Vérifie Tinder et les autorisations." } }).catch(() => undefined);
      await chrome.alarms.clear(CAP_ALARM).catch(() => undefined);
    }
  } finally { handoffBusy = false; }
}
chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === CAP_ALARM) void handoffOnReachedCap();
});
chrome.runtime.onStartup.addListener(() => {
  void (async () => {
    const master = (await chrome.storage.local.get(MASTER))[MASTER] as
      { enabled?: boolean; mode?: string } | undefined;
    if (master?.enabled && master.mode === "swipe")
      await chrome.alarms.create(CAP_ALARM, { periodInMinutes: 1 });
  })().catch(() => undefined);
});
chrome.runtime.onInstalled.addListener(() => {
  void (async () => {
    const master = (await chrome.storage.local.get(MASTER))[MASTER] as
      { enabled?: boolean; mode?: string } | undefined;
    if (master?.enabled && master.mode === "swipe")
      await chrome.alarms.create(CAP_ALARM, { periodInMinutes: 1 });
  })().catch(() => undefined);
});
chrome.runtime.onMessage.addListener((message: unknown, sender, respond) => {
  if (!message || typeof message !== "object") return false;
  const type = (message as { type?: unknown }).type;
  if (!["TNND_UNIFIED_START", "TNND_UNIFIED_STOP", "TNND_UNIFIED_STATUS", "TNND_UNIFIED_SELECT_MODE"].includes(String(type))) return false;
  if (sender.id !== chrome.runtime.id ||
      sender.url !== `chrome-extension://${chrome.runtime.id}/launcher.html`) {
    respond({ ok: false, reason: "launcher_only" }); return false;
  }
  if (type === "TNND_UNIFIED_STATUS") {
    void status().then(respond).catch(() => respond({ ok: false, reason: "status_unavailable" }));
    return true;
  }
  if (type === "TNND_UNIFIED_SELECT_MODE" && !manualActivity((message as { mode?: unknown }).mode)) {
    respond({ ok: false, reason: "Mode manuel invalide." }); return false;
  }
  // An incoming Stop invalidates a pending Start immediately, even if a
  // service-worker transition queue is busy with another older operation.
  const epoch = ++commandEpoch;
  void (type === "TNND_UNIFIED_STOP" ? stop(epoch) : start(epoch,
      type === "TNND_UNIFIED_SELECT_MODE" ? manualActivity((message as { mode?: unknown }).mode) : null))
    .then(respond).catch(() => respond({ ok: false, reason: "command_failed" }));
  return true;
});
