/** Single-entry TNND popup. No activity-specific controls or account data.
 * This UI never dispatches Likes or messages. All actions go through the
 * service-worker orchestrator, which owns authorization and priority checks.
 */
type CurrentMode = "swipe" | "active-chat" | "new-match" | null;
type Status = { ok: boolean; running?: boolean; mode?: CurrentMode; reason?: string };
type Command = "TNND_UNIFIED_STATUS" | "TNND_UNIFIED_START" | "TNND_UNIFIED_STOP";
const toggle = document.getElementById("toggleAutomation") as HTMLButtonElement;
const statusEl = document.getElementById("engineStatus") as HTMLElement;
const feedback = document.getElementById("feedback") as HTMLElement;
const version = document.getElementById("version") as HTMLElement;
version.textContent = "v" + chrome.runtime.getManifest().version;
let busy = false;
let running = false;
let requestVersion = 0;

function render(value: Status, detail = ""): void {
  running = value.running === true;
  statusEl.dataset.state = !value.ok ? "error" : running ? "running" : "stopped";
  statusEl.textContent = !value.ok ? "Connexion indisponible" :
    !running ? "Arrêté" :
      value.mode === "swipe" ? "Actif · Auto Swipe" :
      value.mode === "new-match" ? "Actif · Nouveaux matchs" :
      value.mode === "active-chat" ? "Actif · Conversations" : "Actif";
  toggle.textContent = running ? "Arrêter" : "Démarrer";
  toggle.dataset.mode = running ? "stop" : "start";
  toggle.disabled = busy || !value.ok;
  feedback.textContent = detail || (value.ok ? value.reason ?? "" :
    "Impossible de lire l'état du moteur. Recharge l'extension.");
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
        feedback.textContent = (intent === "TNND_UNIFIED_START" ? "Démarrage refusé : " : "Arrêt non confirmé : ") +
          (result.reason ?? "commande non confirmée");
        return;
      }
      render(result, intent === "TNND_UNIFIED_START"
        ? "Démarrage confirmé. Prochaine activité selon les priorités Web."
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
void refresh();

export {};
