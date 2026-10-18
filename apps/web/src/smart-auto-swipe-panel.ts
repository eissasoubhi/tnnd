import { readSession } from "./auth-client";
import { parseSmartSwipeHistory, parseSmartSwipeSummary, remainingSmartSwipeAttempts } from "./smart-swipe-dashboard-model";

type Activity = "swipe" | "new-match" | "active-chat";
interface Settings {
  enabled: boolean;
  sessionsPerDay: number;
  sessionDurationMinSeconds: number;
  sessionDurationMaxSeconds: number;
  swipeDelayMinSeconds: number;
  swipeDelayMaxSeconds: number;
  maxRightSwipesPerDay: number;
  priority: Activity[];
  pauseSwipeDuringActiveConversation: boolean;
  maxActiveChatSecondsPerConversationPerDay: number | null;
  timeZone: string;
}
interface SettingsResponse {
  settings: Settings;
  updatedAt: string | null;
  liveExecutionAvailable: false;
  unavailableReason: "runtime_not_implemented";
}
const endpoint = (
  (import.meta.env.VITE_TNND_API_BASE_URL as string | undefined)?.replace(/\/$/, "")
    ?? "http://127.0.0.1:4000"
) + "/api/v1/automation/smart-swipe";
const labels: Record<Activity, string> = {
  swipe: "Auto Swipe",
  "new-match": "New matches",
  "active-chat": "Active conversations"
};
let priorities: Activity[] = ["swipe", "new-match", "active-chat"];

const root = document.querySelector("#conversation-workspace");
const panel = document.createElement("article");
panel.id = "smart-auto-swipe-panel";
panel.className = "panel panel-wide";
panel.innerHTML = [
  '<div class="panel-heading"><div>',
  '<p class="eyebrow">Automation preferences</p>',
  '<h2>Smart Auto Swipe</h2>',
  '<p class="subtle">Automatic mode only. Gender, age, distance and discovery filters stay in Tinder.</p>',
  '</div><span class="pill" id="smart-swipe-state">Not loaded</span></div>',
  '<p id="smart-swipe-notice" class="subtle" role="status" aria-live="polite"></p>',
  '<section id="smart-swipe-activity" class="dating-goal-editor" aria-labelledby="smart-swipe-activity-title">',
  '<h3 id="smart-swipe-activity-title">Today and recent attempts</h3>',
  '<p class="subtle">Counts come from the TNND server. A card change does not confirm that Tinder accepted a Like. Open the extension popup for the current scheduler and runner state.</p>',
  '<p id="smart-swipe-ledger-status" role="status" aria-live="polite">Not loaded</p>',
  '<div id="smart-swipe-ledger-totals" class="preferences-grid"></div>',
  '<details><summary>Recent attempts</summary><ol id="smart-swipe-ledger-history"></ol></details>',
  '<button id="smart-swipe-ledger-refresh" type="button" class="secondary">Refresh activity</button>',
  '</section>',
  '<form id="smart-swipe-form" class="preferences-grid">',
  '<label><input id="smart-swipe-enabled" type="checkbox"> Request automatic scheduling</label>',
  '<div class="dating-goal-editor"><h3>Daily sessions</h3><div class="preferences-grid">',
  '<label>Sessions per day<input id="smart-swipe-sessions" type="number" min="1" max="24" step="1" required></label>',
  '<label>Right Likes per day<input id="smart-swipe-likes" type="number" min="1" max="1000" step="1" required></label>',
  '<label>Session duration min (minutes)<input id="smart-swipe-minutes-min" type="number" min="1" max="1440" step="1" required></label>',
  '<label>Session duration max (minutes)<input id="smart-swipe-minutes-max" type="number" min="1" max="1440" step="1" required></label>',
  '<label>Delay min between Likes (seconds)<input id="smart-swipe-delay-min" type="number" min="1" max="3600" step="1" required></label>',
  '<label>Delay max between Likes (seconds)<input id="smart-swipe-delay-max" type="number" min="1" max="3600" step="1" required></label>',
  '</div><p class="subtle">One session duration is selected between min and max for each session. Each delay is selected between its limits.</p></div>',
  '<div class="dating-goal-editor"><h3>Activity priority</h3>',
  '<p class="subtle">Higher priority work runs first when eligible. Active work is never interrupted mid-send.</p>',
  '<div id="smart-swipe-priority" role="group" aria-label="Activity priority"></div>',
  '</div>',
  '<div class="dating-goal-editor"><h3>Conversation time budget</h3>',
  '<label>Per-conversation daily limit<select id="smart-swipe-chat-mode">',
  '<option value="unlimited">Unlimited (default)</option>',
  '<option value="limited">Limited per conversation</option></select></label>',
  '<label id="smart-swipe-chat-time-wrap" hidden>Minutes per conversation per day',
  '<input id="smart-swipe-chat-time" type="number" min="1" max="1440" step="1" value="30"></label>',
  '<p class="subtle">Only active handling time counts, across all visits to one chat.</p></div>',
  '<label><input id="smart-swipe-pause-chat" type="checkbox"> Pause swiping during an active conversation</label>',
  '<div class="preferences-save-bar"><div class="preferences-save-message">',
  '<strong>Save scheduling preferences</strong>',
  '<p class="subtle">Saving never sends a Like or starts Tinder automation.</p>',
  '<p id="smart-swipe-feedback" class="subtle" role="status" aria-live="polite"></p>',
  '</div><button id="smart-swipe-save" type="submit">Save settings</button></div>',
  '</form>'
].join("");
root?.append(panel);

