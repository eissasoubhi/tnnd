import { readSession } from "./auth-client";
import { getConversation, listConversations, updateConversationStatus, type ConversationDetail } from "./conversation-client";
import type { ConversationListItem, ConversationStatus } from "./conversation-contract";

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;"
  })[char] ?? char);
}

function formatDate(value?: string | null): string {
  if (!value) return "No messages yet";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unknown date" : date.toLocaleString();
}

function renderList(items: ConversationListItem[], selectedId?: string): string {
  if (!items.length) return '<p class="subtle">No conversations match this filter.</p>';
  return items.map((item) => `
    <button type="button" class="conversation-row${item.id === selectedId ? " selected" : ""}" data-conversation-id="${escapeHtml(item.id)}">
      <span class="conversation-row-main">
        <strong>${escapeHtml(item.displayName)}</strong>
        <small>${escapeHtml(item.currentTopic ?? "No topic yet")}</small>
      </span>
      <span class="conversation-row-meta">
        <span class="pill">${escapeHtml(item.status)}</span>
        <small>${escapeHtml(formatDate(item.lastMessageAt))}</small>
      </span>
    </button>
  `).join("");
}

function renderStatusActions(detail: ConversationDetail): string {
  const actions: Array<{ label: string; status: ConversationStatus; danger?: boolean }> = [];
  if (detail.status === "paused" || detail.status === "disabled") {
    actions.push({ label: "Resume", status: "active" });
  } else {
    actions.push({ label: "Pause", status: "paused" });
  }
  if (detail.status !== "disabled") actions.push({ label: "Disable", status: "disabled", danger: true });
  return actions.map((action) => `
    <button type="button" class="conversation-status-action${action.danger ? " danger" : ""}" data-conversation-status-action="${action.status}">${action.label}</button>
  `).join("");
}

function renderDetail(detail: ConversationDetail): string {
  const messages = detail.messages.length
    ? detail.messages.map((message) => `
      <div class="conversation-message ${message.direction}">
        <span>${message.direction === "incoming" ? "Them" : "You"}</span>
        <p>${escapeHtml(message.text)}</p>
        <small>${escapeHtml(formatDate(message.sentAt))}</small>
      </div>
    `).join("")
    : '<p class="subtle">No messages synchronized for this conversation yet.</p>';

  return `
    <div class="conversation-detail-heading">
      <div>
        <strong>${escapeHtml(detail.displayName)}</strong>
        <small>${escapeHtml(detail.currentTopic ?? "No current topic")}</small>
      </div>
      <span class="pill">${escapeHtml(detail.status)}</span>
    </div>
    <div class="conversation-status-actions" aria-label="Conversation controls">
      ${renderStatusActions(detail)}
    </div>
    <div class="conversation-messages">${messages}</div>
  `;
}

function countStatus(items: ConversationListItem[], status: ConversationStatus): number {
  return items.filter((item) => item.status === status).length;
}

function renderOperationalSummary(items: ConversationListItem[]): string {
  const cards: Array<{ label: string; value: number }> = [
    { label: "Active", value: countStatus(items, "active") },
    { label: "Waiting for them", value: countStatus(items, "waiting-for-them") },
    { label: "Waiting for you", value: countStatus(items, "waiting-for-user") },
    { label: "Action required", value: countStatus(items, "action-required") },
    { label: "Paused", value: countStatus(items, "paused") }
  ];
  return cards.map((card) => `
    <div class="conversation-stat">
      <strong>${card.value}</strong>
      <span>${escapeHtml(card.label)}</span>
    </div>
  `).join("");
}

