import { getBackendSession, getConfig } from "./storage";
import { initialUnifiedActivity } from "./unified-activity-policy";
import { validateSmartAutoSwipeConfig, type SmartAutoSwipeConfig,
  type ManagedTinderActivity } from "./tinder-smart-auto-swipe-policy";
import { startUnifiedSwipe, stopUnifiedSwipe } from "./tinder-smart-swipe-automation-background";
import { startExistingRunner, stopUnifiedExistingRunner } from "./tinder-global-existing-runner";
import { readNewMatchState, stopUnifiedNewMatchRunner } from "./tinder-new-match-background";

const API = "http://127.0.0.1:4000";
const MASTER = "tnnd.unifiedLauncher.v1";
const SWIPE_ARM = "tnnd.smartSwipeLiveArm.v1:";
const WATCHER_KEY = "tnnd.globalExistingRunner.v2";
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
    { enabled?: boolean; mode?: string; autoOpenersEnabled?: boolean } | undefined;
  const matches = await readNewMatchState();
  const active = [swipe, existing?.enabled === true, matches.enabled === true]
    .filter(Boolean).length;
  return {
    running: active > 0,
    conflict: active > 1,
    mode: swipe ? "swipe" :
      existing?.enabled ? (existing.autoOpenersEnabled ? "new-match" : "active-chat") :
      matches.enabled ? "new-match" : null
  };
}
async function status(): Promise<Record<string, unknown>> {
  const owner = await owners();
  const store = (await chrome.storage.local.get(MASTER))[MASTER] as
    { enabled?: boolean; mode?: ManagedTinderActivity } | undefined;
  // Never report active based solely on a stale master flag.
  return {
    ok: true, running: owner.running, mode: owner.mode,
    reason: owner.conflict ? "Plusieurs moteurs déjà actifs. Clique Arrêter pour les désarmer." :
      owner.running && !store?.enabled
        ? "Un ancien moteur est actif. Arrêter permet de reprendre le contrôle."
        : owner.running
          ? "Activité initiale lancée. Le changement automatique entre activités viendra dans l'étape suivante."
          : ""
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
async function start(epoch: number): Promise<Record<string, unknown>> {
  if (working) return { ok: false, reason: "Démarrage déjà en cours." };
  working = true;
  try {
    const before = await owners();
    if (before.running) return { ok: false, reason: "Un moteur est déjà actif. Clique Arrêter avant de redémarrer." };
    const session = await getBackendSession();
    if (!session) return { ok: false, reason: "Connecte TNND à ton compte depuis le Web." };
    const response = await fetch(API + "/api/v1/automation/smart-swipe", {
      headers: { authorization: "Bearer " + session.token }, cache: "no-store"
    });
    if (!response.ok) return { ok: false, reason: "Impossible de lire les priorités TNND Web." };
    const data = await response.json() as { settings?: SmartAutoSwipeConfig };
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
    const selected = initialUnifiedActivity(settings, {
      tinderTabPresent: true,
      discoveryVisible: new URL(tabs[0].url!).pathname.replace(/\/+$/, "") === "/app/recs",
      automaticRepliesEnabled: config.automation.enabled
    });
    if (!selected) return { ok: false, reason:
      "Aucune activité autorisée ici. Vérifie Tinder et les paramètres d'automatisation." };
    if (epoch !== commandEpoch) return { ok: false, reason: "Démarrage annulé par Stop." };
    if (selected === "swipe") {
      const result = await startUnifiedSwipe();
      if (result.ok !== true || result.armed !== true)
        return { ok: false, reason: String(result.reason ?? "Démarrage Swipe refusé") };
    } else {
      // The proven existing watcher owns BOTH chats and matches. Enabling
      // first messages follows only the explicitly configured priority.
      const result = await startExistingRunner(false, "watcher", selected === "new-match");
      if (!result.enabled || result.mode !== "watcher")
        return { ok: false, reason: "Surveillance non confirmée." };
    }
    if (epoch !== commandEpoch) {
      await stopEverything();
      return { ok: false, reason: "Stop reçu pendant le démarrage." };
    }
    await chrome.storage.local.set({ [MASTER]: {
      enabled: true, mode: selected, userId: session.user.id, startedAt: Date.now()
    } });
    return { ok: true, running: true, mode: selected };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message.slice(0, 180) : "Erreur de démarrage." };
  } finally {
    working = false;
  }
}
chrome.runtime.onMessage.addListener((message: unknown, sender, respond) => {
  if (!message || typeof message !== "object") return false;
  const type = (message as { type?: unknown }).type;
  if (!["TNND_UNIFIED_START", "TNND_UNIFIED_STOP", "TNND_UNIFIED_STATUS"].includes(String(type))) return false;
  if (sender.id !== chrome.runtime.id ||
      sender.url !== `chrome-extension://${chrome.runtime.id}/launcher.html`) {
    respond({ ok: false, reason: "launcher_only" }); return false;
  }
  if (type === "TNND_UNIFIED_STATUS") {
    void status().then(respond).catch(() => respond({ ok: false, reason: "status_unavailable" }));
    return true;
  }
  // An incoming Stop invalidates a pending Start immediately, even if a
  // service-worker transition queue is busy with another older operation.
  const epoch = ++commandEpoch;
  void (type === "TNND_UNIFIED_STOP" ? stop(epoch) : start(epoch))
    .then(respond).catch(() => respond({ ok: false, reason: "command_failed" }));
  return true;
});
