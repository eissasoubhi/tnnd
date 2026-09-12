import { readSession } from "./auth-client";
import { getConversation } from "./conversation-client";
import { fetchHumanActions, setHumanActionStatus } from "./human-action-client";
import type { HumanActionItem } from "./action-center";

let lastConversationId: string | null = null;
let refreshTimer: number | undefined;

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char] ?? char);
}

function selectedConversationId(): string | null {
  return document.querySelector<HTMLElement>("[data-conversation-id].selected")?.dataset.conversationId ?? null;
}

function detailElement(): HTMLElement | null {
  return document.querySelector<HTMLElement>("#conversation-detail");
}

function removeIndicator(): void {
  detailElement()?.querySelector("[data-tnnd-conversation-action-indicator]")?.remove();
}

function renderIndicator(count: number, actions: HumanActionItem[]): void {
  removeIndicator();
  if (count <= 0) return;
  const detail = detailElement();
  if (!detail) return;
  const indicator = document.createElement("div");
  indicator.dataset.tnndConversationActionIndicator = "true";
  indicator.style.cssText = "margin:0 0 12px;padding:9px 10px;border:1px solid currentColor;border-radius:9px;font-size:12px;";
  const matched = actions.slice(0, 5);
  const details = matched.length
    ? `<div style="display:grid;gap:8px;margin-top:8px">${matched.map((item) => `
        <div data-conversation-human-action-id="${escapeHtml(item.id)}" style="padding:8px;border:1px solid color-mix(in srgb,currentColor 22%,transparent);border-radius:8px">
          <div><strong>${escapeHtml(item.title)}</strong> <span style="opacity:.62">· ${escapeHtml(item.severity)}</span></div>
          <div style="margin-top:3px;opacity:.78">${escapeHtml(item.detail)}</div>
          <div style="display:flex;gap:6px;margin-top:7px">
            <button type="button" data-conversation-human-action="completed">Complete</button>
            <button type="button" data-conversation-human-action="ignored">Ignore</button>
          </div>
        </div>`).join("")}</div>`
    : `<div style="margin-top:3px;opacity:.72">Open the Action Center to review the pending item${count === 1 ? "" : "s"}.</div>`;
  const hiddenCount = Math.max(0, count - matched.length);
  indicator.innerHTML = `<strong>${count} human action${count === 1 ? "" : "s"} pending</strong>${details}${hiddenCount ? `<div style="margin-top:7px;opacity:.7">+${hiddenCount} more in Action Center</div>` : ""}`;
  const controls = detail.querySelector(".conversation-status-actions");
  if (controls) controls.insertAdjacentElement("afterend", indicator);
  else detail.prepend(indicator);
}

async function refreshIndicator(): Promise<void> {
  const conversationId = selectedConversationId();
  if (!conversationId) {
    lastConversationId = null;
    removeIndicator();
    return;
  }
  const session = readSession();
  if (!session) {
    lastConversationId = conversationId;
    removeIndicator();
    return;
  }
  lastConversationId = conversationId;
  try {
    const [detail, allActions] = await Promise.all([getConversation(session, conversationId), fetchHumanActions()]);
    if (selectedConversationId() !== conversationId) return;
    const matchingActions = (allActions ?? []).filter((item) => item.status === "pending" && item.conversationRef === conversationId);
    renderIndicator(detail.pendingHumanActions ?? 0, matchingActions);
  } catch (error) {
    if (selectedConversationId() !== conversationId) return;
    removeIndicator();
    console.warn("Unable to load TNND conversation actions", escapeHtml(error instanceof Error ? error.message : "Unknown error"));
  }
}

function scheduleRefresh(force = false): void {
  const conversationId = selectedConversationId();
  if (!force && conversationId === lastConversationId) return;
  if (refreshTimer) window.clearTimeout(refreshTimer);
  refreshTimer = window.setTimeout(() => void refreshIndicator(), 60);
}

document.addEventListener("click", (event) => {
  const target = event.target as HTMLElement;
  const actionStatus = target.dataset.conversationHumanAction;
  if (actionStatus === "completed" || actionStatus === "ignored") {
    const card = target.closest<HTMLElement>("[data-conversation-human-action-id]");
    const actionId = card?.dataset.conversationHumanActionId;
    if (!actionId) return;
    target.setAttribute("disabled", "true");
    void setHumanActionStatus(actionId, actionStatus)
      .then(() => scheduleRefresh(true))
      .catch((error) => {
        target.removeAttribute("disabled");
        console.error("Unable to update TNND conversation action", error);
      });
    return;
  }
  if (target.closest("[data-conversation-id]")) scheduleRefresh(true);
});

const observer = new MutationObserver(() => scheduleRefresh());
observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["class"] });
window.addEventListener("focus", () => scheduleRefresh(true));
scheduleRefresh(true);
