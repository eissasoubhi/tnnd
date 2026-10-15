import { readSession } from "./auth-client";
import { isLatestSessionResponse } from "./workspace-request-guard";
import {
  approvePersonalMemory,
  createPersonalMemoryFromAnecdote,
  deletePersonalMemory,
  listPersonalMemories,
  updatePersonalMemory
} from "./personal-memory-client";
import {
  describePersonalMemoryUsage,
  sortPersonalMemoryLibrary,
  toPersonalMemoryLibraryItem,
  type PersonalMemoryLibraryItem
} from "./personal-memory-library";
import { renderPersonalMemoryReviewPanel } from "./personal-memory-review-panel";
import type { PersonalMemoryReviewDraft } from "./personal-memory-review";

const grid = document.querySelector<HTMLElement>(".grid");
if (!grid) throw new Error("TNND dashboard grid was not found.");

const panel = document.createElement("article");
panel.className = "panel panel-wide workspace-feature";
panel.id = "personal-memory-panel";
panel.innerHTML = `
  <div class="panel-heading">
    <div>
      <p class="eyebrow">02 / Personal Memories</p>
      <h2>Your story library</h2>
    </div>
    <span class="pill" id="memory-count" role="status">Loading memories…</span>
  </div>
  <p>Save real moments and stories. Review each memory before TNND can use it in a conversation.</p>
  <label for="memory-source" class="workspace-field-label">A memory worth sharing</label>
  <textarea id="memory-source" rows="5" maxlength="20000" placeholder="A trip, a funny moment, something you learned, or a story you enjoy telling…"></textarea>
  <div class="workspace-actions">
    <button id="memory-analyze" type="button">Analyze anecdote</button>
    <span class="subtle">Analyzed once · Saved privately · Only relevant memories reused</span>
  </div>
  <p class="subtle" id="memory-message" role="status" aria-live="polite"></p>
  <div class="memory-toolbar" aria-label="Filter memories">
    <label for="memory-search">Search stories
      <input id="memory-search" type="search" placeholder="Title, topic, summary…" />
    </label>
    <label for="memory-filter">Review status
      <select id="memory-filter">
        <option value="all">All memories</option>
        <option value="draft">Needs review</option>
        <option value="approved">Approved</option>
      </select>
    </label>
    <button id="memory-clear-filters" class="secondary" type="button" hidden>Clear filters</button>
    <p id="memory-filter-summary" class="subtle" role="status" aria-live="polite"></p>
  </div>
  <p id="memory-editor-notice" class="subtle" role="status" aria-live="polite"></p>
  <div class="memory-workspace">
    <div id="memory-list" class="memory-list" aria-label="Saved memories"></div>
    <div id="memory-review" class="memory-detail" aria-label="Selected memory"></div>
  </div>
`;
grid.append(panel);

const source = panel.querySelector<HTMLTextAreaElement>("#memory-source")!;
const analyzeButton = panel.querySelector<HTMLButtonElement>("#memory-analyze")!;
const message = panel.querySelector<HTMLElement>("#memory-message")!;
const count = panel.querySelector<HTMLElement>("#memory-count")!;
const list = panel.querySelector<HTMLElement>("#memory-list")!;
const review = panel.querySelector<HTMLElement>("#memory-review")!;
const search = panel.querySelector<HTMLInputElement>("#memory-search")!;
const filter = panel.querySelector<HTMLSelectElement>("#memory-filter")!;
const clearFilters = panel.querySelector<HTMLButtonElement>("#memory-clear-filters")!;
const filterSummary = panel.querySelector<HTMLElement>("#memory-filter-summary")!;
const editorNotice = panel.querySelector<HTMLElement>("#memory-editor-notice")!;
let items: PersonalMemoryLibraryItem[] = [];
let selectedId: string | null = null;
let workingDraft: PersonalMemoryReviewDraft | null = null;
let busy = false;
let refreshSequence = 0;
let displayedSessionToken: string | null = null;

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char);
}

function showError(error: unknown): void {
  message.textContent = error instanceof Error ? error.message : "Something went wrong. Please try again.";
}

function hasUnsavedChanges(): boolean {
  const selected = items.find((item) => item.id === selectedId);
  return Boolean(selected && workingDraft && JSON.stringify(selected.draft) !== JSON.stringify(workingDraft));
}

