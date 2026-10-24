import { explainLauncherStartRefusal } from "./unified-launcher-failure";
import {
  DEFAULT_TNND_WEB_ORIGIN, pickTnndWebTab, tnndWebSection, tnndWebTabUrl
} from "./tnnd-web-tab-navigation";
/** Single-entry TNND popup. Activity tabs only change the visible panel.
 * This UI never dispatches Likes or messages. All actions go through the
 * service-worker orchestrator, which owns authorization and priority checks.
 */
type CurrentMode = "swipe" | "active-chat" | "new-match" | null;
type ReachedLimit = { id: "swipe-attempts" | "swipe-sessions"; label: string;
  used: number; max: number; dayKey: string };
type DailyCounter = { id: ReachedLimit["id"]; label: string;
  used: number | null; max: number | null; dayKey: string | null; reached: boolean };
type WatcherInfo = { phase: string; detail: string; pendingReplies: number | null;
  eligibleCount: number | null; lastActionAt: string | null };
type Status = { ok: boolean; running?: boolean; mode?: CurrentMode; manualMode?: CurrentMode; reason?: string;
  quotaPaused?: boolean; reachedLimits?: ReachedLimit[]; limitCounters?: DailyCounter[];
  watcherInfo?: WatcherInfo | null };
type Command = "TNND_UNIFIED_STATUS" | "TNND_UNIFIED_START" | "TNND_UNIFIED_STOP" | "TNND_UNIFIED_SELECT_MODE";
const toggle = document.getElementById("toggleAutomation") as HTMLButtonElement;
const modeButtons = Array.from(document.querySelectorAll<HTMLButtonElement>(".mode-button"));
const modeActions = Array.from(document.querySelectorAll<HTMLButtonElement>(".mode-action"));

const chatInfo = document.getElementById("chatInfo") as HTMLElement;
const chatPending = document.getElementById("chatPending") as HTMLElement;
const matchesInfo = document.getElementById("matchesInfo") as HTMLElement;
const panels: Record<Exclude<CurrentMode,null>, HTMLElement> = {
  swipe: document.getElementById("panelSwipe") as HTMLElement,
  "new-match": document.getElementById("panelMatches") as HTMLElement,
  "active-chat": document.getElementById("panelChat") as HTMLElement
};
const modeLabels: Record<Exclude<CurrentMode, null>, string> = {
  swipe: "Swipe", "new-match": "Matches", "active-chat": "Chat"
};
const statusEl = document.getElementById("engineStatus") as HTMLElement;
const feedback = document.getElementById("feedback") as HTMLElement;
const webSettingsLink = document.getElementById("webSettingsLink") as HTMLAnchorElement;
const version = document.getElementById("version") as HTMLElement;
const limitsSection = document.getElementById("reachedLimits") as HTMLElement;
const limitsList = document.getElementById("reachedLimitsList") as HTMLUListElement;
const limitsNote = document.getElementById("reachedLimitsNote") as HTMLElement;

/** The build file is generated on each actual installable build. Never show a
 * guessed commit from a page, GitHub branch, user profile, or stale API.
 */
async function showBuildVersion(): Promise<void> {
  const installedVersion = chrome.runtime.getManifest().version;
  try {
    const response = await fetch(chrome.runtime.getURL("BUILD-INFO.json"), { cache: "no-store" });
    if (!response.ok) throw new Error("missing_build_info");
    const value = await response.json() as { version?: unknown; commit?: unknown };
    if (value.version !== installedVersion ||
        typeof value.commit !== "string" || !/^[a-f0-9]{40}$/i.test(value.commit))
      throw new Error("invalid_build_provenance");
    version.textContent = "v" + installedVersion + " (" + value.commit.slice(0, 8) + ")";
    version.title = "Commit Git utilisé pour construire cette extension : " + value.commit;
  } catch {
    version.textContent = "v" + installedVersion + " (commit indisponible)";
    version.title = "La provenance Git de ce build n'a pas pu être vérifiée.";
  }
}

/** Quotas stay visible through Start, Stop, failed starts, Matches and chats.
 * No value is invented when the service worker/server evidence is missing.
 */
