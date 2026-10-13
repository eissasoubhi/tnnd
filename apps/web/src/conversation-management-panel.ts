import { readSession } from "./auth-client";
import { listConversations, updateConversationStatus } from "./conversation-client";
import { planExistingChatTakeover } from "./existing-chat-bulk-plan";
import type { ConversationListItem } from "./conversation-contract";
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
    .management-bulk-actions{display:flex;gap:8px;flex-wrap:wrap}.management-bulk-panel{padding:15px;border:1px solid var(--nb-border,#c8d8cd);border-radius:12px;background:var(--nb-surface-soft,#edf4eb);margin:14px 0}.management-bulk-panel h3{font-size:14px;margin:0 0 6px}.management-bulk-panel button{padding:8px 12px;margin-top:8px;cursor:pointer}.management-bulk-panel button:disabled{opacity:.5;cursor:not-allowed}.management-list{display:grid;gap:8px;margin-top:12px}.management-row{display:grid;grid-template-columns:minmax(0,1fr) 190px auto;gap:10px;align-items:center;padding:10px;border:1px solid var(--border,#d4d4d8);border-radius:10px}.management-row-main{display:grid;gap:3px;min-width:0}.management-match-line{display:flex;align-items:center;gap:9px;min-width:0}.management-match-avatar{display:grid;flex:0 0 36px;place-items:center;width:36px;height:36px;border-radius:50%;object-fit:cover;background:var(--nb-mint,#d9efcc);color:var(--nb-primary,#264b40)}.management-row-main strong,.management-row-main small{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.management-row small{opacity:.65}.management-row select{width:100%}.management-row button{width:auto;padding:7px 10px}.management-badge{font-size:10px;opacity:.72}.management-action-block{display:inline-flex;width:max-content;max-width:100%;font-size:11px;font-weight:700;padding:3px 7px;border-radius:999px;background:rgba(245,158,11,.14)}.management-action-block[data-severity="urgent"]{background:rgba(239,68,68,.16)}.management-note{margin-top:9px}.management-status{min-height:18px}.management-row[data-management-state="moved-off-tinder"]{border-style:dashed}.management-row[data-management-state="ai-managed"]{outline:1px solid currentColor;outline-offset:1px}.management-row[data-action-focus="true"]{box-shadow:0 0 0 3px rgba(99,102,241,.3)}@media(max-width:760px){.management-row{grid-template-columns:1fr}}
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
    <section class="management-bulk-panel" aria-label="Global AI control for existing conversations">
      <h3>Existing conversations · global AI takeover</h3>
      <p class="subtle">Applies to previously synced conversations with messages. Manual, blocked, disabled, archived, and unsynced chats are excluded. No first message is sent. Explicitly authorize the bulk operation below.</p>
      <p class="subtle" id="management-bulk-preview">Loading eligible conversations…</p>
      <div class="management-bulk-actions"><button type="button" id="management-bulk-enable">Start existing chats</button><button type="button" id="management-bulk-pause">Stop existing chats</button></div>
      <p id="management-bulk-status" class="subtle" role="status" aria-live="polite"></p>
    </section>
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
let photos = new Map<string, string>();
let summariesCache: ConversationListItem[] = [];
let bulkBusy = false;

async function applyBulkExisting(): Promise<void> {
  const session = readSession();
  const status = document.querySelector<HTMLElement>("#management-bulk-status");
  const button = document.querySelector<HTMLButtonElement>("#management-bulk-enable");
  if (!session || !status || !button || bulkBusy) return;
  const plan = planExistingChatTakeover(records, summariesCache);
  const targets = [...new Set([...plan.eligible, ...plan.resume])];
  if (!targets.length) { status.textContent = "Nothing to change: eligible chats are already activated."; return; }
  const message = `Allow TNND to manage ${targets.length} existing conversations? ${plan.eligible.length} ownership updates, ${plan.resume.length} paused chats to resume. No Tinder messages are sent by this action. Manual, blocked, disabled and archived chats are skipped.`;
  if (!window.confirm(message)) { status.textContent = "Cancelled; no change was made."; return; }
  bulkBusy = true;
  button.disabled = true;
  const errors: string[] = [];
  let enrolled = 0;
  let resumed = 0;
  try {
    // The authenticated backend accepts at most 100 per atomic operation.
    for (let index = 0; index < plan.eligible.length; index += 100) {
      const slice = plan.eligible.slice(index, index + 100);
      const response = await saveConversationManagement(session, slice.map(conversationId => ({ conversationId, managementState: "ai-managed" })));
      enrolled += response.length;
      status.textContent = `Authorized ${enrolled}/${plan.eligible.length}…`;
    }
    for (const id of plan.resume) {
      try { await updateConversationStatus(session, id, "active"); resumed++; }
      catch { errors.push(id); }
    }
    status.textContent = `AI management authorized on ${enrolled} chats; resumed ${resumed}. ${errors.length ? `${errors.length} could not be resumed; review them individually.` : "Other chats left unchanged."} Keep a Tinder tab open and enable extension auto-replies to process messages.`;
    await refresh();
  } catch (error) {
    status.textContent = `Stopped after ${enrolled} updates and ${resumed} resumes: ${error instanceof Error ? error.message : "Unexpected error"}. Refresh before retrying.`;
    await refresh();
  } finally { bulkBusy = false; button.disabled = false; }
}

async function pauseBulkExisting(): Promise<void> {
  const session = readSession();
  const status = document.querySelector<HTMLElement>("#management-bulk-status");
  const button = document.querySelector<HTMLButtonElement>("#management-bulk-pause");
  if (!session || !status || !button || bulkBusy) return;
  const byId = new Map(summariesCache.map(item => [item.id, item]));
  const ids = records.filter(record => record.managementState === "ai-managed" && record.explicitlySelected
    && byId.has(record.conversationId)
    && !["paused", "disabled", "archived", "moved-off-tinder"].includes(byId.get(record.conversationId)!.status))
    .map(record => record.conversationId);
  if (!ids.length) { status.textContent = "No AI-managed active conversations to pause."; return; }
  if (!window.confirm(`Pause ${ids.length} AI-managed existing conversations? This stops server-authorized automation but keeps individual AI management settings.`)) return;
  bulkBusy = true;
  button.disabled = true;
  let paused = 0;
  try {
    for (const id of ids) { try { await updateConversationStatus(session, id, "paused"); paused++; } catch { /* continue with other conversations */ } }
    status.textContent = `Paused ${paused}/${ids.length} existing AI-managed chats. Open a chat individually to Resume it later.`;
    await refresh();
  } finally { bulkBusy = false; button.disabled = false; }
}

document.querySelector("#management-bulk-enable")?.addEventListener("click", () => { void applyBulkExisting(); });
document.querySelector("#management-bulk-pause")?.addEventListener("click", () => { void pauseBulkExisting(); });

function render(): void {
  if (!elements) return;
  if (!records.length) {
    elements.list.innerHTML = '<p class="subtle">No synchronized conversations to manage yet.</p>';
    return;
  }
  elements.list.innerHTML = records.map((record) => `
    <div class="management-row" data-management-row="${escapeHtml(record.conversationId)}" data-management-state="${record.managementState}">
      <div class="management-row-main">
        <div class="management-match-line">
          ${photos.get(record.conversationId) ? `<img class="management-match-avatar" src="${escapeHtml(photos.get(record.conversationId)!)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : '<span class="management-match-avatar" aria-hidden="true">●</span>'}
          <strong>${escapeHtml(names.get(record.conversationId) ?? "Profil Tinder à synchroniser")}</strong>
        </div>
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
    summariesCache = summaries;
    const bulkPlan = planExistingChatTakeover(records, summariesCache);
    const bulkPreview = document.querySelector<HTMLElement>("#management-bulk-preview");
    if (bulkPreview) bulkPreview.textContent = `${bulkPlan.eligible.length} to authorize · ${bulkPlan.resume.length} paused to resume · ${bulkPlan.skipped.manual} manual · ${bulkPlan.skipped.blocked} blocked · ${bulkPlan.skipped.unsynced} not yet synced · ${bulkPlan.skipped.archived} archived/moved · ${bulkPlan.skipped.disabled} disabled.`;
    names = new Map(summaries.map(item => [item.id, `${item.displayName.startsWith("Conversation ") ? "Profil Tinder à synchroniser" : item.displayName}${item.matchAge ? ` ${item.matchAge}` : ""}`]));
    photos = new Map(summaries.filter(item => item.matchPhotoUrl).map(item => [item.id, item.matchPhotoUrl!]));
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
