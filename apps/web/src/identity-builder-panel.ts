import { readSession } from "./auth-client";
import {
  analyzeIdentity,
  approveIdentity,
  loadIdentityBuilder,
  type IdentityBuilderState,
  type IdentityStructuredAnalysis
} from "./identity-builder-client";

const grid = document.querySelector<HTMLElement>(".grid");
if (!grid) throw new Error("TNND dashboard grid was not found.");

const panel = document.createElement("article");
panel.className = "panel panel-wide workspace-feature";
panel.id = "identity-builder-panel";
panel.innerHTML = `
  <div class="panel-heading">
    <div>
      <p class="eyebrow">01 / Identity Builder</p>
      <h2>Make TNND sound like you</h2>
    </div>
    <span class="pill" id="identity-builder-status">Not analyzed</span>
  </div>
  <p>Tell your story in your own words. TNND extracts a compact profile once, then reuses only the approved structure in conversations.</p>
  <div class="workspace-steps" aria-label="Identity setup steps">
    <span><b>1</b> Describe yourself</span>
    <span><b>2</b> Review AI summary</span>
    <span><b>3</b> Approve</span>
  </div>
  <label for="identity-builder-source" class="workspace-field-label">About you</label>
  <textarea id="identity-builder-source" rows="8" maxlength="20000" aria-describedby="identity-builder-source-hint" placeholder="Your work, daily life, personality, interests, routines, what you like and dislike…"></textarea>
  <p class="subtle" id="identity-builder-source-hint">Write naturally, in any language. You control what gets approved for chat.</p>
  <div class="workspace-actions">
    <button id="identity-builder-analyze" type="button">Analyze identity</button>
    <button id="identity-builder-approve" class="secondary" type="button" disabled>Approve profile</button>
  </div>
  <p class="subtle" id="identity-builder-message" role="status" aria-live="polite">Sign in and configure Gemini first.</p>
  <div id="identity-builder-review"></div>
`;
grid.prepend(panel);

const source = panel.querySelector<HTMLTextAreaElement>("#identity-builder-source")!;
const analyzeButton = panel.querySelector<HTMLButtonElement>("#identity-builder-analyze")!;
const approveButton = panel.querySelector<HTMLButtonElement>("#identity-builder-approve")!;
const status = panel.querySelector<HTMLElement>("#identity-builder-status")!;
const message = panel.querySelector<HTMLElement>("#identity-builder-message")!;
const review = panel.querySelector<HTMLElement>("#identity-builder-review")!;
let current: IdentityBuilderState | null = null;
let busy = false;

const fields: Array<{ key: keyof IdentityStructuredAnalysis; label: string; hint?: string }> = [
  { key: "summary", label: "Compact identity summary", hint: "Short overview used when relevant" },
  { key: "stableFacts", label: "Facts about you", hint: "One fact per line" },
  { key: "interests", label: "Interests", hint: "One interest per line" },
  { key: "lifestyle", label: "Lifestyle & routines", hint: "One routine per line" },
  { key: "preferences", label: "Preferences", hint: "One preference per line" },
  { key: "personalityTraits", label: "Personality traits", hint: "One trait per line" },
  { key: "conversationTopics", label: "Conversation topics", hint: "Topics you enjoy" },
  { key: "avoidTopics", label: "Topics to avoid", hint: "Optional" }
];

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char] ?? char);
}

function sourceIsCurrent(): boolean {
  return Boolean(current && source.value.trim() === current.sourceText);
}

function editedAnalysis(): IdentityStructuredAnalysis {
  if (!current) throw new Error("Analyze your identity first.");
  const next = structuredClone(current.analysis);
  review.querySelectorAll<HTMLTextAreaElement>("[data-identity-field]").forEach((input) => {
    const key = input.dataset.identityField as keyof IdentityStructuredAnalysis;
    if (key === "summary") {
      next.summary = input.value.trim();
    } else {
      next[key] = input.value.split("\n").map((value) => value.trim()).filter(Boolean) as never;
    }
  });
  return next;
}

function hasReviewEdits(): boolean {
  return Boolean(current && review.querySelector("[data-identity-field]") &&
    JSON.stringify(editedAnalysis()) !== JSON.stringify(current.analysis));
}

