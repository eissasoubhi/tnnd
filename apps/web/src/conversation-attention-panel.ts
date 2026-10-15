import { readSession } from "./auth-client";
import { listConversations } from "./conversation-client";
import { listConversationManagement } from "./conversation-management-client";
import { ATTENTION_CAP_CHOICES, buildAttentionRows, parseAttentionState, validCap,
  type AttentionWireState } from "./conversation-attention-model";

const root = document.getElementById("conversation-workspace");
const panel = document.createElement("article");
panel.className = "panel panel-wide attention-dashboard";
panel.id = "conversation-attention-panel";
panel.innerHTML = `
  <div class="panel-heading">
    <div><p class="eyebrow">Conversation intelligence</p><h2>Live chat attention</h2>
      <p class="subtle">Estimated from observed reply timing, not Tinder online presence. No automatic messages are sent from this page.</p>
    </div>
    <span class="pill" id="attention-connection">Checking extension…</span>
  </div>
  <div class="attention-top">
    <section class="attention-summary" aria-label="Attention totals">
      <div><small>Chats with observations</small><strong id="attention-known">—</strong></div>
      <div><small>Currently focused</small><strong id="attention-focused">—</strong></div>
      <div><small>Global attention ceiling</small><strong id="attention-current-cap">—</strong></div>
    </section>
    <form id="attention-cap-form" class="attention-settings">
      <h3>Maximum wait after a message</h3>
      <p class="subtle">This ceiling applies to the live watcher, not the delay before sending a reply. Cold chats stay brief.</p>
      <label for="attention-cap">Focus ceiling
        <select id="attention-cap" required aria-describedby="attention-cap-help">
          ${ATTENTION_CAP_CHOICES.map(n => `<option value="${n}"${n === 180 ? " selected" : ""}>${n >= 60 ? (n / 60) + " min" : n + " sec"}</option>`).join("")}
        </select>
      </label>
      <p id="attention-cap-help" class="subtle">Default: 3 minutes. A shorter limit takes effect at the next watcher check; increases apply to new reply events.</p>
      <div class="attention-form-actions"><button type="submit" id="attention-save">Save ceiling</button>
        <span id="attention-save-status" role="status" aria-live="polite"></span></div>
    </form>
  </div>
  <div class="attention-list-head"><div><h3>Conversation activity</h3>
      <p class="subtle">Scores fade with inactivity. “Not observed” means there is no measured activity, not a score of zero.</p></div>
    <button type="button" class="secondary" id="attention-refresh">Refresh</button></div>
  <p class="subtle" id="attention-dashboard-status" role="status" aria-live="polite">Connecting to the TNND extension…</p>
  <div id="attention-rows" class="attention-rows" aria-label="Activity by conversation"></div>
`;
root?.append(panel);

const connection = panel.querySelector<HTMLElement>("#attention-connection")!;
const status = panel.querySelector<HTMLElement>("#attention-dashboard-status")!;
const rowsEl = panel.querySelector<HTMLElement>("#attention-rows")!;
const currentCap = panel.querySelector<HTMLElement>("#attention-current-cap")!;
const known = panel.querySelector<HTMLElement>("#attention-known")!;
const focused = panel.querySelector<HTMLElement>("#attention-focused")!;
const select = panel.querySelector<HTMLSelectElement>("#attention-cap")!;
const saveButton = panel.querySelector<HTMLButtonElement>("#attention-save")!;
const saveStatus = panel.querySelector<HTMLElement>("#attention-save-status")!;
const stateChannel = "TNND_ATTENTION_WEB_REQUEST_V1";
const responseChannel = "TNND_ATTENTION_WEB_RESPONSE_V1";
type BridgeResult = { ok?: boolean; error?: string; capSeconds?: unknown;
  watcherActive?: unknown; observed?: unknown;
  activeConversationRef?: unknown; activeConversationUntil?: unknown };
let display: AttentionWireState | null = null;
let names = new Map<string, string>();
let namesForUser = "";
let lastNameLoadAt = 0;
let activeUser = "";
let inFlight = false;
let saving = false;
const requests = new Map<string, { userId: string; resolve: (result: BridgeResult | null) => void; timer: number }>();