const get = <T extends Element>(id: string): T => {
  const node = panel.querySelector<T>("#" + id);
  if (!node) throw new Error("Missing Smart Swipe control: " + id);
  return node;
};
const form = get<HTMLFormElement>("smart-swipe-form");
const status = get<HTMLElement>("smart-swipe-state");
const notice = get<HTMLElement>("smart-swipe-notice");
const feedback = get<HTMLElement>("smart-swipe-feedback");
const save = get<HTMLButtonElement>("smart-swipe-save");
const priorityList = get<HTMLElement>("smart-swipe-priority");
const chatMode = get<HTMLSelectElement>("smart-swipe-chat-mode");
const chatWrap = get<HTMLElement>("smart-swipe-chat-time-wrap");
const activity = get<HTMLElement>("smart-swipe-activity");
const ledgerStatus = get<HTMLElement>("smart-swipe-ledger-status");
const ledgerTotals = get<HTMLElement>("smart-swipe-ledger-totals");
const ledgerHistory = get<HTMLOListElement>("smart-swipe-ledger-history");
const ledgerRefresh = get<HTMLButtonElement>("smart-swipe-ledger-refresh");
let loadedForUser: string | null = null;
let requestSerial = 0;
let activitySerial = 0;
let loadedSettings: Settings | null = null;

