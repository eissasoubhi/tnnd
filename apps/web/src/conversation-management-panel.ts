import { readSession } from "./auth-client";
import { listConversations } from "./conversation-client";
import {
  conversationManagementStates,
  listConversationManagement,
  saveConversationManagement,
  type ConversationManagementRecord,
  type ConversationManagementState,
  type HumanActionBlockSeverity
} from "./conversation-management-client";

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;"
  })[char] ?? char);
}

function labelForState(state: ConversationManagementState): string {
  switch (state) {
    case "ai-managed": return "AI managed";
    case "manual": return "Keep manual";
    case "moved-off-tinder": return "Moved off Tinder";
    case "archived": return "Archived";
    default: return "Unmanaged";
  }
}

function labelForBlockSeverity(severity: HumanActionBlockSeverity | null): string {
  switch (severity) {
    case "urgent": return "Urgent";
    case "decision-required": return "Decision required";
    case "action-required": return "Action required";
    default: return "Human action";
  }
}

function renderOptions(selected: ConversationManagementState): string {
  return conversationManagementStates.map((state) => (
    `<option value="${state}"${state === selected ? " selected" : ""}>${escapeHtml(labelForState(state))}</option>`
  )).join("");
}

function renderHumanActionBlock(record: ConversationManagementRecord): string {
  const block = record.humanActionBlock;
  if (!block?.blocked) return "";
  const count = `${block.pendingCount} pending blocker${block.pendingCount === 1 ? "" : "s"}`;
  return `<span class="management-action-block" data-severity="${block.highestSeverity ?? "action-required"}">${escapeHtml(labelForBlockSeverity(block.highestSeverity))} · ${escapeHtml(count)}</span>`;
}

function installStyles(): void {
  if (document.querySelector("#tnnd-management-panel-styles")) return;
  const style = document.createElement("style");
  style.id = "tnnd-management-panel-styles";
  style.textContent = `
    .conversation-management-explainer{padding:10px 14px;border:1px solid var(--nb-border,#c8d8cd);border-radius:12px;background:var(--nb-surface-soft,#edf4eb);font-size:12px;line-height:1.6}.conversation-management-explainer summary{cursor:pointer;font-weight:750}.conversation-management-explainer p{margin:8px 0 0}
    .management-list{display:grid;gap:8px;margin-top:12px}.management-row{display:grid;grid-template-columns:minmax(0,1fr) 190px auto;gap:10px;align-items:center;padding:10px;border:1px solid var(--border,#d4d4d8);border-radius:10px}.management-row-main{display:grid;gap:3px;min-width:0}.management-row-main strong,.management-row-main small{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.management-row small{opacity:.65}.management-row select{width:100%}.management-row button{width:auto;padding:7px 10px}.management-badge{font-size:10px;opacity:.72}.management-action-block{display:inline-flex;width:max-content;max-width:100%;font-size:11px;font-weight:700;padding:3px 7px;border-radius:999px;background:rgba(245,158,11,.14)}.management-action-block[data-severity="urgent"]{background:rgba(239,68,68,.16)}.management-note{margin-top:9px}.management-status{min-height:18px}.management-row[data-management-state="moved-off-tinder"]{border-style:dashed}.management-row[data-management-state="ai-managed"]{outline:1px solid currentColor;outline-offset:1px}.management-row[data-action-focus="true"]{box-shadow:0 0 0 3px rgba(99,102,241,.3)}@media(max-width:760px){.management-row{grid-template-columns:1fr}}
  `;
  document.head.append(style);
}

function mount(): { list: HTMLElement; status: HTMLElement } | null {
  const grid = document.querySelector<HTMLElement>(".grid");
  if (!grid) return null;
  installStyles();
  const panel = document.createElement("article");
  panel.className = "panel panel-wide";
  panel.id = "conversation-management-panel";
  panel.innerHTML = `
    <div class="panel-heading">
      <div><p class="eyebrow">AI takeover</p><h2>Conversation management</h2></div>
      <span class="pill" id="conversation-management-status">Sign in required</span>
    </div>
    <p class="subtle">Choose which chats TNND is allowed to manage. Existing Tinder conversations are not selected automatically.</p>
    <details class="conversation-management-explainer"><summary>How do I let TNND handle a Tinder conversation?</summary>
      <p><strong>1. Synced</strong> means that TNND received the messages; it does not mean continuous monitoring. <strong>2. AI managed</strong> permits TNND to manage only this chat, after your confirmation. <strong>3. Paused</strong> stops server-side automation even if the chat is AI managed. Resume separately in Conversations. <strong>4. Extension automation</strong> must also be enabled globally and for this chat. Check the Tinder tab and test a manual draft first.</p>
      <p><strong>Keep manual</strong> means you write/send messages yourself. <strong>Unmanaged</strong> means TNND has no automation permission. A draft preview never sends a message.</p>
    </details>
    <div id="conversation-management-list" class="management-list"></div>
    <p class="subtle management-note">Switching to AI managed requires an explicit confirmation before it is saved.</p>
    <p class="subtle management-status" id="conversation-management-message"></p>
  `;
  grid.prepend(panel);
  return {
    list: panel.querySelector<HTMLElement>("#conversation-management-list")!,
    status: panel.querySelector<HTMLElement>("#conversation-management-status")!
  };
}