function updateState(): void {
  const changedSource = Boolean(current && !sourceIsCurrent());
  const changedReview = hasReviewEdits();
  analyzeButton.disabled = busy || !readSession();
  approveButton.disabled = busy || !readSession() || !current || changedSource;
  status.textContent = changedSource ? "Reanalysis needed" :
    changedReview ? "Unsaved changes" :
    current?.reviewStatus === "approved" ? "Approved" :
    current ? "Review draft" : "Not analyzed";
  if (changedSource) message.textContent = "Your About Me changed. Analyze it again before approving.";
  else if (changedReview) message.textContent = "Review changes are not saved yet. Approve to save them.";
}

function render(state: IdentityBuilderState | null): void {
  current = state;
  if (!state) {
    review.innerHTML = "";
    updateState();
    return;
  }
  source.value = state.sourceText;
  review.innerHTML = `
    <div class="workspace-review-heading">
      <h3>Review your identity</h3>
      <p class="subtle">Correct anything Gemini misunderstood. Only approved fields are used for conversation context.</p>
    </div>
    <div class="preferences-grid">
      ${fields.map((field) => {
        const value = state.analysis[field.key];
        const text = Array.isArray(value) ? value.join("\n") : value;
        return `<label>${field.label}<textarea rows="${field.key === "summary" ? 4 : 3}" data-identity-field="${field.key}" aria-label="${field.label}">${escapeHtml(text)}</textarea><small class="subtle">${field.hint ?? "One entry per line"}</small></label>`;
      }).join("")}
    </div>
    <p class="subtle">The original text stays stored for future edits, but is not sent with every conversation. TNND uses the compact approved profile.</p>
  `;
  review.querySelectorAll<HTMLTextAreaElement>("[data-identity-field]").forEach((input) => {
    input.addEventListener("input", updateState);
  });
  updateState();
}

function setBusy(value: boolean): void {
  busy = value;
  source.disabled = value || !readSession();
  review.querySelectorAll<HTMLTextAreaElement>("textarea").forEach((input) => { input.disabled = value; });
  updateState();
}

async function refresh(): Promise<void> {
  const session = readSession();
  if (!session) {
    render(null);
    source.disabled = true;
    message.textContent = "Sign in to build your identity.";
    return;
  }
  source.disabled = false;
  try {
    render(await loadIdentityBuilder(session));
    message.textContent = current?.reviewStatus === "approved"
      ? "Your approved identity is saved. Only the compact structure is reused."
      : current ? "Review the extracted details, edit if needed, then approve." : "Describe yourself, then analyze once.";
  } catch (error) {
    message.textContent = error instanceof Error ? error.message : "Unable to load identity.";
  }
}

source.addEventListener("input", updateState);
analyzeButton.addEventListener("click", () => {
  if (busy) return;
  const session = readSession();
  if (!session) return;
  if (!source.value.trim()) {
    message.textContent = "Describe yourself before analyzing.";
    source.focus();
    return;
  }
  void (async () => {
    setBusy(true);
    message.textContent = "Analyzing identity…";
    const result = await analyzeIdentity(session, source.value);
    render(result.state);
    message.textContent = result.cached
      ? "Reused the saved analysis. No new Gemini analysis was needed."
      : "Identity analyzed and saved as a draft. Review it before approving.";
  })().catch((error) => {
    message.textContent = error instanceof Error ? error.message : "Identity analysis failed.";
  }).finally(() => setBusy(false));
});

approveButton.addEventListener("click", () => {
  if (busy || !sourceIsCurrent()) {
    message.textContent = "Analyze your updated About Me before approving.";
    return;
  }
  const session = readSession();
  if (!session || !current) return;
  void (async () => {
    const analysis = editedAnalysis();
    if (!analysis.summary.trim()) {
      message.textContent = "Add a short identity summary before approving.";
      review.querySelector<HTMLTextAreaElement>('[data-identity-field="summary"]')?.focus();
      return;
    }
    setBusy(true);
    message.textContent = "Saving your approved identity…";
    render(await approveIdentity(session, analysis));
    message.textContent = "Identity approved and saved. Your original About Me is not sent with each conversation.";
    window.dispatchEvent(new CustomEvent("tnnd:profile-updated"));
  })().catch((error) => {
    message.textContent = error instanceof Error ? error.message : "Unable to approve identity.";
  }).finally(() => setBusy(false));
});

window.addEventListener("tnnd:auth-session-changed", () => void refresh());
void refresh();