function renderDailyCounters(counters: DailyCounter[] | undefined): void {
  if (!Array.isArray(counters)) return; // Start/Stop replies are not status snapshots.
  limitsList.replaceChildren();
  const ids = ["swipe-attempts", "swipe-sessions"] as const;
  const labels: Record<(typeof ids)[number], string> = {
    "swipe-attempts": "Tentatives de Like (TNND)",
    "swipe-sessions": "Sessions Auto Swipe"
  };
  let verifiedDay: string | null = null;
  let unavailable = false;
  for (const id of ids) {
    const raw = counters.find(item => item?.id === id);
    const used = raw?.used;
    const max = raw?.max;
    const validDay = typeof raw?.dayKey === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(raw.dayKey);
    const validCount = typeof used === "number" && Number.isSafeInteger(used) &&
      used >= 0 && typeof max === "number" && Number.isSafeInteger(max) &&
      max > 0 && validDay;
    const row = document.createElement("li");
    const label = document.createElement("span");
    label.textContent = labels[id];
    const numbers = document.createElement("strong");
    numbers.className = "limit-count";
    if (validCount) {
      numbers.textContent = used + " / " + max;
      if (used >= max) {
        row.dataset.reached = "true";
        numbers.textContent += " ✓";
        numbers.title = "Limite atteinte";
      }
      verifiedDay ??= raw.dayKey;
    } else {
      unavailable = true;
      numbers.textContent = "— / " +
        (typeof max === "number" && Number.isSafeInteger(max) && max > 0
          ? max : "—");
    }
    row.append(label, numbers);
    limitsList.append(row);
  }
  limitsSection.dataset.hasReached = limitsList.querySelector('li[data-reached="true"]') ? "true" : "false";
  limitsNote.textContent = verifiedDay
    ? "Journée du " + verifiedDay +
      (unavailable ? " · Compteurs manquants : indisponibles." : "") +
      " · Tentatives TNND, sans preuve d\'acceptation Tinder."
    : "Compteurs indisponibles : aucune valeur n'est supposée à zéro.";
}
let busy = false;
let running = false;
let activeMode: CurrentMode = null;
let selectedMode: Exclude<CurrentMode,null> = "swipe";
let lastStatus: Status = { ok: false };
let requestVersion = 0;

function selectTab(mode: Exclude<CurrentMode, null>, focus = false): void {
  selectedMode = mode;
  for (const button of modeButtons) {
    const chosen = button.dataset.activity === mode;
    button.setAttribute("aria-selected", String(chosen));
    button.tabIndex = chosen ? 0 : -1;
    if (chosen && focus) button.focus();
  }
  for (const [id, panel] of Object.entries(panels)) panel.hidden = id !== mode;
}

function updateButtons(): void {
  toggle.textContent = running ? "Arrêter" : "Démarrer";
  toggle.dataset.mode = running ? "stop" : "start";
  toggle.disabled = busy || !lastStatus.ok;
  for (const button of modeActions) {
    const mode = button.dataset.activity as Exclude<CurrentMode, null>;
    const current = running && activeMode === mode;
    button.textContent = current ? "Arrêter " + modeLabels[mode] :
      running ? "Passer à " + modeLabels[mode] : "Démarrer " + modeLabels[mode];
    button.dataset.mode = current ? "stop" : "start";
    button.disabled = busy || !lastStatus.ok;
  }
  for (const button of modeButtons)
    button.dataset.running = String(running && activeMode === button.dataset.activity);
}