const formatCap = (seconds: number): string => seconds < 60 ? seconds + " sec"
  : Number.isInteger(seconds / 60) ? (seconds / 60) + " min" : seconds + " sec";
const formatTime = (value: string): string => new Date(value).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"});

window.addEventListener("message", event => {
  if (event.source !== window || event.origin !== window.location.origin) return;
  const payload = event.data as { source?: string; requestId?: string; result?: BridgeResult } | null;
  if (!payload || payload.source !== responseChannel || typeof payload.requestId !== "string") return;
  const request = requests.get(payload.requestId);
  if (!request) return;
  window.clearTimeout(request.timer);
  requests.delete(payload.requestId);
  request.resolve(readSession()?.user.id === request.userId ? payload.result ?? null : null);
});

function requestExtension(action: "read" | "save", userId: string, capSeconds?: number): Promise<BridgeResult | null> {
  const requestId = crypto.randomUUID();
  return new Promise(resolve => {
    const timer = window.setTimeout(() => {
      requests.delete(requestId);
      resolve(null);
    }, 4000);
    requests.set(requestId, {userId, timer, resolve});
    window.postMessage({ source: stateChannel, requestId, action, userId,
      ...(action === "save" ? { capSeconds } : {}) }, window.location.origin);
  });
}

function render(): void {
  if (!readSession() || !display) {
    rowsEl.replaceChildren();
    known.textContent = "—";
    focused.textContent = "—";
    currentCap.textContent = "—";
    select.disabled = true;
    saveButton.disabled = true;
    return;
  }
  select.disabled = false;
  saveButton.disabled = saving;
  currentCap.textContent = formatCap(display.capSeconds);
  if (document.activeElement !== select && !saving) select.value = String(display.capSeconds);
  const rows = buildAttentionRows(display, names);
  known.textContent = display.watcherActive
    ? String(rows.filter(row => row.score !== null).length) : "—";
  const selected = rows.find(row => row.remainingSeconds !== null && row.remainingSeconds > 0);
  focused.textContent = selected ? selected.name : "None";
  rowsEl.replaceChildren();
  if (!rows.length) {
    const empty = document.createElement("p");
    empty.className = "attention-empty";
    empty.textContent = "No synchronized conversations to display. Sync your Tinder conversations and try again.";
    rowsEl.append(empty);
    return;
  }
  for (const row of rows) {
    const item = document.createElement("div");
    item.className = "attention-row";
    const identity = document.createElement("div");
    identity.className = "attention-identity";
    const name = document.createElement("strong");
    name.textContent = row.name;
    const when = document.createElement("small");
    when.textContent = row.lastObservedAt
      ? "Last observed " + formatTime(row.lastObservedAt)
      : "No reply timing observed";
    identity.append(name, when);
    const stats = document.createElement("div");
    stats.className = "attention-score";
    const label = document.createElement("strong");
    label.textContent = row.score === null ? "—" : row.score + "/100";
    const stage = document.createElement("span");
    stage.className = "attention-stage";
    stage.dataset.stage = row.stage;
    const namesByStage: Record<typeof row.stage, string> = {
      cold:"Cold", reconnecting:"Reconnecting", active:"Active", "very-active":"Very active", "not-observed":"Not observed"
    };
    stage.textContent = namesByStage[row.stage];
    stats.append(label, stage);
    const timing = document.createElement("div");
    timing.className = "attention-time";
    const wait = document.createElement("strong");
    wait.textContent = row.waitSeconds === null ? "—" : formatCap(row.waitSeconds);
    const detail = document.createElement("small");
    detail.textContent = row.remainingSeconds !== null && row.remainingSeconds > 0
      ? row.remainingSeconds + " sec focus left" : row.score === null
        ? "Awaiting observation" : "Suggested max wait · not online status";
    timing.append(wait, detail);
    item.append(identity, stats, timing);
    rowsEl.append(item);
  }
}

