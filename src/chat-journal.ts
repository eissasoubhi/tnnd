import { createJournalExport } from "./chat-journal-export";

/** Dedicated read-only Chat log: no Tinder tab creation, no API calls,
 * no message text, no commands to Start/Stop or send.
 */
const KEY = "tnnd.globalExistingRunner.v2";
type Phase = "starting" | "checking" | "loading" | "incoming" | "waiting" |
  "generating" | "sending" | "sent" | "skipped" | "error" | "stopped";
interface LogEvent {
  at: string;
  phase: Phase;
  detail: string;
  conversation: string | null;
}
interface WatcherState {
  enabled?: boolean;
  mode?: "runner" | "watcher";
  phase?: Phase;
  phaseDetail?: string;
  currentLabel?: string | null;
  awaitingChatRef?: string | null;
  awaitingChatSince?: string | null;
  pendingReplies?: number;
  lastActionAt?: string | null;
  activity?: LogEvent[];
}
type Filter = "all" | "problems" | "sent";
const labels: Record<Phase, string> = {
  starting: "Démarrage", checking: "Vérification", loading: "Ouverture",
  incoming: "Message reçu", waiting: "En attente", generating: "Analyse IA",
  sending: "Envoi en cours", sent: "Envoyé", skipped: "Ignoré",
  error: "Erreur", stopped: "Arrêté"
};
const $ = (id: string): HTMLElement => {
  const node = document.getElementById(id);
  if (!node) throw new Error("Missing journal element " + id);
  return node;
};
const list = $("journalList") as HTMLOListElement;
const empty = $("emptyMessage");
const diagnosis = $("diagnosis");
const live = $("liveState");
const formatTime = (date: string): string => {
  const parsed = new Date(date);
  return Number.isFinite(parsed.valueOf())
    ? parsed.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    : "Heure inconnue";
};
const formatDate = (date: string): string => {
  const parsed = new Date(date);
  return Number.isFinite(parsed.valueOf())
    ? parsed.toLocaleDateString("fr-FR") : "";
};
const isEvent = (value: unknown): value is LogEvent => {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<LogEvent>;
  return typeof item.at === "string" && Number.isFinite(Date.parse(item.at)) &&
    typeof item.detail === "string" && typeof item.phase === "string" &&
    Object.prototype.hasOwnProperty.call(labels, item.phase) &&
    (item.conversation === null || typeof item.conversation === "string");
};
let filter: Filter = "all";
let latest: WatcherState | null = null;
function tone(phase: Phase): "danger" | "success" | "neutral" {
  if (phase === "error" || phase === "skipped") return "danger";
  if (phase === "sent") return "success";
  return "neutral";
}
function render(state: WatcherState | null): void {
  latest = state;
  const active = state?.enabled === true && state.mode === "watcher";
  live.dataset.state = active ? "running" : "stopped";
  live.textContent = active ? "Chat en surveillance" : "Chat arrêté / indisponible";
  $("currentConversation").textContent = state?.currentLabel || "—";
  $("currentDetail").textContent = state?.phaseDetail || "Aucun état enregistré.";
  $("pendingCount").textContent = typeof state?.pendingReplies === "number" &&
    Number.isSafeInteger(state.pendingReplies) ? String(state.pendingReplies) : "—";
  $("lastUpdate").textContent = "Dernière activité : " +
    (state?.lastActionAt ? formatTime(state.lastActionAt) : "—");
  const unconfirmed = /Analyse non confirmée après 30 s/i.test(state?.phaseDetail ?? "") ||
    (Array.isArray(state?.activity) &&
      state.activity.some(e => isEvent(e) && /Analyse non confirmée après 30 s/i.test(e.detail)));
  diagnosis.hidden = !unconfirmed;
  if (unconfirmed) diagnosis.textContent =
    "Diagnostic : TNND a ouvert au moins un chat sans recevoir de conclusion du moteur de réponse dans le délai prévu. " +
    "Cela ne prouve pas qu’un message a été envoyé ni que l’autorisation a été refusée. " +
    "Examine les événements « Analyse IA », « Ignoré » ou « Erreur » pour distinguer les causes.";
  list.replaceChildren();
  const entries = Array.isArray(state?.activity) ? state.activity.filter(isEvent).slice(-50).reverse() : [];
  const filtered = entries.filter(event => filter === "all" ||
    (filter === "problems" && (event.phase === "error" || event.phase === "skipped")) ||
    (filter === "sent" && (event.phase === "sent" || event.phase === "sending")));
  empty.hidden = filtered.length > 0;
  if (!filtered.length) empty.textContent = entries.length
    ? "Aucun événement dans ce filtre." : "Le journal Chat est vide. Démarre Auto depuis le popup TNND pour observer les actions.";
  for (const entry of filtered) {
    const item = document.createElement("li");
    item.className = "entry";
    item.dataset.tone = tone(entry.phase);
    const stamp = document.createElement("div");
    stamp.className = "stamp";
    const timestamp = document.createElement("time");
    timestamp.dateTime = entry.at;
    timestamp.textContent = formatTime(entry.at);
    const date = document.createElement("span");
    date.textContent = formatDate(entry.at);
    stamp.append(timestamp, date);
    const main = document.createElement("div");
    const who = document.createElement("span");
    who.className = "who";
    who.textContent = entry.conversation || "Moteur Chat";
    const badge = document.createElement("span");
    badge.className = "phase";
    badge.textContent = labels[entry.phase];
    const detail = document.createElement("p");
    detail.className = "message";
    detail.textContent = entry.detail.slice(0, 240);
    main.append(who, badge, detail);
    item.append(stamp, main);
    list.append(item);
  }
}
async function readLog(): Promise<void> {
  try {
    const raw = (await chrome.storage.local.get(KEY))[KEY] as WatcherState | undefined;
    render(raw && typeof raw === "object" ? raw : null);
  } catch {
    render(null);
    diagnosis.hidden = false;
    diagnosis.textContent = "Journal indisponible : vérifie que l’extension TNND est active, puis actualise.";
  }
}
document.querySelectorAll<HTMLButtonElement>("[data-filter]").forEach(button => {
  button.addEventListener("click", () => {
    filter = button.dataset.filter as Filter;
    document.querySelectorAll<HTMLButtonElement>("[data-filter]").forEach(item =>
      item.setAttribute("aria-pressed", String(item === button)));
    render(latest);
  });
});
/** Always export the complete latest 50 events, irrespective of the UI
 * filter, using a fresh storage read at click time (not a stale render).
 * This performs no network request, page action, or write to TNND state.
 */