function render(value: Status, detail = ""): void {
  lastStatus = value;
  if (Array.isArray(value.limitCounters)) renderDailyCounters(value.limitCounters);
  else if (!value.ok) renderDailyCounters([]);
  running = value.running === true;
  activeMode = running && value.mode ? value.mode : null;
  statusEl.dataset.state = !value.ok ? "error" :
    running && value.quotaPaused ? "paused" : running ? "running" : "stopped";
  statusEl.textContent = !value.ok ? "Connexion indisponible" :
    !running ? "Arrêté" :
    value.quotaPaused ? "En pause · Quota Swipe atteint" :
    activeMode === "swipe" ? "Actif · Swipe" :
    activeMode === "new-match" ? "Actif · Matches" : "Actif · Chat";
  const info = value.watcherInfo;
  const verified = Boolean(running && info &&
    (activeMode === "new-match" || activeMode === "active-chat"));
  const stage = verified && info ? info.phase : "";
  const detailText = verified && info ? info.detail : "";
  const explanation = !verified ? "Aucune activité en cours pour ce mode." :
    (detailText || "État en cours de vérification.");
  chatInfo.textContent = activeMode === "active-chat" ? explanation :
    "Mode Chat inactif. Active-le pour consulter l'état du traitement.";
  chatPending.textContent = activeMode === "active-chat" && info &&
    typeof info.pendingReplies === "number" ?
      "Conversations en attente vérifiées : " + info.pendingReplies +
      " · Étape : " + stage : "Conversations en attente : — (non vérifié)";
  matchesInfo.textContent = activeMode === "new-match" ? explanation :
    "Mode Matches inactif. Les premiers messages restent soumis aux quotas.";
  feedback.textContent = detail || (value.ok ? value.reason ?? "" :
    "Impossible de lire l'état du moteur. Recharge l'extension.");
  if (!detail) {
    webSettingsLink.href = DEFAULT_TNND_WEB_ORIGIN + "/#workspace-settings-section";
    webSettingsLink.textContent = "Configuration dans TNND Web";
  }
  updateButtons();
}
async function send(type: Command, mode?: Exclude<CurrentMode, null>): Promise<Status> {
  const response = await chrome.runtime.sendMessage({ type, ...(mode ? { mode } : {}) }) as Status | undefined;
  if (!response || response.ok !== true) return { ok: false, reason: response?.reason ?? "service_worker_unavailable" };
  return response;
}
async function refresh(): Promise<void> {
  const ticket = ++requestVersion;
  try {
    const value = await send("TNND_UNIFIED_STATUS");
    if (ticket !== requestVersion) return;
    // An unsuccessful STATUS fetch is not proof that the engine stopped.
    render(value);
  } catch {
    if (ticket === requestVersion)
      render({ ok: false }, "Service worker indisponible. Recharge l'extension.");
  }
}
// Tab clicks never start a runner. Swipe is the visible default only.
for (const button of modeButtons) {
  button.addEventListener("click", () => {
    const mode = button.dataset.activity as Exclude<CurrentMode, null>;
    if (mode in modeLabels) selectTab(mode);
  });
  button.addEventListener("keydown", event => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const ids: Exclude<CurrentMode,null>[] = ["swipe", "new-match", "active-chat"];
    const current = ids.indexOf(selectedMode);
    const next = event.key === "Home" ? 0 : event.key === "End" ? 2 :
      (current + (event.key === "ArrowRight" ? 1 : 2)) % ids.length;
    selectTab(ids[next], true);
  });
}

function applyFailure(reason: string | undefined, isStop = false, isAutomatic = false): void {
  const guidance = explainLauncherStartRefusal(reason);
  feedback.textContent = isStop
    ? "Arrêt non confirmé : " + (reason ?? "commande non confirmée")
    : guidance.reviewAttempts || guidance.connectAccount || guidance.extensionSettings
      ? guidance.message
      : (isAutomatic ? "Démarrage refusé : " : "Bascule refusée : ") +
        (reason ?? "état non confirmé").replace(/[.!?]+$/, "") +
        ". Le mode actif reste affiché ci-dessus.";
  if (isStop) return;
  if (guidance.reviewAttempts) {
    webSettingsLink.href = DEFAULT_TNND_WEB_ORIGIN + "/#smart-swipe-activity";
    webSettingsLink.textContent = "Examiner les tentatives dans TNND Web";
  } else if (guidance.connectAccount) {
    webSettingsLink.href = chrome.runtime.getURL("connect.html");
    webSettingsLink.textContent = "Connecter mon compte à l'extension";
  } else if (guidance.extensionSettings) {
    webSettingsLink.href = chrome.runtime.getURL("options.html");
    webSettingsLink.textContent = "Vérifier les autorisations de l'extension";
  }
}