function installStyles(): void {
  if (document.querySelector("#tnnd-conversation-panel-styles")) return;
  const style = document.createElement("style");
  style.id = "tnnd-conversation-panel-styles";
  style.textContent = `
    .conversation-stats{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px;margin-top:12px}.conversation-stat{display:grid;gap:2px;padding:9px 10px;border:1px solid var(--border,#d4d4d8);border-radius:10px;background:rgba(127,127,127,.05)}.conversation-stat strong{font-size:18px}.conversation-stat span{font-size:10px;opacity:.7}
    .conversation-toolbar{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:12px;flex-wrap:wrap}.conversation-filter{display:flex;align-items:center;gap:7px;font-size:12px}.conversation-filter select{width:auto;min-width:170px}.conversation-summary{font-size:11px;opacity:.7}
    .conversation-layout{display:grid;grid-template-columns:minmax(220px,.9fr) minmax(280px,1.1fr);gap:14px;margin-top:14px}
    .conversation-list{display:grid;gap:8px;align-content:start;max-height:430px;overflow:auto}
    .conversation-row{width:100%;display:flex;justify-content:space-between;gap:12px;text-align:left;padding:11px;border:1px solid var(--border,#d4d4d8);border-radius:10px;background:transparent;color:inherit;cursor:pointer}
    .conversation-row:hover{border-color:currentColor}.conversation-row.selected{outline:2px solid currentColor;outline-offset:1px}.conversation-row-main,.conversation-row-meta{display:grid;gap:4px}.conversation-row-meta{text-align:right;justify-items:end}.conversation-row small,.conversation-detail small,.conversation-message small{opacity:.65}
    .conversation-detail{min-height:180px;border:1px solid var(--border,#d4d4d8);border-radius:12px;padding:12px}.conversation-detail-heading{display:flex;justify-content:space-between;gap:12px;margin-bottom:10px}.conversation-detail-heading>div{display:grid;gap:4px}
    .conversation-status-actions{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px}.conversation-status-action{width:auto;padding:7px 10px;border:1px solid var(--border,#d4d4d8);border-radius:8px;background:transparent;color:inherit;cursor:pointer}.conversation-status-action:hover{border-color:currentColor}.conversation-status-action.danger{border-style:dashed}.conversation-status-action:disabled{opacity:.55;cursor:wait}
    .conversation-messages{display:grid;gap:8px;max-height:340px;overflow:auto}.conversation-message{max-width:86%;padding:9px 10px;border-radius:10px;background:rgba(127,127,127,.12)}.conversation-message.outgoing{justify-self:end}.conversation-message.incoming{justify-self:start}.conversation-message span{font-size:10px;font-weight:700;opacity:.7}.conversation-message p{margin:3px 0 4px;white-space:pre-wrap}
    @media(max-width:760px){.conversation-layout{grid-template-columns:1fr}.conversation-stats{grid-template-columns:repeat(2,minmax(0,1fr))}}
  `;
  document.head.append(style);
}

function mount(): { list: HTMLElement; detail: HTMLElement; status: HTMLElement; filter: HTMLSelectElement; summary: HTMLElement; stats: HTMLElement } | null {
  const grid = document.querySelector<HTMLElement>(".grid");
  if (!grid) return null;
  installStyles();
  const panel = document.createElement("article");
  panel.className = "panel panel-wide";
  panel.innerHTML = `
    <div class="panel-heading">
      <div><p class="eyebrow">Conversations</p><h2>Conversation control center</h2></div>
      <span class="pill" id="conversation-panel-status">Sign in required</span>
    </div>
    <p class="subtle">Synced Tinder conversations from the backend. Select one to inspect its current status, topic and message history.</p>
    <div id="conversation-operational-summary" class="conversation-stats"></div>
    <div class="conversation-toolbar">
      <label class="conversation-filter">Status
        <select id="conversation-status-filter">
          <option value="all">All conversations</option>
          <option value="active">Active</option>
          <option value="waiting-for-them">Waiting for them</option>
          <option value="waiting-for-user">Waiting for user</option>
          <option value="action-required">Action required</option>
          <option value="paused">Paused</option>
          <option value="disabled">Disabled</option>
          <option value="moved-off-tinder">Moved off Tinder</option>
          <option value="stale">Stale</option>
          <option value="archived">Archived</option>
        </select>
      </label>
      <span id="conversation-filter-summary" class="conversation-summary"></span>
    </div>
    <div class="conversation-layout">
      <div id="conversation-list" class="conversation-list"></div>
      <div id="conversation-detail" class="conversation-detail"><p class="subtle">Select a conversation.</p></div>
    </div>
  `;
  grid.prepend(panel);
  return {
    list: panel.querySelector<HTMLElement>("#conversation-list")!,
    detail: panel.querySelector<HTMLElement>("#conversation-detail")!,
    status: panel.querySelector<HTMLElement>("#conversation-panel-status")!,
    filter: panel.querySelector<HTMLSelectElement>("#conversation-status-filter")!,
    summary: panel.querySelector<HTMLElement>("#conversation-filter-summary")!,
    stats: panel.querySelector<HTMLElement>("#conversation-operational-summary")!
  };
}

const elements = mount();
let cachedItems: ConversationListItem[] = [];
let selectedConversationId: string | undefined;

function filteredItems(): ConversationListItem[] {
  if (!elements || elements.filter.value === "all") return cachedItems;
  return cachedItems.filter((item) => item.status === elements.filter.value as ConversationStatus);
}

