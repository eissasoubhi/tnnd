import { getBackendSession, getConfig } from "./storage";
import { initialUnifiedActivity, fallbackAfterBlockedSwipe } from "./unified-activity-policy";
import { type SmartAutoSwipeConfig, type ManagedTinderActivity } from "./tinder-smart-auto-swipe-policy";
import { parseUnifiedWebSettings, explainUnifiedWebSettingsErrors } from "./unified-web-settings";
import { startUnifiedSwipe, stopUnifiedSwipe } from "./tinder-smart-swipe-automation-background";
import { startExistingRunner, stopUnifiedExistingRunner, readUnifiedPendingReplies } from "./tinder-global-existing-runner";
import { waitForTinderContentBridge } from "./tinder-tab-connection";
import { nextSingleTabRotation, INBOX_SCAN_INTERVAL_MS } from "./tinder-single-tab-rotation";
import { readNewMatchState, stopUnifiedNewMatchRunner } from "./tinder-new-match-background";
import { reachedUnifiedLimits, type UnifiedLimitSnapshot } from "./unified-reached-limits";
import { manualActivity, manualSwipeReleaseSafe, watcherSwitchSafety } from "./unified-manual-mode-policy";

const API = "http://127.0.0.1:4000";
const MASTER = "tnnd.unifiedLauncher.v1";
const SWIPE_ARM = "tnnd.smartSwipeLiveArm.v1:";
const WATCHER_KEY = "tnnd.globalExistingRunner.v2";
const ROTATION_ALARM = "tnnd.unifiedLauncher.singleTabRotation";
const ROTATION_PERIOD_MINUTES = 0.5;
interface AutoRotationState {
  enabled: true;
  autoCycle: true;
  userId: string;
  tabId: number;
  mode: ManagedTinderActivity;
  startedAt: number;
  watcherStartedAt: number | null;
  lastInboxVisitAt: number;
  pendingReplies: number | null;
  manualMode: null;
  handoffBlock?: string | null;
}
let rotationBusy = false;
async function ensureRotationAlarm(): Promise<void> {
  if (!(await chrome.alarms.get(ROTATION_ALARM)))
    await chrome.alarms.create(ROTATION_ALARM, { periodInMinutes: ROTATION_PERIOD_MINUTES });
}
async function activeAutoState(): Promise<AutoRotationState | null> {
  const value = (await chrome.storage.local.get(MASTER))[MASTER] as Partial<AutoRotationState> | undefined;
  return value?.enabled === true && value.autoCycle === true &&
    typeof value.userId === "string" && typeof value.tabId === "number" &&
    typeof value.startedAt === "number" && typeof value.lastInboxVisitAt === "number"
    ? value as AutoRotationState : null;
}
/** Exactly one existing Tinder tab; never open a second logged-in session.
 * Route changes are full navigations only after the prior runner is disarmed.
 * Do not infer success from a URL request: verify route and content bridge.
 */
