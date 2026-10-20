import { explainLauncherStartRefusal } from "./unified-launcher-failure";
/** Single-entry TNND popup. No activity-specific controls or account data.
 * This UI never dispatches Likes or messages. All actions go through the
 * service-worker orchestrator, which owns authorization and priority checks.
 */
type CurrentMode = "swipe" | "active-chat" | "new-match" | null;
type ReachedLimit = { id: "swipe-attempts" | "swipe-sessions"; label: string;
  used: number; max: number; dayKey: string };
type Status = { ok: boolean; running?: boolean; mode?: CurrentMode; reason?: string;
  quotaPaused?: boolean; reachedLimits?: ReachedLimit[] };
type Command = "TNND_UNIFIED_STATUS" | "TNND_UNIFIED_START" | "TNND_UNIFIED_STOP";
const toggle = document.getElementById("toggleAutomation") as HTMLButtonElement;
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

function renderReachedLimits(limits: ReachedLimit[] | undefined): void {
  if (!Array.isArray(limits)) return; // A command reply without a status snapshot is not quota evidence.
  limitsList.replaceChildren();
  const accepted = limits.filter(item =>
    (item.id === "swipe-attempts" || item.id === "swipe-sessions") &&
    typeof item.label === "string" && item.label.length <= 80 &&
    Number.isSafeInteger(item.used) && Number.isSafeInteger(item.max) &&
    item.max > 0 && item.used >= item.max && /^\\d{4}-\\d{2}-\\d{2}$/.test(item.dayKey));
  for (const item of accepted) {
    const row = document.createElement("li");
    const label = document.createElement("span");
    label.textContent = item.label;
    const numbers = document.createElement("strong");
    numbers.className = "limit-count";
    numbers.textContent = item.used + " / " + item.max;
    row.append(label, numbers);
    limitsList.append(row);
  }
  limitsSection.hidden = accepted.length === 0;
  limitsNote.textContent = accepted.length
    ? "Journée du " + accepted[0].dayKey +
      " · Tentatives comptées par TNND, sans preuve d'acceptation Tinder."
    : "";
}
let busy = false;
let running = false;
let requestVersion = 0;

function render(value: Status, detail = ""): void {
  renderReachedLimits(value.reachedLimits);
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
  feedback.textContent = detail || (value.ok ? value.reason ?? "" :
    "Impossible de lire l'état du moteur. Recharge l'extension.");
  if (!detail) {
    webSettingsLink.href = "http://localhost:5173/#workspace-settings-section";
    webSettingsLink.textContent = "Configuration dans TNND Web";
  }
}
async function send(type: Command): Promise<Status> {
  const response = await chrome.runtime.sendMessage({ type }) as Status | undefined;
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
            webSettingsLink.href = "http://localhost:5173/#smart-swipe-activity";
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
    }
  })();
});
void showBuildVersion();
void refresh();

export {};
