import { fetchHumanActions, setHumanActionStatus } from "./human-action-client";

export type HumanActionSeverity = "info" | "action-required" | "decision-required" | "urgent";
export type HumanActionStatus = "pending" | "completed" | "ignored";
export type HumanActionSeverityFilter = "all" | HumanActionSeverity;

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
const severityPriority: Record<HumanActionSeverity, number> = {
  urgent: 4,
  "decision-required": 3,
  "action-required": 2,
  info: 1
};

const severityFilters: Array<{ value: HumanActionSeverityFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "urgent", label: "Urgent" },
  { value: "decision-required", label: "Decisions" },
  { value: "action-required", label: "Actions" },
  { value: "info", label: "Info" }
];

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

export function sortPendingHumanActions(items: HumanActionItem[]): HumanActionItem[] {
  return items
    .filter((item) => item.status === "pending")
    .sort((left, right) => {
      const severityDelta = severityPriority[right.severity] - severityPriority[left.severity];
      if (severityDelta !== 0) return severityDelta;
      const rightTime = Date.parse(right.createdAt);
      const leftTime = Date.parse(left.createdAt);
      return (Number.isFinite(rightTime) ? rightTime : 0) - (Number.isFinite(leftTime) ? leftTime : 0);
    });
}

export function filterPendingHumanActions(
  items: HumanActionItem[],
  filter: HumanActionSeverityFilter
): HumanActionItem[] {
  const pending = sortPendingHumanActions(items);
  return filter === "all" ? pending : pending.filter((item) => item.severity === filter);
}

function renderActionSummary(items: HumanActionItem[]): string {
  const counts = items.reduce<Record<HumanActionSeverity, number>>((accumulator, item) => {
    accumulator[item.severity] += 1;
    return accumulator;
  }, { info: 0, "action-required": 0, "decision-required": 0, urgent: 0 });

  return `<div class="action-summary" aria-label="Pending human actions summary">
    <strong>${items.length} pending</strong>
    <span>${counts.urgent} urgent</span>
    <span>${counts["decision-required"]} decisions</span>
    <span>${counts["action-required"]} actions</span>
    <span>${counts.info} info</span>
  </div>`;
}

function renderSeverityFilters(activeFilter: HumanActionSeverityFilter): string {
  return `<div class="action-filters" aria-label="Filter pending human actions by severity">
    ${severityFilters.map(({ value, label }) => `<button type="button" data-action-filter="${value}" aria-pressed="${value === activeFilter ? "true" : "false"}">${label}</button>`).join("")}
  </div>`;
}

function readActiveFilter(container: HTMLElement): HumanActionSeverityFilter {
  const value = container.dataset.actionSeverityFilter;
  return severityFilters.some((filter) => filter.value === value) ? value as HumanActionSeverityFilter : "all";
}

export function renderActionCenter(container: HTMLElement, items = readHumanActions()): void {
  const pending = sortPendingHumanActions(items);
  if (pending.length === 0) {
    container.innerHTML = `<div class="action-empty"><strong>No human action needed</strong><p>Items that need your confirmation or a manual step will appear here.</p></div>`;
    return;
  }

  const activeFilter = readActiveFilter(container);
  const visible = filterPendingHumanActions(items, activeFilter);
  const emptyFiltered = `<div class="action-empty"><strong>No ${escapeHtml(activeFilter)} actions</strong><p>Choose another filter to review the rest of the queue.</p></div>`;

  container.innerHTML = `${renderActionSummary(pending)}${renderSeverityFilters(activeFilter)}${visible.length === 0 ? emptyFiltered : visible.map((item) => `
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
  `).join("")}`;
}

export function bindActionCenter(container: HTMLElement, onChange: (items: HumanActionItem[]) => void): void {
  container.addEventListener("click", (event) => {
    const target = event.target as HTMLElement;
    const filter = target.dataset.actionFilter;
    if (filter && severityFilters.some((option) => option.value === filter)) {
      container.dataset.actionSeverityFilter = filter;
      renderActionCenter(container);
      return;
    }

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