function requestMode(mode: Exclude<CurrentMode, null> | null): void {
  if (busy) return;
  const stopping = mode === null || (running && activeMode === mode);
  const type: Command = stopping ? "TNND_UNIFIED_STOP" : "TNND_UNIFIED_SELECT_MODE";
  busy = true;
  const ticket = ++requestVersion;
  statusEl.dataset.state = "busy";
  statusEl.textContent = stopping ? "Arrêt en cours…" : "Bascule vers " + modeLabels[mode!] + "…";
  feedback.textContent = "Vérification des autorisations et opérations en cours…";
  updateButtons();
  void (async () => {
    try {
      const result = await send(type, stopping ? undefined : mode!);
      if (ticket !== requestVersion) return;
      await refresh(); // Read actual ownership, never show optimistic success.
      if (!result.ok) {
        applyFailure(result.reason, stopping);
      } else {
        feedback.textContent = stopping
          ? "Arrêt confirmé. Aucun historique supprimé."
          : "Mode demandé : " + modeLabels[mode!] + ". Vérifie l'activité confirmée en haut.";
      }
    } catch {
      if (ticket === requestVersion) {
        await refresh();
        feedback.textContent = "Action non confirmée. Vérifie le mode affiché avant de réessayer.";
      }
    } finally {
      busy = false;
      updateButtons();
    }
  })();
}
for (const button of modeActions)
  button.addEventListener("click", () => {
    const mode = button.dataset.activity as Exclude<CurrentMode,null>;
    if (mode in modeLabels) requestMode(mode);
  });
toggle.addEventListener("click", () => {
  if (busy) return;
  const stopping = running;
  const ticket = ++requestVersion;
  busy = true;
  statusEl.dataset.state = "busy";
  statusEl.textContent = stopping ? "Arrêt en cours…" : "Démarrage automatique…";
  feedback.textContent = "Vérification des priorités et autorisations TNND…";
  updateButtons();
  void (async () => {
    try {
      const outcome = await send(stopping ? "TNND_UNIFIED_STOP" : "TNND_UNIFIED_START");
      if (ticket !== requestVersion) return;
      await refresh();
      if (!outcome.ok) applyFailure(outcome.reason, stopping, true);
      else feedback.textContent = stopping
        ? "Arrêt confirmé. Aucun historique supprimé."
        : "Démarrage demandé selon les priorités TNND Web.";
    } catch {
      await refresh();
      feedback.textContent = "Action non confirmée. Vérifie l'état réel du runner.";
    } finally {
      busy = false;
      updateButtons();
    }
  })();
});

// The Web app saves auth in sessionStorage, which is tab-scoped. Reuse the
// existing authenticated tab (and its exact localhost/127.0.0.1 origin).
// A brand-new tab cannot inherit credentials: explain that transparently.
// Extension-specific links (Connect / Options) keep their native navigation.
webSettingsLink.addEventListener("click", event => {
  const section = tnndWebSection(webSettingsLink.href);
  if (!section) return;
  event.preventDefault();
  void (async () => {
    try {
      const candidates = await chrome.tabs.query({
        url: ["http://localhost/*", "http://127.0.0.1/*"]
      });
      const tab = pickTnndWebTab(candidates, chrome.extension.inIncognitoContext);
      if (tab && typeof tab.id === "number" && tab.url) {
        await chrome.tabs.update(tab.id, {
          active: true, url: tnndWebTabUrl(tab.url, section)
        });
        if (typeof tab.windowId === "number") {
          await chrome.windows.update(tab.windowId, { focused: true });
        }
      } else {
        await chrome.tabs.create({ url: DEFAULT_TNND_WEB_ORIGIN + "/" + section });
        feedback.textContent =
          "Aucun onglet TNND Web déjà ouvert : nouvel onglet créé. Une connexion peut être nécessaire.";
      }
    } catch {
      feedback.textContent =
        "Impossible d'ouvrir l'onglet TNND Web existant. Réessaie sans fermer ta session actuelle.";
    }
  })();
});

renderDailyCounters([]);
void showBuildVersion();
void refresh();

export {};
