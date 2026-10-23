import { explainLauncherStartRefusal } from "./unified-launcher-failure";
import {
  DEFAULT_TNND_WEB_ORIGIN, pickTnndWebTab, tnndWebSection, tnndWebTabUrl
} from "./tnnd-web-tab-navigation";
/** Single-entry TNND popup. No activity-specific controls or account data.
 * This UI never dispatches Likes or messages. All actions go through the
 * service-worker orchestrator, which owns authorization and priority checks.
 */
type CurrentMode = "swipe" | "active-chat" | "new-match" | null;
type ReachedLimit = { id: "swipe-attempts" | "swipe-sessions"; label: string;
  used: number; max: number; dayKey: string };
type DailyCounter = { id: ReachedLimit["id"]; label: string;
  used: number | null; max: number | null; dayKey: string | null; reached: boolean };
type Status = { ok: boolean; running?: boolean; mode?: CurrentMode; manualMode?: CurrentMode; reason?: string;
  quotaPaused?: boolean; reachedLimits?: ReachedLimit[]; limitCounters?: DailyCounter[] };
type Command = "TNND_UNIFIED_STATUS" | "TNND_UNIFIED_START" | "TNND_UNIFIED_STOP" | "TNND_UNIFIED_SELECT_MODE";
const toggle = document.getElementById("toggleAutomation") as HTMLButtonElement;
const modeButtons = Array.from(document.querySelectorAll<HTMLButtonElement>(".mode-button"));
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
let requestVersion = 0;

function render(value: Status, detail = ""): void {
  if (Array.isArray(value.limitCounters)) renderDailyCounters(value.limitCounters);
  else if (!value.ok) renderDailyCounters([]);
  running = value.running === true;
  const pausedForQuota = running && value.quotaPaused === true;
  statusEl.dataset.state = !value.ok ? "error" :
    pausedForQuota ? "paused" : running ? "running" : "stopped";
  statusEl.textContent = !value.ok ? "Connexion indisponible" :
    !running ? "Arrêté" :
      pausedForQuota ? "En pause · Quota Swipe atteint" :
      value.mode === "swipe" ? "Actif · Auto Swipe" :
      value.mode === "new-match" ? "Actif · Nouveaux matchs" :
      value.mode === "active-chat" ? "Actif · Conversations" : "Actif";
  toggle.textContent = running ? "Arrêter" : "Démarrer";
  toggle.dataset.mode = running ? "stop" : "start";
  toggle.disabled = busy || !value.ok;
  for (const button of modeButtons) {
    const selected = running && button.dataset.activity === value.mode;
    button.setAttribute("aria-pressed", String(selected));
    button.disabled = busy || !value.ok;
  }
  feedback.textContent = detail || (value.ok ? value.reason ?? "" :
    "Impossible de lire l'état du moteur. Recharge l'extension.");
  if (!detail) {
    webSettingsLink.href = DEFAULT_TNND_WEB_ORIGIN + "/#workspace-settings-section";
    webSettingsLink.textContent = "Configuration dans TNND Web";
  }
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
toggle.addEventListener("click", () => {
  if (busy) return;
  busy = true;
  const intent = running ? "TNND_UNIFIED_STOP" : "TNND_UNIFIED_START";
  const ticket = ++requestVersion;
  toggle.disabled = true;
  statusEl.dataset.state = "busy";
  statusEl.textContent = intent === "TNND_UNIFIED_STOP" ? "Arrêt en cours…" : "Démarrage en cours…";
  feedback.textContent = "Vérification de l'état et des priorités Web…";
  void (async () => {
    try {
      const result = await send(intent);
      if (ticket !== requestVersion) return;
      if (!result.ok) {
        // Failed Start must never be described as running. Failed Stop must
        // never be described as successfully stopped; read actual ownership.
        await refresh();
        if (intent === "TNND_UNIFIED_START") {
          const guidance = explainLauncherStartRefusal(result.reason);
          feedback.textContent = guidance.message;
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
        } else {
          feedback.textContent = "Arrêt non confirmé : " + (result.reason ?? "commande non confirmée");
        }
        return;
      }
      render(result, intent === "TNND_UNIFIED_START"
        ? (result.reason ?? "Démarrage confirmé. Prochaine activité selon les priorités Web.")
        : "Arrêt confirmé. Aucune tentative historique supprimée.");
    } catch {
      if (ticket === requestVersion) {
        await refresh();
        feedback.textContent = "Commande non confirmée. Vérifie l'état avant de recommencer.";
      }
    } finally {
      busy = false;
      // refresh() increments requestVersion. After a refused Start, the new
      // status poll must NOT leave the only button permanently disabled.
      toggle.disabled = statusEl.dataset.state === "error";
      for (const button of modeButtons) button.disabled = statusEl.dataset.state === "error";
    }
  })();
});
/** One explicit click requests an exclusive transition from the controller.
 * Status after a refusal remains authoritative; do not optimistically select.
 */
for (const button of modeButtons) {
  button.addEventListener("click", () => {
    const mode = button.dataset.activity as Exclude<CurrentMode, null>;
    if (busy || !(mode in modeLabels)) return;
    busy = true;
    const ticket = ++requestVersion;
    toggle.disabled = true;
    for (const control of modeButtons) control.disabled = true;
    statusEl.dataset.state = "busy";
    statusEl.textContent = "Bascule vers " + modeLabels[mode] + "…";
    feedback.textContent = "Vérification des autorisations et des opérations en cours…";
    void (async () => {
      try {
        const result = await send("TNND_UNIFIED_SELECT_MODE", mode);
        if (ticket !== requestVersion) return;
        if (!result.ok) {
          await refresh();
          const guidance = explainLauncherStartRefusal(result.reason);
          feedback.textContent = guidance.reviewAttempts || guidance.connectAccount ||
            guidance.extensionSettings
            ? guidance.message
            : "Bascule refusée : " + (result.reason ?? "état non confirmé") +
              ". Vérifie le mode affiché avant de réessayer.";
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
          return;
        }
        render(result, result.reason || "Mode " + modeLabels[mode] +
          " activé. Les quotas et autorisations restent applicables.");
      } catch {
        if (ticket === requestVersion) {
          await refresh();
          feedback.textContent = "Bascule non confirmée. Vérifie le mode affiché avant de réessayer.";
        }
      } finally {
        busy = false;
        toggle.disabled = statusEl.dataset.state === "error";
        for (const control of modeButtons) control.disabled = statusEl.dataset.state === "error";
      }
    })();
  });
}

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
