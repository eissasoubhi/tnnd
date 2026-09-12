import { fetchHumanActions, setHumanActionStatus } from "./human-action-client";

export type HumanActionSeverity = "info" | "action-required" | "decision-required" | "urgent";
export type HumanActionStatus = "pending" | "completed" | "ignored";

export interface HumanActionItem {
  id: string;
  conversationRef?: string | null;
  conversationLabel: string;
  title: string;
  detail: string;
  severity: HumanActionSeverity;
  status: HumanActionStatus;
  createdAt: string;
}

const storageKey = "tnnd:web:human-actions";

export function readHumanActions(): HumanActionItem[] {
  const raw = localStorage.getItem(storageKey);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter(isHumanActionItem) : [];
  } catch {
    return [];
  }
}

export function writeHumanActions(items: HumanActionItem[]): void {
  localStorage.setItem(storageKey, JSON.stringify(items));
}

export async function loadHumanActions(): Promise<HumanActionItem[]> {
  const remote = await fetchHumanActions();
  if (remote) {
    localStorage.removeItem(storageKey);
    return remote.filter(isHumanActionItem);
  }
  return readHumanActions();
}

export function updateHumanActionStatus(id: string, status: HumanActionStatus): HumanActionItem[] {
  const next = readHumanActions().map((item) => item.id === id ? { ...item, status } : item);
  writeHumanActions(next);
  return next;
}

export async function updateHumanActionStatusSynced(id: string, status: HumanActionStatus): Promise<HumanActionItem[]> {
  const remote = await setHumanActionStatus(id, status);
  if (remote) return loadHumanActions();
  return updateHumanActionStatus(id, status);
}

function isHumanActionItem(value: unknown): value is HumanActionItem {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<HumanActionItem>;
  return typeof item.id === "string"
    && (item.conversationRef === undefined || item.conversationRef === null || typeof item.conversationRef === "string")
    && typeof item.conversationLabel === "string"
    && typeof item.title === "string"
    && typeof item.detail === "string"
    && ["info", "action-required", "decision-required", "urgent"].includes(item.severity ?? "")
    && ["pending", "completed", "ignored"].includes(item.status ?? "")
    && typeof item.createdAt === "string";
}

export function renderActionCenter(container: HTMLElement, items = readHumanActions()): void {
  const pending = items.filter((item) => item.status === "pending");
  if (pending.length === 0) {
    container.innerHTML = `<div class="action-empty"><strong>No human action needed</strong><p>Items that need your confirmation or a manual step will appear here.</p></div>`;
    return;
  }

  container.innerHTML = pending.map((item) => `
    <article class="action-item" data-action-id="${escapeHtml(item.id)}">
      <div class="action-item__heading">
        <div>
          <span class="action-severity">${escapeHtml(item.severity)}</span>
          <strong>${escapeHtml(item.title)}</strong>
        </div>
        <small>${escapeHtml(item.conversationLabel)}</small>
      </div>
      <p>${escapeHtml(item.detail)}</p>
      <div class="action-item__buttons">
        <button type="button" data-action="complete">Complete</button>
        <button type="button" data-action="ignore" class="button-muted">Ignore</button>
      </div>
    </article>
  `).join("");
}

export function bindActionCenter(container: HTMLElement, onChange: (items: HumanActionItem[]) => void): void {
  container.addEventListener("click", (event) => {
    const target = event.target as HTMLElement;
    const action = target.dataset.action;
    if (action !== "complete" && action !== "ignore") return;
    const item = target.closest<HTMLElement>("[data-action-id]");
    const id = item?.dataset.actionId;
    if (!id) return;
    target.setAttribute("disabled", "true");
    void updateHumanActionStatusSynced(id, action === "complete" ? "completed" : "ignored")
      .then((next) => {
        renderActionCenter(container, next);
        onChange(next);
      })
      .catch((error) => {
        target.removeAttribute("disabled");
        console.error("Unable to update TNND action", error);
      });
  });
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char] ?? char);
}