async function navigateOneTab(tabId: number, path: "/app/recs" | "/app/messages"): Promise<void> {
  const tabs = (await chrome.tabs.query({
    url: ["https://tinder.com/*", "https://www.tinder.com/*"]
  })).filter(isTinderTab);
  if (tabs.length !== 1 || tabs[0].id !== tabId)
    throw new Error("single_tinder_tab_changed");
  const url = new URL(tabs[0].url ?? "");
  if (url.pathname.replace(/\/+$/, "") !== path) {
    await chrome.tabs.update(tabId, { url: url.origin + path });
  }
  await waitForTinderContentBridge(tabId);
  const confirmed = await chrome.tabs.get(tabId);
  if (!isTinderTab(confirmed) ||
      new URL(confirmed.url ?? "").pathname.replace(/\/+$/, "") !== path)
    throw new Error("single_tinder_navigation_unconfirmed");
}
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
    const parsed = parseUnifiedWebSettings(await settingsResponse.json());
    if (!parsed.ok) return null;
    const settings = parsed.settings;
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
  // Counters remain visible through Start and Stop; they do not cap Swipe.
  const limitSnapshot = await readReachedLimits();
  const autoState = await activeAutoState();
  if (autoState && owner.running && !owner.conflict) await ensureRotationAlarm();
  // Expose only verified, bounded operational state, not chat text or match
  // identifiers. Status is read-only and never triggers a Gemini request.
  const watcherRaw = (await chrome.storage.local.get(WATCHER_KEY))[WATCHER_KEY] as
    { enabled?: boolean; mode?: string; phase?: string; phaseDetail?: string;
      pendingReplies?: number; eligibleCount?: number; lastActionAt?: string;
      nextReplyAt?: string | null;
      errorCount?: number; manualActivity?: string } | undefined;
  const watcherInfo = owner.running &&
    (owner.mode === "active-chat" || owner.mode === "new-match") &&
    watcherRaw?.enabled === true && watcherRaw.mode === "watcher"
    ? {
        phase: typeof watcherRaw.phase === "string" ? watcherRaw.phase.slice(0, 30) : "unknown",
        detail: typeof watcherRaw.phaseDetail === "string" ? watcherRaw.phaseDetail.slice(0, 200) : "",
        pendingReplies: Number.isSafeInteger(watcherRaw.pendingReplies) && watcherRaw.pendingReplies! >= 0
          ? watcherRaw.pendingReplies : null,
        eligibleCount: Number.isSafeInteger(watcherRaw.eligibleCount) && watcherRaw.eligibleCount! >= 0
          ? watcherRaw.eligibleCount : null,
        lastActionAt: typeof watcherRaw.lastActionAt === "string" ? watcherRaw.lastActionAt : null,
        nextReplyAt: owner.mode === "active-chat" && watcherRaw.phase === "waiting" &&
          typeof watcherRaw.nextReplyAt === "string" && Number.isFinite(Date.parse(watcherRaw.nextReplyAt))
          ? watcherRaw.nextReplyAt : null
      } : null;
  // Never report active based solely on a stale master flag.
  return {
    ok: true, running: owner.running, mode: owner.mode,
    manualMode: owner.running && !owner.conflict && store?.enabled && store.manualMode === owner.mode
      ? store.manualMode : null,
    quotaPaused: false, quota: null,
    reachedLimits: limitSnapshot?.reached ?? [],
    limitCounters: limitSnapshot?.counters ?? [],
    watcherInfo,
    autoCycle: Boolean(autoState && owner.running && !owner.conflict),
    pendingReplies: autoState?.pendingReplies ?? null,
    reason: owner.conflict ? "Plusieurs moteurs déjà actifs. Clique Arrêter pour les désarmer." :
      owner.running && !store?.enabled
        ? "Un ancien moteur est actif. Arrêter permet de reprendre le contrôle."
        : autoState && owner.running
          ? (owner.mode === "swipe"
              ? "Un onglet · Swipe actif · Chat sans réponse prioritaire, Matches vérifiés régulièrement."
              : "Un onglet · Chat et Matches actifs à tour de rôle · retour à Swipe après traitement.")
        : owner.running && store?.enabled &&
            (store.mode === owner.mode || (store.mode === "new-match" && owner.mode === "active-chat")) &&
            store.pausedSwipeReason
          ? (store.pausedSwipeReason === "daily_cap" || store.pausedSwipeReason === "session_cap")
            ? (owner.mode === "new-match"
                ? "Quota Swipe atteint. Phase 1 : nouveaux matchs ; ensuite conversations en attente."
                : "Quota Swipe atteint. Phase 2 : réponses aux conversations en attente.")
            : "Swipe en attente (ancien Like non résolu). Surveillance active, sans rejouer le Like."
          : owner.running
            ? "Activité lancée selon les priorités configurées."
            : store?.handoffBlock ?? ""
  };
}
/** Single-tab orchestrator: the watcher owns both old unanswered Chat and
 * verified Matches. Only one live UI owner at once; no concurrent click/send.
 * An unresolved Like or active chat always vetoes a navigation.
 */
