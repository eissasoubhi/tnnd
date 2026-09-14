import { readSession } from "./auth-client";
import {
  listConversationManagement,
  type ConversationManagementRecord,
  type ConversationManagementState
} from "./conversation-management-client";

let records = new Map<string, ConversationManagementRecord>();
let refreshInFlight: Promise<void> | null = null;
let activeManagementFilter: ConversationManagementState | "all" = "all";

function labelForState(state: ConversationManagementState): string {
  switch (state) {
    case "ai-managed": return "AI managed";
    case "manual": return "Manual";
    case "moved-off-tinder": return "Off Tinder";
    case "archived": return "Archived";
    default: return "Unmanaged";
  }
}

function installStyles(): void {
  if (document.querySelector("#tnnd-management-badge-styles")) return;
  const style = document.createElement("style");
  style.id = "tnnd-management-badge-styles";
  style.textContent = `
    .conversation-management-inline{font-size:10px;line-height:1;padding:4px 6px;border:1px solid currentColor;border-radius:999px;opacity:.72;white-space:nowrap}
    .conversation-management-inline[data-state="ai-managed"]{opacity:1;font-weight:700}
    .conversation-management-inline[data-state="moved-off-tinder"],.conversation-management-inline[data-state="archived"]{border-style:dashed}
    .conversation-detail-management{display:inline-flex;align-items:center;gap:5px;margin-left:6px}
    .conversation-management-filter{display:flex;align-items:center;gap:7px;font-size:12px}.conversation-management-filter select{width:auto;min-width:150px}
    .conversation-management-filter-summary{opacity:.7;min-width:44px;text-align:right}
    .conversation-management-filter-reset{font:inherit;padding:4px 7px;border:1px solid currentColor;border-radius:6px;background:transparent;cursor:pointer}
    .conversation-management-filter-reset:disabled{opacity:.4;cursor:default}
    .conversation-management-filtered-out{display:none!important}
  `;
  document.head.append(style);
}

function ensureFilterControl(): void {
  const toolbar = document.querySelector<HTMLElement>(".conversation-toolbar");
  if (!toolbar || toolbar.querySelector("#conversation-management-filter")) return;
  const label = document.createElement("label");
  label.className = "conversation-management-filter";
  label.innerHTML = `Management
    <select id="conversation-management-filter">
      <option value="all">All management states</option>
      <option value="ai-managed">AI managed</option>
      <option value="manual">Manual</option>
      <option value="moved-off-tinder">Off Tinder</option>
      <option value="archived">Archived</option>
      <option value="unmanaged">Unmanaged</option>
    </select>
    <span class="conversation-management-filter-summary" data-management-filter-summary aria-live="polite"></span>
    <button class="conversation-management-filter-reset" type="button" data-management-filter-reset>Reset</button>`;
  const select = label.querySelector<HTMLSelectElement>("select")!;
  const reset = label.querySelector<HTMLButtonElement>("[data-management-filter-reset]")!;
  select.value = activeManagementFilter;
  select.addEventListener("change", () => {
    const value = select.value as ConversationManagementState | "all";
    activeManagementFilter = value;
    renderBadges();
  });
  reset.addEventListener("click", () => {
    activeManagementFilter = "all";
    select.value = "all";
    renderBadges();
  });
  toolbar.prepend(label);
}

function applyManagementFilter(): void {
  const rows = Array.from(document.querySelectorAll<HTMLElement>("[data-conversation-id]"));
  let eligible = 0;
  let visible = 0;
  for (const row of rows) {
    const conversationId = row.dataset.conversationId;
    const record = conversationId ? records.get(conversationId) : undefined;
    const filteredOut = activeManagementFilter !== "all" && record?.managementState !== activeManagementFilter;
    row.classList.toggle("conversation-management-filtered-out", filteredOut);
    if (!row.hidden) {
      eligible += 1;
      if (!filteredOut) visible += 1;
    }
  }

  const summary = document.querySelector<HTMLElement>("[data-management-filter-summary]");
  if (summary) summary.textContent = `${visible}/${eligible}`;
  const reset = document.querySelector<HTMLButtonElement>("[data-management-filter-reset]");
  if (reset) reset.disabled = activeManagementFilter === "all";
}

function renderBadges(): void {
  installStyles();
  ensureFilterControl();
  document.querySelectorAll<HTMLElement>("[data-conversation-id]").forEach((row) => {
    const conversationId = row.dataset.conversationId;
    if (!conversationId) return;
    const record = records.get(conversationId);
    row.querySelector("[data-management-inline]")?.remove();
    if (!record) return;
    const meta = row.querySelector<HTMLElement>(".conversation-row-meta") ?? row;
    const badge = document.createElement("span");
    badge.className = "conversation-management-inline";
    badge.dataset.managementInline = "true";
    badge.dataset.state = record.managementState;
    badge.textContent = labelForState(record.managementState);
    badge.title = record.explicitlySelected
      ? "This conversation has an explicit management choice."
      : "This conversation has not been explicitly selected for AI takeover.";
    meta.prepend(badge);
  });
  applyManagementFilter();

  const selected = document.querySelector<HTMLElement>("[data-conversation-id].selected")?.dataset.conversationId;
  const heading = document.querySelector<HTMLElement>("#conversation-detail .conversation-detail-heading");
  heading?.querySelector("[data-detail-management]")?.remove();
  if (!selected || !heading) return;
  const record = records.get(selected);
  if (!record) return;
  const badge = document.createElement("span");
  badge.className = "conversation-management-inline conversation-detail-management";
  badge.dataset.detailManagement = "true";
  badge.dataset.state = record.managementState;
  badge.textContent = labelForState(record.managementState);
  badge.title = record.explicitlySelected
    ? "Explicitly selected management state"
    : "Not explicitly selected for AI takeover";
  heading.append(badge);
}

async function refresh(): Promise<void> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    const session = readSession();
    if (!session) {
      records = new Map();
      activeManagementFilter = "all";
      renderBadges();
      return;
    }
    try {
      const values = await listConversationManagement(session);
      records = new Map(values.map((record) => [record.conversationId, record]));
      renderBadges();
    } catch {
      records = new Map();
      activeManagementFilter = "all";
      renderBadges();
    }
  })().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

const observer = new MutationObserver(() => renderBadges());
observer.observe(document.body, { childList: true, subtree: true });
window.addEventListener("tnnd:auth-session-changed", () => void refresh());
window.addEventListener("focus", () => void refresh());
window.addEventListener("tnnd:conversation-management-changed", () => void refresh());
void refresh();