async function loadNames(userId: string): Promise<void> {
  const session = readSession();
  if (!session || session.user.id !== userId) return;
  if (namesForUser === userId && Date.now() - lastNameLoadAt < 90_000) return;
  const [items, management] = await Promise.all([
    listConversations(session), listConversationManagement(session)
  ]);
  if (readSession()?.user.id !== userId) return;
  const labels = new Map(items.map(item => [item.id, item.displayName]));
  names = new Map(management.filter(item => !!labels.get(item.conversationId))
    .map(item => [item.externalThreadId, labels.get(item.conversationId)!]));
  namesForUser = userId;
  lastNameLoadAt = Date.now();
}

async function refresh(): Promise<void> {
  if (inFlight || saving || panel.closest<HTMLElement>(".workspace-section")?.hidden) return;
  const session = readSession();
  if (!session) {
    activeUser = "";
    namesForUser = "";
    names = new Map();
    display = null;
    connection.textContent = "Sign in required";
    status.textContent = "Sign in to TNND to see activity for your own conversations.";
    render();
    return;
  }
  if (activeUser !== session.user.id) {
    activeUser = session.user.id;
    namesForUser = "";
    names = new Map();
    display = null;
  }
  inFlight = true;
  try {
    const result = await requestExtension("read", session.user.id);
    if (readSession()?.user.id !== session.user.id) return;
    if (!result?.ok) {
      connection.textContent = "Extension unavailable";
      status.textContent = result?.error === "attention_account_mismatch"
        ? "TNND Web and the Chrome extension are connected to different accounts. Connect the same account in both."
        : "No live extension response. Rebuild/reload TNND in Chrome, then refresh this page.";
      display = null;
      render();
      return;
    }
    display = parseAttentionState(result);
    if (!display) throw new Error("Invalid attention data received from the extension.");
    connection.textContent = display.watcherActive ? "Watcher connected" : "Watcher stopped";
    await loadNames(session.user.id);
    status.textContent = display.watcherActive
      ? "Live estimates from the extension. Scores update as chats receive and send messages."
      : "Start Watch conversations + matches in the extension to collect activity scores. No scores are inferred from old chats.";
    render();
  } catch (error) {
    if (readSession()?.user.id !== session.user.id) return;
    status.textContent = error instanceof Error ? error.message : "Unable to load attention data.";
    connection.textContent = "Unavailable";
    render();
  } finally { inFlight = false; }
}

panel.querySelector<HTMLButtonElement>("#attention-refresh")!.addEventListener("click", () => void refresh());
panel.querySelector<HTMLFormElement>("#attention-cap-form")!.addEventListener("submit", event => {
  event.preventDefault();
  if (saving) return;
  const session = readSession();
  const selected = Number(select.value);
  if (!session || !validCap(selected)) {
    saveStatus.textContent = "Choose a valid maximum waiting time.";
    return;
  }
  saving = true;
  saveButton.disabled = true;
  saveStatus.textContent = "Saving…";
  void (async () => {
    const response = await requestExtension("save", session.user.id, selected);
    if (readSession()?.user.id !== session.user.id) return;
    if (!response?.ok) throw new Error(response?.error === "attention_account_mismatch"
      ? "Web and extension must use the same TNND account." : "Could not save to the extension. Check its connection.");
    const updated = parseAttentionState(response);
    if (!updated) throw new Error("Extension did not confirm the saved ceiling.");
    display = updated;
    saveStatus.textContent = "Saved in extension · applies to watcher focus.";
    render();
  })().catch(error => { saveStatus.textContent = error instanceof Error ? error.message : "Save failed."; })
    .finally(() => { saving = false; saveButton.disabled = false; });
});

window.addEventListener("tnnd:auth-session-changed", () => {
  activeUser = ""; namesForUser = ""; names = new Map(); display = null;
  render(); void refresh();
});
window.addEventListener("hashchange", () => { void refresh(); });
window.addEventListener("tnnd:workspace-view-changed", (event) => {
  if ((event as CustomEvent<{view?: string}>).detail?.view === "attention") void refresh();
});
window.setInterval(() => { void refresh(); }, 10_000);
void refresh();