function bindRows(items: ConversationListItem[]): void {
  if (!elements) return;
  elements.list.querySelectorAll<HTMLElement>("[data-conversation-id]").forEach((row) => {
    row.addEventListener("click", () => {
      const id = row.dataset.conversationId;
      if (!id) return;
      selectedConversationId = id;
      renderCurrentList();
      void loadDetail(id);
    });
  });
  if (selectedConversationId && !items.some((item) => item.id === selectedConversationId)) {
    selectedConversationId = undefined;
    elements.detail.innerHTML = '<p class="subtle">Select a conversation.</p>';
  }
}

function renderCurrentList(): void {
  if (!elements) return;
  const items = filteredItems();
  elements.list.innerHTML = renderList(items, selectedConversationId);
  elements.summary.textContent = `${items.length} shown · ${cachedItems.length} total`;
  elements.stats.innerHTML = renderOperationalSummary(cachedItems);
  bindRows(items);
}

async function applyStatus(conversationId: string, status: ConversationStatus): Promise<void> {
  if (!elements) return;
  const session = readSession();
  if (!session) return;
  const buttons = Array.from(elements.detail.querySelectorAll<HTMLButtonElement>("[data-conversation-status-action]"));
  buttons.forEach((button) => { button.disabled = true; });
  try {
    await updateConversationStatus(session, conversationId, status);
    cachedItems = cachedItems.map((item) => item.id === conversationId ? { ...item, status } : item);
    renderCurrentList();
    await loadDetail(conversationId);
  } catch (error) {
    elements.detail.insertAdjacentHTML("afterbegin", `<p class="subtle">${escapeHtml(error instanceof Error ? error.message : "Unable to update conversation status.")}</p>`);
    buttons.forEach((button) => { button.disabled = false; });
  }
}

function bindStatusActions(conversationId: string): void {
  if (!elements) return;
  elements.detail.querySelectorAll<HTMLButtonElement>("[data-conversation-status-action]").forEach((button) => {
    button.addEventListener("click", () => {
      const nextStatus = button.dataset.conversationStatusAction as ConversationStatus | undefined;
      if (nextStatus) void applyStatus(conversationId, nextStatus);
    });
  });
}

async function loadDetail(conversationId: string): Promise<void> {
  if (!elements) return;
  const session = readSession();
  if (!session) return;
  elements.detail.innerHTML = '<p class="subtle">Loading conversation…</p>';
  try {
    const detail = await getConversation(session, conversationId);
    elements.detail.innerHTML = renderDetail(detail);
    bindStatusActions(conversationId);
  } catch (error) {
    elements.detail.innerHTML = `<p class="subtle">${escapeHtml(error instanceof Error ? error.message : "Unable to load conversation.")}</p>`;
  }
}

async function refresh(): Promise<void> {
  if (!elements) return;
  const session = readSession();
  if (!session) {
    cachedItems = [];
    selectedConversationId = undefined;
    elements.status.textContent = "Sign in required";
    elements.summary.textContent = "0 shown · 0 total";
    elements.stats.innerHTML = renderOperationalSummary([]);
    elements.list.innerHTML = '<p class="subtle">Connect your TNND account to load conversations.</p>';
    elements.detail.innerHTML = '<p class="subtle">Conversation details will appear here.</p>';
    return;
  }

  elements.status.textContent = "Loading…";
  try {
    cachedItems = await listConversations(session);
    elements.status.textContent = `${cachedItems.length} synced`;
    const visible = filteredItems();
    if (!selectedConversationId && visible[0]) selectedConversationId = visible[0].id;
    renderCurrentList();
    if (selectedConversationId) void loadDetail(selectedConversationId);
  } catch (error) {
    cachedItems = [];
    selectedConversationId = undefined;
    elements.status.textContent = "Unavailable";
    elements.summary.textContent = "0 shown · 0 total";
    elements.stats.innerHTML = renderOperationalSummary([]);
    elements.list.innerHTML = `<p class="subtle">${escapeHtml(error instanceof Error ? error.message : "Unable to load conversations.")}</p>`;
  }
}

elements?.filter.addEventListener("change", () => {
  const visible = filteredItems();
  if (!selectedConversationId || !visible.some((item) => item.id === selectedConversationId)) {
    selectedConversationId = visible[0]?.id;
  }
  renderCurrentList();
  if (selectedConversationId) void loadDetail(selectedConversationId);
});

window.addEventListener("tnnd:auth-session-changed", () => void refresh());
void refresh();