async function refreshActivity(): Promise<void> {
  const session = readSession();
  const serial = ++activitySerial;
  if (!session || session.user.id !== loadedForUser || !loadedSettings) return;
  ledgerStatus.textContent = "Loading server activity…";
  ledgerTotals.replaceChildren();
  ledgerHistory.replaceChildren();
  ledgerRefresh.disabled = true;
  try {
    const headers = { authorization: "Bearer " + session.token };
    const [summaryResponse, historyResponse] = await Promise.all([
      fetch(endpoint + "/attempts/summary", { headers, cache: "no-store" }),
      fetch(endpoint + "/attempts/history", { headers, cache: "no-store" })
    ]);
    if (!summaryResponse.ok || !historyResponse.ok) throw new Error("Server activity is unavailable. Refresh to try again.");
    const summary = parseSmartSwipeSummary(await summaryResponse.json());
    const history = parseSmartSwipeHistory(await historyResponse.json());
    if (!summary || !history) throw new Error("Server activity is invalid. Refresh to try again.");
    if (serial !== activitySerial || readSession()?.user.id !== session.user.id) return;
    const remaining = remainingSmartSwipeAttempts(summary, loadedSettings.maxRightSwipesPerDay);
    const totals = [
      ["Account day", summary.dayKey + " (" + loadedSettings.timeZone + ")"],
      ["Attempt slots used", String(summary.attemptsToday) + " / " + loadedSettings.maxRightSwipesPerDay],
      ["Attempt slots remaining", remaining === null ? "Unavailable" : String(remaining)],
      ["Card transitions observed", String(summary.uiObservedToday)],
      ["Unresolved across days", String(summary.unresolvedAttempts)]
    ];
    for (const [label, value] of totals) {
      const item = document.createElement("p");
      item.className = "subtle";
      const heading = document.createElement("strong");
      heading.textContent = label + ": ";
      item.append(heading, document.createTextNode(value));
      ledgerTotals.append(item);
    }
    for (const attempt of history) {
      const item = document.createElement("li");
      const time = document.createElement("time");
      time.dateTime = attempt.createdAt;
      time.textContent = new Date(attempt.createdAt).toLocaleString();
      const label = attempt.status === "ui_observed" ? "Card change observed — Tinder acceptance unverified"
        : attempt.status === "uncertain" ? "Uncertain — automatic Likes stopped"
          : "Reserved — outcome pending";
      item.append(time, document.createTextNode(" · " + label + " · account day " + attempt.dayKey));
      ledgerHistory.append(item);
    }
    if (!history.length) {
      const empty = document.createElement("li");
      empty.textContent = "No attempts recorded yet.";
      ledgerHistory.append(empty);
    }
    ledgerStatus.textContent = summary.unresolvedAttempts > 0
      ? "Action required: unresolved attempts block further automatic Likes. Inspect the extension and Tinder before any new run."
      : "Server activity loaded. Tinder acceptance is not independently verified.";
  } catch (error) {
    if (serial === activitySerial) ledgerStatus.textContent = error instanceof Error
      ? error.message : "Server activity is unavailable. Refresh to try again.";
  } finally {
    if (serial === activitySerial) ledgerRefresh.disabled = false;
  }
}
ledgerRefresh.addEventListener("click", () => { void refreshActivity(); });

function renderPriority(): void {
  priorityList.replaceChildren();
  priorities.forEach((value, index) => {
    const row = document.createElement("div");
    row.className = "preferences-save-bar";
    const name = document.createElement("span");
    name.textContent = String(index + 1) + ". " + labels[value];
    row.append(name);
    const buttons = document.createElement("span");
    for (const direction of [-1, 1]) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "secondary";
      button.textContent = direction < 0 ? "↑" : "↓";
      button.setAttribute("aria-label", "Move " + labels[value] +
        (direction < 0 ? " higher" : " lower"));
      button.disabled = index + direction < 0 || index + direction >= priorities.length;
      button.addEventListener("click", () => {
        const next = [...priorities];
        [next[index], next[index + direction]] = [next[index + direction], next[index]];
        priorities = next;
        renderPriority();
      });
      buttons.append(button);
    }
    row.append(buttons);
    priorityList.append(row);
  });
}

function input(id: string): HTMLInputElement { return get<HTMLInputElement>(id); }
function number(id: string): number { return Number(input(id).value); }
function fill(settings: Settings): void {
  input("smart-swipe-enabled").checked = settings.enabled;
  input("smart-swipe-sessions").value = String(settings.sessionsPerDay);
  input("smart-swipe-likes").value = String(settings.maxRightSwipesPerDay);
  input("smart-swipe-minutes-min").value = String(settings.sessionDurationMinSeconds / 60);
  input("smart-swipe-minutes-max").value = String(settings.sessionDurationMaxSeconds / 60);
  input("smart-swipe-delay-min").value = String(settings.swipeDelayMinSeconds);
  input("smart-swipe-delay-max").value = String(settings.swipeDelayMaxSeconds);
  input("smart-swipe-pause-chat").checked = settings.pauseSwipeDuringActiveConversation;
  chatMode.value = settings.maxActiveChatSecondsPerConversationPerDay === null ? "unlimited" : "limited";
  input("smart-swipe-chat-time").value = String((settings.maxActiveChatSecondsPerConversationPerDay ?? 1800) / 60);
  chatWrap.hidden = chatMode.value !== "limited";
  priorities = [...settings.priority];
  renderPriority();
}
chatMode.addEventListener("change", () => {
  chatWrap.hidden = chatMode.value !== "limited";
});