const elements = mount();
let records: ConversationManagementRecord[] = [];
let names = new Map<string, string>();

function render(): void {
  if (!elements) return;
  if (!records.length) {
    elements.list.innerHTML = '<p class="subtle">No synchronized conversations to manage yet.</p>';
    return;
  }
  elements.list.innerHTML = records.map((record) => `
    <div class="management-row" data-management-row="${escapeHtml(record.conversationId)}" data-management-state="${record.managementState}">
      <div class="management-row-main">
        <strong>${escapeHtml(names.get(record.conversationId) ?? `Conversation ${record.conversationId.slice(0, 8)}`)}</strong>
        <small>${record.explicitlySelected ? "Explicitly selected" : "Not selected for AI takeover"} · Updated ${escapeHtml(new Date(record.updatedAt).toLocaleString())}</small>
        ${renderHumanActionBlock(record)}
      </div>
      <label>
        <span class="management-badge">Management state</span>
        <select data-management-select>${renderOptions(record.managementState)}</select>
      </label>
      <button type="button" data-management-save>Save</button>
    </div>
  `).join("");

  elements.list.querySelectorAll<HTMLElement>("[data-management-row]").forEach((row) => {
    const conversationId = row.dataset.managementRow;
    const select = row.querySelector<HTMLSelectElement>("[data-management-select]");
    const save = row.querySelector<HTMLButtonElement>("[data-management-save]");
    if (!conversationId || !select || !save) return;
    save.addEventListener("click", () => {
      void saveState(conversationId, select.value as ConversationManagementState, save);
    });
  });
}

async function saveState(conversationId: string, state: ConversationManagementState, button: HTMLButtonElement): Promise<void> {
  const session = readSession();
  const message = document.querySelector<HTMLElement>("#conversation-management-message");
  if (!session || !message) return;
  const current = records.find((record) => record.conversationId === conversationId);
  if (!current || current.managementState === state) {
    message.textContent = "No change to save.";
    return;
  }
  if (state === "ai-managed") {
    const confirmed = window.confirm("Allow TNND AI to continue this existing Tinder conversation? This enables AI management for this chat only.");
    if (!confirmed) {
      render();
      message.textContent = "AI takeover was not enabled.";
      return;
    }
  }
  button.disabled = true;
  message.textContent = "Saving conversation management state…";
  try {
    const saved = await saveConversationManagement(session, [{ conversationId, managementState: state }]);
    const updated = saved[0];
    if (!updated) throw new Error("The backend did not return the updated conversation.");
    records = records.map((record) => record.conversationId === conversationId ? updated : record);
    render();
    message.textContent = `${labelForState(updated.managementState)} saved.`;
  } catch (error) {
    message.textContent = error instanceof Error ? error.message : "Unable to save conversation management state.";
    button.disabled = false;
  }
}

async function refresh(): Promise<void> {
  if (!elements) return;
  const session = readSession();
  if (!session) {
    records = [];
    elements.status.textContent = "Sign in required";
    elements.list.innerHTML = '<p class="subtle">Connect your TNND account to manage conversations.</p>';
    return;
  }
  elements.status.textContent = "Loading…";
  try {
    const [management, summaries] = await Promise.all([
      listConversationManagement(session),
      listConversations(session)
    ]);
    records = management;
    names = new Map(summaries.map(item => [item.id, item.displayName + (item.matchAge ? ` · ${item.matchAge}` : "")]));
    elements.status.textContent = `${records.length} conversations`;
    render();
  } catch (error) {
    records = [];
    elements.status.textContent = "Unavailable";
    elements.list.innerHTML = `<p class="subtle">${escapeHtml(error instanceof Error ? error.message : "Unable to load conversation management settings.")}</p>`;
  }
}

function focusConversation(conversationRef: string): void {
  const row = elements?.list.querySelector<HTMLElement>(`[data-management-row="${CSS.escape(conversationRef)}"]`);
  if (!row) return;
  elements?.list.querySelectorAll<HTMLElement>("[data-action-focus]").forEach((item) => delete item.dataset.actionFocus);
  row.dataset.actionFocus = "true";
  row.scrollIntoView({ behavior: "smooth", block: "center" });
  window.setTimeout(() => delete row.dataset.actionFocus, 2400);
}

window.addEventListener("tnnd:auth-session-changed", () => void refresh());
window.addEventListener("tnnd:human-action-updated", () => void refresh());
window.addEventListener("tnnd:open-conversation", (event) => {
  const conversationRef = (event as CustomEvent<{ conversationRef?: string }>).detail?.conversationRef;
  if (conversationRef) focusConversation(conversationRef);
});
void refresh();