const downloadButton = $("downloadChatJournal") as HTMLButtonElement;
downloadButton.addEventListener("click", () => {
  if (downloadButton.disabled) return;
  downloadButton.disabled = true;
  const feedback = $("downloadFeedback");
  feedback.textContent = "Préparation du fichier…";
  void (async () => {
    const raw = (await chrome.storage.local.get(KEY))[KEY] as unknown;
    const version = chrome.runtime.getManifest().version;
    const exported = createJournalExport(raw, version);
    const blob = new Blob([JSON.stringify(exported, null, 2) + "\n"], {
      type: "application/json;charset=utf-8"
    });
    const downloadUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.download = "tnnd-chat-journal-" +
      exported.exportedAt.replace(/[:.]/g, "-") + ".json";
    link.hidden = true;
    document.body.appendChild(link);
    try {
      link.click();
      feedback.textContent = `Journal exporté : ${exported.events.length} événements, version ${version}.`;
    } finally {
      link.remove();
      // Do not revoke synchronously: Chrome must have time to start the
      // download after the user-initiated anchor click.
      window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 30_000);
    }
  })().catch(() => {
    feedback.textContent = "Échec du téléchargement : vérifie les permissions Chrome et réessaie.";
  }).finally(() => { downloadButton.disabled = false; });
});
$("refresh").addEventListener("click", () => void readLog());
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && Object.prototype.hasOwnProperty.call(changes, KEY))
    void readLog();
});
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) void readLog();
});
void readLog();