async function rotateSingleTinderTab(): Promise<void> {
  if (rotationBusy || working) return;
  rotationBusy = true;
  const epoch = commandEpoch;
  let hadDisarmedOwner = false;
  try {
    const master = await activeAutoState();
    if (!master) return;
    const owner = await owners();
    if (owner.conflict || !owner.running || !owner.mode) return;
    const session = await getBackendSession();
    if (!session || session.user.id !== master.userId) return;
    const tabs = (await chrome.tabs.query({
      url: ["https://tinder.com/*", "https://www.tinder.com/*"]
    })).filter(isTinderTab);
    if (tabs.length !== 1 || tabs[0].id !== master.tabId) return;
    const config = await getConfig();
    if (!config.automation.enabled) return; // Swipe-only mode remains available.
    const pendingReplies = await readUnifiedPendingReplies();
    const watcher = (await chrome.storage.local.get(WATCHER_KEY))[WATCHER_KEY] as {
      enabled?: boolean; phase?: string; phaseDetail?: string;
      matchPhase?: string; lastMatchScanAt?: string | null;
      activeConversationRef?: string | null; activeConversationUntil?: string | null;
    } | undefined;
    const next = nextSingleTabRotation({
      owner: owner.mode === "swipe" ? "swipe" : "watcher",
      pendingReplies, lastInboxVisitAt: master.lastInboxVisitAt,
      watcherStartedAt: master.watcherStartedAt,
      lastMatchScanAt: watcher?.lastMatchScanAt ?? null,
      matchPhase: watcher?.matchPhase ?? null,
      watcherSafe: watcherSwitchSafety(watcher).allowed,
      now: Date.now()
    });
    if (epoch !== commandEpoch || !(await activeAutoState())) return;
    if (next === "wait") {
      const still = await activeAutoState();
      if (still && still.startedAt === master.startedAt)
        await chrome.storage.local.set({ [MASTER]: { ...still, pendingReplies } });
      return;
    }
    if (next === "inbox" && owner.mode === "swipe") {
      const settingsResponse = await fetch(API + "/api/v1/automation/smart-swipe", {
        headers: { authorization: "Bearer " + session.token }, cache: "no-store"
      });
      if (!settingsResponse.ok) return;
      const parsed = parseUnifiedWebSettings(await settingsResponse.json());
      if (!parsed.ok || !(await safeSwipeHandoff(session, parsed.settings))) return;
      if (epoch !== commandEpoch) return;
      const result = await stopUnifiedSwipe();
      if (result.ok !== true || (await owners()).running) return;
      hadDisarmedOwner = true;
      if (!(await safeSwipeHandoff(session, parsed.settings)) || epoch !== commandEpoch)
        throw new Error("swipe_attempt_not_settled_after_disarm");
      await navigateOneTab(master.tabId, "/app/messages");
      if (epoch !== commandEpoch || !(await activeAutoState())) return;
      const started = await startExistingRunner(false, "watcher", true, false, null);
      if (!started.enabled || started.mode !== "watcher")
        throw new Error("watcher_start_not_confirmed");
      if (epoch !== commandEpoch) { await stopUnifiedExistingRunner(); return; }
      const still = await activeAutoState();
      if (!still || still.startedAt !== master.startedAt) return;
      await chrome.storage.local.set({ [MASTER]: {
        ...still, mode: "active-chat", pendingReplies, watcherStartedAt: Date.now(),
        lastInboxVisitAt: Date.now(), handoffBlock: null
      } });
      return;
    }
    if (next === "swipe" && owner.mode !== "swipe") {
      if (!watcherSwitchSafety(watcher).allowed || epoch !== commandEpoch) return;
      const stopped = await stopUnifiedExistingRunner();
      if (stopped.enabled || (await owners()).running) return;
      hadDisarmedOwner = true;
      if (epoch !== commandEpoch) return;
      await navigateOneTab(master.tabId, "/app/recs");
      if (epoch !== commandEpoch || !(await activeAutoState())) return;
      const swipe = await startUnifiedSwipe();
      if (swipe.ok !== true || swipe.armed !== true)
        throw new Error("swipe_resume_not_confirmed");
      if (epoch !== commandEpoch) { await stopUnifiedSwipe(); return; }
      const still = await activeAutoState();
      if (!still || still.startedAt !== master.startedAt) return;
      await chrome.storage.local.set({ [MASTER]: {
        ...still, mode: "swipe", watcherStartedAt: null,
        lastInboxVisitAt: Date.now(), pendingReplies: 0, handoffBlock: null
      } });
    }
  } catch {
    // A failed navigation after Stop is NOT evidence that the next engine ran.
    // Do not retry uncertain Likes or re-enable a runner behind the user's back.
    if (hadDisarmedOwner && epoch === commandEpoch) {
      const still = await activeAutoState();
      if (still) await chrome.storage.local.set({ [MASTER]: {
        ...still, enabled: false,
        handoffBlock: "Rotation interrompue : état Tinder non confirmé. Vérifie l'onglet puis relance."
      } });
      await chrome.alarms.clear(ROTATION_ALARM);
    }
  } finally {
    rotationBusy = false;
  }
}

chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === ROTATION_ALARM) void rotateSingleTinderTab();
});
chrome.runtime.onStartup.addListener(() => {
  void activeAutoState().then(master => master ? ensureRotationAlarm() : undefined);
});

async function stopEverything(): Promise<{ ok: boolean; reason?: string }> {
  await chrome.alarms.clear(ROTATION_ALARM);
  // Immediate preemption of the Swipe claim guard; never await a backend API
  // before stopping. Each existing engine retains its own safe Stop semantics.
  const results = await Promise.allSettled([
    stopUnifiedSwipe(), stopUnifiedExistingRunner(), stopUnifiedNewMatchRunner()
  ]);
  const rejected = results.some(r => r.status === "rejected" ||
    (r.status === "fulfilled" && r.value && "ok" in r.value && r.value.ok !== true));
  if (rejected) return { ok: false, reason: "Arrêt partiel : vérifie les moteurs actifs. Aucun journal n'a été supprimé." };
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
  if (working || rotationBusy) return { ok: false, reason: "Transition déjà en cours." };
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
    const parsed = parseUnifiedWebSettings(await response.json());
    if (!parsed.ok)
      return { ok: false, reason: explainUnifiedWebSettingsErrors(parsed.errors) };
    const settings = parsed.settings;
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
    // Automatic mode services the WHOLE unread backlog before new discovery.
    // The server+persisted index recognizes old unanswered turns as well as
    // newly received ones. Failed reads are unknown, never "0 pending".
    const automatic = requestedMode === null && config.automation.enabled &&
      settings.priority.includes("swipe") &&
      settings.priority.includes("active-chat");
    let initialPending: number | null = null;
    if (automatic) {
      initialPending = await readUnifiedPendingReplies();
      const onDiscovery = new URL(tabs[0].url!).pathname.replace(/\\/+$/, "") === "/app/recs";
      selected = initialPending !== null && initialPending > 0 ? "active-chat" :
        onDiscovery ? "swipe" : "active-chat";
    }
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
      const result = await startUnifiedSwipe();
      if (result.ok !== true || result.armed !== true) {
        const reason = typeof result.reason === "string" ? result.reason : "swipe_start_unknown";
        const reconciliationCounts = typeof result.reconciliationCounts === "string"
          ? result.reconciliationCounts.slice(0, 500) : undefined;
        const next = fallbackAfterBlockedSwipe(settings, reason, config.automation.enabled);
        if (requestedMode) return { ok: false, reason, reconciliationCounts };
        if (!next) return { ok: false, reason, reconciliationCounts };
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
      if (automatic && !before.running) {
        // One existing tab; never create a competing Tinder session.
        await navigateOneTab(tabs[0].id, "/app/messages");
      }
      // The established watcher performs BOTH authorized chat/match tasks.
      // Swipe's original quota/uncertain attempts remain untouched; no Likes.
      if (epoch !== commandEpoch) return { ok: false, reason: "Démarrage annulé par Stop." };
      const openers = automatic ? settings.priority.includes("new-match") : selected === "new-match";
      const result = await startExistingRunner(false, "watcher", openers,
        !automatic && selected === "new-match", requestedMode === "new-match" || requestedMode === "active-chat" ? requestedMode : null);
      if (!result.enabled || result.mode !== "watcher")
        return { ok: false, reason: "Surveillance non confirmée." };
    }
    if (epoch !== commandEpoch) {
      await stopEverything();
      return { ok: false, reason: "Stop reçu pendant le démarrage." };
    }
    const autoCycle = automatic && !pausedSwipeReason;
    const startedAt = Date.now();
    await chrome.storage.local.set({ [MASTER]: {
      enabled: true, mode: selected, userId: session.user.id, startedAt,
      ...(autoCycle ? {
        autoCycle: true, tabId: tabs[0].id,
        watcherStartedAt: selected === "swipe" ? null : startedAt,
        lastInboxVisitAt: selected === "swipe" ? startedAt - INBOX_SCAN_INTERVAL_MS : startedAt,
        pendingReplies: initialPending
      } : {}),
      pausedSwipeReason, manualMode: requestedMode
    } });
    if (autoCycle) await ensureRotationAlarm();
    return {
      ok: true, running: true, mode: selected, manualMode: requestedMode,
      reason: autoCycle
        ? "Un seul onglet Tinder : anciens messages sans réponse prioritaires, puis Matches, puis Swipe."
        : pausedSwipeReason === "daily_cap"
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