function canLeaveSelection(): boolean {
  return !hasUnsavedChanges() || window.confirm("You have unsaved changes. Discard them?");
}

function setBusy(value: boolean): void {
  busy = value;
  analyzeButton.disabled = value || !readSession();
  panel.querySelectorAll<HTMLButtonElement>("#memory-review button, #memory-list button").forEach((button) => {
    button.disabled = value;
  });
}

async function refresh(selectId?: string): Promise<void> {
  const requestId = ++refreshSequence;
  const session = readSession();
  const token = session?.token ?? null;
  if (token !== displayedSessionToken) {
    displayedSessionToken = token;
    items = [];
    selectedId = null;
    workingDraft = null;
    source.value = "";
    search.value = "";
    filter.value = "all";
    list.innerHTML = "";
    review.innerHTML = "";
    editorNotice.textContent = "";
    filterSummary.textContent = "";
  }
  if (!session) {
    items = [];
    selectedId = null;
    workingDraft = null;
    source.disabled = true;
    analyzeButton.disabled = true;
    count.textContent = "Sign in required";
    list.innerHTML = '<p class="workspace-empty">Sign in to view your memories.</p>';
    review.innerHTML = "";
    clearFilters.hidden = true;
    filterSummary.textContent = "";
    return;
  }
  source.disabled = false;
  analyzeButton.disabled = busy;
  count.textContent = "Loading memories…";
  try {
    const records = await listPersonalMemories(session);
    if (!isLatestSessionResponse(requestId, refreshSequence, session.token, readSession()?.token)) return;
    items = sortPersonalMemoryLibrary(records.map(toPersonalMemoryLibraryItem));
    const approved = items.filter((item) => item.draft.reviewStatus === "approved").length;
    count.textContent = `${items.length} memories · ${approved} approved`;
    const preferred = selectId ?? selectedId;
    const matching = filteredItems();
    selectedId = matching.find((item) => item.id === preferred)?.id ?? matching[0]?.id ?? null;
    renderList();
    renderSelected();
  } catch (error) {
    if (!isLatestSessionResponse(requestId, refreshSequence, session.token, readSession()?.token)) return;
    count.textContent = "Unavailable";
    items = [];
    selectedId = null;
    workingDraft = null;
    list.innerHTML = '<p class="workspace-empty" role="alert">Could not load your memories. Check your connection and try again.</p>';
    review.innerHTML = "";
    message.textContent = "Could not load memories. Sign in and try again.";
  }
}

function filteredItems(): PersonalMemoryLibraryItem[] {
  const query = search.value.trim().toLocaleLowerCase();
  return items.filter((item) => {
    if (filter.value !== "all" && item.draft.reviewStatus !== filter.value) return false;
    const content = [item.draft.title, item.draft.category, item.draft.summary, ...item.draft.topics].join(" ").toLocaleLowerCase();
    return !query || content.includes(query);
  });
}

function renderList(): void {
  const visible = filteredItems();
  const activeFilters = Boolean(search.value.trim()) || filter.value !== "all";
  clearFilters.hidden = !activeFilters;
  filterSummary.textContent = `${visible.length} shown · ${items.length} saved`;
  list.innerHTML = visible.length ? visible.map((item) => `
    <button type="button" class="memory-list-item secondary ${item.id === selectedId ? "is-selected" : ""}" data-memory-id="${escapeHtml(item.id)}" aria-pressed="${item.id === selectedId}">
      <span class="memory-list-item__title">${escapeHtml(item.draft.title || "Untitled memory")}</span>
      <span class="memory-list-item__meta">${item.draft.reviewStatus === "approved" ? "Approved" : "Needs review"} · ${escapeHtml(item.draft.category)}</span>
    </button>
  `).join("") : `<p class="workspace-empty" role="status">${items.length ? 'No stories match the current search or status. Choose Clear filters to see your library.' : 'No stories saved yet. Add a real memory above to start your library.'}</p>`;
  list.querySelectorAll<HTMLButtonElement>("[data-memory-id]").forEach((button) => {
    button.addEventListener("click", () => {
      if (busy || !canLeaveSelection()) return;
      selectedId = button.dataset.memoryId ?? null;
      renderList();
      renderSelected();
    });
  });
}

