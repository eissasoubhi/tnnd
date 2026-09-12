import { readSession } from "./auth-client";
import { getConversation } from "./conversation-client";

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

function renderIndicator(count: number): void {
  removeIndicator();
  if (count <= 0) return;
  const detail = detailElement();
  if (!detail) return;
  const indicator = document.createElement("div");
  indicator.dataset.tnndConversationActionIndicator = "true";
  indicator.style.cssText = "margin:0 0 12px;padding:9px 10px;border:1px solid currentColor;border-radius:9px;font-size:12px;";
  indicator.innerHTML = `<strong>${count} human action${count === 1 ? "" : "s"} pending</strong><div style="margin-top:3px;opacity:.72">Open the Action Center to complete or ignore ${count === 1 ? "it" : "them"}.</div>`;
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
    const detail = await getConversation(session, conversationId);
    if (selectedConversationId() !== conversationId) return;
    renderIndicator(detail.pendingHumanActions ?? 0);
  } catch (error) {
    if (selectedConversationId() !== conversationId) return;
    removeIndicator();
    console.warn("Unable to load TNND conversation action count", escapeHtml(error instanceof Error ? error.message : "Unknown error"));
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
  if (target.closest("[data-conversation-id]")) scheduleRefresh(true);
});

const observer = new MutationObserver(() => scheduleRefresh());
observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["class"] });
window.addEventListener("focus", () => scheduleRefresh(true));
scheduleRefresh(true);