function values(): Settings {
  const min = number("smart-swipe-minutes-min");
  const max = number("smart-swipe-minutes-max");
  const delayMin = number("smart-swipe-delay-min");
  const delayMax = number("smart-swipe-delay-max");
  if (!Number.isInteger(min) || !Number.isInteger(max) || min > max)
    throw new Error("Session duration: minimum cannot exceed maximum.");
  if (!Number.isInteger(delayMin) || !Number.isInteger(delayMax) || delayMin > delayMax)
    throw new Error("Delay: minimum cannot exceed maximum.");
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  return {
    enabled: input("smart-swipe-enabled").checked,
    sessionsPerDay: number("smart-swipe-sessions"),
    sessionDurationMinSeconds: min * 60,
    sessionDurationMaxSeconds: max * 60,
    swipeDelayMinSeconds: delayMin,
    swipeDelayMaxSeconds: delayMax,
    maxRightSwipesPerDay: number("smart-swipe-likes"),
    priority: [...priorities],
    pauseSwipeDuringActiveConversation: input("smart-swipe-pause-chat").checked,
    maxActiveChatSecondsPerConversationPerDay:
      chatMode.value === "unlimited" ? null : number("smart-swipe-chat-time") * 60,
    timeZone
  };
}

async function refresh(): Promise<void> {
  const session = readSession();
  const requestId = ++requestSerial;
  loadedForUser = null;
  loadedSettings = null;
  ++activitySerial;
  form.hidden = !session;
  activity.hidden = !session;
  if (!session) {
    notice.textContent = "Sign in to configure Smart Auto Swipe.";
    status.textContent = "Sign-in required";
    return;
  }
  notice.textContent = "Loading scheduling preferences…";
  status.textContent = "Loading";
  save.disabled = true;
  try {
    const response = await fetch(endpoint, {
      headers: { authorization: "Bearer " + session.token },
      cache: "no-store"
    });
    const result = await response.json() as SettingsResponse & { error?: string };
    if (!response.ok || !result.settings) throw new Error(result.error || "Unable to load settings.");
    if (requestId !== requestSerial || readSession()?.user.id !== session.user.id) return;
    loadedForUser = session.user.id;
    loadedSettings = result.settings;
    fill(result.settings);
    status.textContent = result.settings.enabled ? "Configured · browser verification pending" : "Disabled";
    notice.textContent = "Saving settings does not start a Tinder action. Use the extension popup to inspect the current runner and stop it. Signed-in browser behavior still needs verification.";
    void refreshActivity();
  } catch (error) {
    if (requestId !== requestSerial) return;
    notice.textContent = error instanceof Error ? error.message : "Connection error. Sign in and retry.";
    status.textContent = "Unavailable";
  } finally {
    if (requestId === requestSerial) save.disabled = loadedForUser === null;
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const session = readSession();
  if (!session || session.user.id !== loadedForUser || !form.reportValidity()) return;
  save.disabled = true;
  feedback.textContent = "Saving…";
  try {
    const data = values();
    const response = await fetch(endpoint, {
      method: "PUT",
      headers: { authorization: "Bearer " + session.token, "content-type": "application/json" },
      body: JSON.stringify({ settings: data })
    });
    const result = await response.json() as SettingsResponse & { error?: string; details?: string[] };
    if (!response.ok || !result.settings)
      throw new Error(result.details?.join(", ") || result.error || "Unable to save.");
    if (readSession()?.user.id !== session.user.id) return;
    fill(result.settings);
    loadedSettings = result.settings;
    status.textContent = result.settings.enabled ? "Configured · browser verification pending" : "Disabled";
    feedback.textContent = "Preferences saved to TNND. No Tinder action was started.";
    void refreshActivity();
  } catch (error) {
    feedback.textContent = error instanceof Error ? error.message : "Unable to save. Try again.";
  } finally {
    save.disabled = readSession()?.user.id !== loadedForUser;
  }
});
window.addEventListener("tnnd:auth-session-changed", () => { void refresh(); });
void refresh();