function renderSelected(): void {
  const item = filteredItems().find((candidate) => candidate.id === selectedId);
  if (!item) {
    workingDraft = null;
    review.innerHTML = `<div class="workspace-empty">${items.length ? "Choose a visible story to review, or clear the filters." : "Your first story will appear here for review."}</div>`;
    return;
  }
  workingDraft = structuredClone(item.draft);
  renderPersonalMemoryReviewPanel(review, {
    draft: workingDraft,
    onChange: (draft) => { workingDraft = draft; },
    onApprove: (draft) => runMutation(() => saveAndApprove(item, draft))
  });
  const info = document.createElement("p");
  info.className = "subtle memory-usage";
  info.textContent = describePersonalMemoryUsage(item);
  review.append(info);
  const controls = document.createElement("div");
  controls.className = "workspace-actions";
  controls.innerHTML = '<button type="button" data-action="save" class="secondary">Save changes as draft</button><button type="button" data-action="delete" class="secondary">Delete memory</button>';
  review.append(controls);
  controls.querySelector<HTMLButtonElement>('[data-action="save"]')?.addEventListener("click", () => {
    void runMutation(() => saveDraft(item)).catch(showError);
  });
  controls.querySelector<HTMLButtonElement>('[data-action="delete"]')?.addEventListener("click", () => {
    if (!window.confirm("Delete this memory? This cannot be undone.")) return;
    void runMutation(() => removeMemory(item)).catch(showError);
  });
}

async function runMutation(action: () => Promise<void>): Promise<void> {
  if (busy) return;
  setBusy(true);
  try {
    await action();
    window.dispatchEvent(new CustomEvent("tnnd:personal-memory-updated"));
  } finally {
    setBusy(false);
  }
}

async function saveDraft(item: PersonalMemoryLibraryItem): Promise<void> {
  const session = readSession();
  if (!session || !workingDraft) return;
  message.textContent = "Saving memory draft…";
  await updatePersonalMemory(session, item.id, { ...workingDraft, reviewStatus: "draft" });
  message.textContent = "Memory draft saved. Approve it when you're ready.";
  await refresh(item.id);
}

async function saveAndApprove(item: PersonalMemoryLibraryItem, draft: PersonalMemoryReviewDraft): Promise<void> {
  const session = readSession();
  if (!session) throw new Error("Sign in to approve memories.");
  message.textContent = "Saving and approving memory…";
  await updatePersonalMemory(session, item.id, { ...draft, reviewStatus: "draft" });
  await approvePersonalMemory(session, item.id);
  message.textContent = "Memory approved. TNND may retrieve it when relevant.";
  await refresh(item.id);
}

async function removeMemory(item: PersonalMemoryLibraryItem): Promise<void> {
  const session = readSession();
  if (!session) throw new Error("Sign in to delete memories.");
  await deletePersonalMemory(session, item.id);
  selectedId = null;
  message.textContent = "Memory deleted.";
  await refresh();
}

analyzeButton.addEventListener("click", () => {
  if (busy) return;
  if (!source.value.trim()) {
    message.textContent = "Write a memory before analyzing.";
    source.focus();
    return;
  }
  void runMutation(async () => {
    const session = readSession();
    if (!session) throw new Error("Sign in to add memories.");
    message.textContent = "Analyzing anecdote…";
    const record = await createPersonalMemoryFromAnecdote(session, source.value);
    source.value = "";
    message.textContent = "Anecdote saved as a draft. Review the details before approving.";
    search.value = "";
    filter.value = "all";
    await refresh(record.id);
  }).catch(showError);
});

function applyMemoryFilters(): void {
  const visible = filteredItems();
  if (!visible.some((item) => item.id === selectedId)) {
    if (hasUnsavedChanges()) {
      editorNotice.textContent = "Unsaved edits are still open below. Save or discard them before choosing another story.";
    } else {
      selectedId = visible[0]?.id ?? null;
      editorNotice.textContent = "";
      renderSelected();
    }
  } else {
    editorNotice.textContent = "";
  }
  renderList();
}
search.addEventListener("input", applyMemoryFilters);
filter.addEventListener("change", applyMemoryFilters);
clearFilters.addEventListener("click", () => {
  search.value = "";
  filter.value = "all";
  applyMemoryFilters();
  search.focus();
});
window.addEventListener("tnnd:auth-session-changed", () => {
  void refresh().catch(showError);
});
void refresh().catch(showError);
