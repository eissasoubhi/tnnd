import { readSession } from "./auth-client";
import { getConversation, listConversations, type ConversationDetail } from "./conversation-client";
import type { ConversationListItem } from "./conversation-contract";

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

function renderList(items: ConversationListItem[]): string {
  if (!items.length) return '<p class="subtle">No synchronized conversations yet.</p>';
  return items.map((item) => `
    <button type="button" class="conversation-row" data-conversation-id="${escapeHtml(item.id)}">
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
    <div class="conversation-messages">${messages}</div>
  `;
}

function installStyles(): void {
  if (document.querySelector("#tnnd-conversation-panel-styles")) return;
  const style = document.createElement("style");
  style.id = "tnnd-conversation-panel-styles";
  style.textContent = `
    .conversation-layout{display:grid;grid-template-columns:minmax(220px,.9fr) minmax(280px,1.1fr);gap:14px;margin-top:14px}
    .conversation-list{display:grid;gap:8px;align-content:start;max-height:430px;overflow:auto}
    .conversation-row{width:100%;display:flex;justify-content:space-between;gap:12px;text-align:left;padding:11px;border:1px solid var(--border,#d4d4d8);border-radius:10px;background:transparent;color:inherit;cursor:pointer}
    .conversation-row:hover{border-color:currentColor}.conversation-row-main,.conversation-row-meta{display:grid;gap:4px}.conversation-row-meta{text-align:right;justify-items:end}.conversation-row small,.conversation-detail small,.conversation-message small{opacity:.65}
    .conversation-detail{min-height:180px;border:1px solid var(--border,#d4d4d8);border-radius:12px;padding:12px}.conversation-detail-heading{display:flex;justify-content:space-between;gap:12px;margin-bottom:12px}.conversation-detail-heading>div{display:grid;gap:4px}
    .conversation-messages{display:grid;gap:8px;max-height:340px;overflow:auto}.conversation-message{max-width:86%;padding:9px 10px;border-radius:10px;background:rgba(127,127,127,.12)}.conversation-message.outgoing{justify-self:end}.conversation-message.incoming{justify-self:start}.conversation-message span{font-size:10px;font-weight:700;opacity:.7}.conversation-message p{margin:3px 0 4px;white-space:pre-wrap}
    @media(max-width:760px){.conversation-layout{grid-template-columns:1fr}}
  `;
  document.head.append(style);
}

function mount(): { list: HTMLElement; detail: HTMLElement; status: HTMLElement } | null {
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
    <div class="conversation-layout">
      <div id="conversation-list" class="conversation-list"></div>
      <div id="conversation-detail" class="conversation-detail"><p class="subtle">Select a conversation.</p></div>
    </div>
  `;
  grid.prepend(panel);
  return {
    list: panel.querySelector<HTMLElement>("#conversation-list")!,
    detail: panel.querySelector<HTMLElement>("#conversation-detail")!,
    status: panel.querySelector<HTMLElement>("#conversation-panel-status")!
  };
}

const elements = mount();

async function loadDetail(conversationId: string): Promise<void> {
  if (!elements) return;
  const session = readSession();
  if (!session) return;
  elements.detail.innerHTML = '<p class="subtle">Loading conversation…</p>';
  try {
    elements.detail.innerHTML = renderDetail(await getConversation(session, conversationId));
  } catch (error) {
    elements.detail.innerHTML = `<p class="subtle">${escapeHtml(error instanceof Error ? error.message : "Unable to load conversation.")}</p>`;
  }
}

async function refresh(): Promise<void> {
  if (!elements) return;
  const session = readSession();
  if (!session) {
    elements.status.textContent = "Sign in required";
    elements.list.innerHTML = '<p class="subtle">Connect your TNND account to load conversations.</p>';
    elements.detail.innerHTML = '<p class="subtle">Conversation details will appear here.</p>';
    return;
  }

  elements.status.textContent = "Loading…";
  try {
    const items = await listConversations(session);
    elements.list.innerHTML = renderList(items);
    elements.status.textContent = `${items.length} synced`;
    elements.list.querySelectorAll<HTMLElement>("[data-conversation-id]").forEach((row) => {
      row.addEventListener("click", () => void loadDetail(row.dataset.conversationId ?? ""));
    });
    if (items[0]) void loadDetail(items[0].id);
  } catch (error) {
    elements.status.textContent = "Unavailable";
    elements.list.innerHTML = `<p class="subtle">${escapeHtml(error instanceof Error ? error.message : "Unable to load conversations.")}</p>`;
  }
}

window.addEventListener("tnnd:auth-session-changed", () => void refresh());
void refresh();
