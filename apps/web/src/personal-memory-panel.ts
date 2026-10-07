import { readSession } from "./auth-client";
import {
  approvePersonalMemory,
  createPersonalMemoryFromAnecdote,
  deletePersonalMemory,
  listPersonalMemories,
  updatePersonalMemory
} from "./personal-memory-client";
import { toPersonalMemoryLibraryItem, type PersonalMemoryLibraryItem } from "./personal-memory-library";
import { renderPersonalMemoryReviewPanel } from "./personal-memory-review-panel";
import type { PersonalMemoryReviewDraft } from "./personal-memory-review";

const grid = document.querySelector<HTMLElement>(".grid");
if (!grid) throw new Error("TNND dashboard grid was not found.");

const panel = document.createElement("article");
panel.className = "panel panel-wide";
panel.innerHTML = `
  <div class="panel-heading">
    <div>
      <p class="eyebrow">Personal Memories</p>
      <h2>Anecdotes TNND may use naturally</h2>
    </div>
    <span class="pill" id="memory-count">0 memories</span>
  </div>
  <p>Add a true anecdote once. Gemini structures it once; future conversations retrieve only the most relevant approved memories instead of sending the whole library.</p>
  <textarea id="memory-source" rows="5" maxlength="20000" placeholder="Tell a true anecdote from your life…"></textarea>
  <button id="memory-analyze" type="button" style="margin-top:10px">Analyze anecdote</button>
  <p class="subtle" id="memory-message"></p>
  <div id="memory-list" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px"></div>
  <div id="memory-review" style="margin-top:16px"></div>
`;
grid.append(panel);

const source = panel.querySelector<HTMLTextAreaElement>("#memory-source")!;
const analyzeButton = panel.querySelector<HTMLButtonElement>("#memory-analyze")!;
const message = panel.querySelector<HTMLElement>("#memory-message")!;
const count = panel.querySelector<HTMLElement>("#memory-count")!;
const list = panel.querySelector<HTMLElement>("#memory-list")!;
const review = panel.querySelector<HTMLElement>("#memory-review")!;
let items: PersonalMemoryLibraryItem[] = [];
let selectedId: string | null = null;
let workingDraft: PersonalMemoryReviewDraft | null = null;

async function refresh(selectId?: string): Promise<void> {
  const session = readSession();
  if (!session) {
    items = [];
    selectedId = null;
    source.disabled = true;
    analyzeButton.disabled = true;
    count.textContent = "Sign in required";
    list.innerHTML = "";
    review.innerHTML = "";
    return;
  }
  source.disabled = false;
  analyzeButton.disabled = false;
  items = (await listPersonalMemories(session)).map(toPersonalMemoryLibraryItem);
  count.textContent = `${items.length} memor${items.length === 1 ? "y" : "ies"}`;
  selectedId = selectId ?? selectedId ?? items[0]?.id ?? null;
  renderList();
  renderSelected();
}

function renderList(): void {
  list.innerHTML = items.map((item) => `
    <button type="button" data-memory-id="${item.id}" class="${item.id === selectedId ? "" : "secondary"}">
      ${item.draft.title} · ${item.draft.reviewStatus}
    </button>
  `).join("");
  list.querySelectorAll<HTMLButtonElement>("[data-memory-id]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedId = button.dataset.memoryId ?? null;
      renderList();
      renderSelected();
    });
  });
}

function renderSelected(): void {
  const item = items.find((candidate) => candidate.id === selectedId);
  if (!item) {
    review.innerHTML = "";
    return;
  }
  workingDraft = structuredClone(item.draft);
  renderPersonalMemoryReviewPanel(review, {
    draft: workingDraft,
    onChange: (draft) => { workingDraft = draft; },
    onApprove: (draft) => {
      void saveAndApprove(item, draft);
    }
  });
  const controls = document.createElement("div");
  controls.style.cssText = "display:flex;gap:8px;flex-wrap:wrap;margin-top:10px";
  controls.innerHTML = '<button type="button" data-action="save" class="secondary">Save draft</button><button type="button" data-action="delete" class="secondary">Delete memory</button>';
  review.append(controls);
  controls.querySelector<HTMLButtonElement>('[data-action="save"]')?.addEventListener("click", () => void saveDraft(item));
  controls.querySelector<HTMLButtonElement>('[data-action="delete"]')?.addEventListener("click", () => void removeMemory(item));
}

async function saveDraft(item: PersonalMemoryLibraryItem): Promise<void> {
  const session = readSession();
  if (!session || !workingDraft) return;
  message.textContent = "Saving memory draft…";
  await updatePersonalMemory(session, item.id, { ...workingDraft, reviewStatus: "draft" });
  message.textContent = "Memory draft saved.";
  await refresh(item.id);
}

async function saveAndApprove(item: PersonalMemoryLibraryItem, draft: PersonalMemoryReviewDraft): Promise<void> {
  const session = readSession();
  if (!session) return;
  message.textContent = "Saving and approving memory…";
  await updatePersonalMemory(session, item.id, { ...draft, reviewStatus: "draft" });
  await approvePersonalMemory(session, item.id);
  message.textContent = "Memory approved. TNND may retrieve it when relevant.";
  await refresh(item.id);
}

async function removeMemory(item: PersonalMemoryLibraryItem): Promise<void> {
  const session = readSession();
  if (!session) return;
  await deletePersonalMemory(session, item.id);
  selectedId = null;
  message.textContent = "Memory deleted.";
  await refresh();
}

analyzeButton.addEventListener("click", () => {
  void (async () => {
    const session = readSession();
    if (!session) return;
    analyzeButton.disabled = true;
    message.textContent = "Analyzing anecdote once…";
    const record = await createPersonalMemoryFromAnecdote(session, source.value);
    source.value = "";
    message.textContent = "Anecdote structured and stored as a draft. Review before approving.";
    await refresh(record.id);
  })().catch((error) => {
    message.textContent = error instanceof Error ? error.message : "Unable to analyze anecdote.";
  }).finally(() => {
    analyzeButton.disabled = !readSession();
  });
});

window.addEventListener("tnnd:auth-session-changed", () => void refresh());
void refresh();
