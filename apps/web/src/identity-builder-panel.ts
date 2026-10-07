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
panel.className = "panel panel-wide";
panel.innerHTML = `
  <div class="panel-heading">
    <div>
      <p class="eyebrow">Identity Builder</p>
      <h2>Tell TNND who you are</h2>
    </div>
    <span class="pill" id="identity-builder-status">Not analyzed</span>
  </div>
  <p>Write freely about your life, personality, habits, work, interests and preferences. TNND analyzes this text once and stores a compact structured identity for future conversations.</p>
  <textarea id="identity-builder-source" rows="8" maxlength="20000" placeholder="Example: I work in software, I like travelling, movies, cooking in the evening..."></textarea>
  <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:10px">
    <button id="identity-builder-analyze" type="button">Analyze identity</button>
    <button id="identity-builder-approve" type="button" disabled>Approve identity</button>
  </div>
  <p class="subtle" id="identity-builder-message">Sign in and configure Gemini first.</p>
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

const fields: Array<{ key: keyof IdentityStructuredAnalysis; label: string; list?: boolean }> = [
  { key: "summary", label: "Compact identity summary" },
  { key: "stableFacts", label: "Stable facts", list: true },
  { key: "interests", label: "Interests", list: true },
  { key: "lifestyle", label: "Lifestyle & routines", list: true },
  { key: "preferences", label: "Preferences", list: true },
  { key: "personalityTraits", label: "Personality traits", list: true },
  { key: "conversationTopics", label: "Good conversation topics", list: true },
  { key: "avoidTopics", label: "Topics to avoid", list: true }
];

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char] ?? char);
}

function render(state: IdentityBuilderState | null): void {
  current = state;
  approveButton.disabled = !state;
  if (!state) {
    status.textContent = "Not analyzed";
    review.innerHTML = "";
    return;
  }
  source.value = state.sourceText;
  status.textContent = state.reviewStatus === "approved" ? "Approved" : "Review draft";
  review.innerHTML = `
    <div class="preferences-grid" style="margin-top:16px">
      ${fields.map((field) => {
        const value = state.analysis[field.key];
        const text = Array.isArray(value) ? value.join("\n") : value;
        return `<label>${field.label}<textarea rows="${field.key === "summary" ? 4 : 3}" data-identity-field="${field.key}">${escapeHtml(text)}</textarea></label>`;
      }).join("")}
    </div>
    <p class="subtle">The original text stays stored for editing/re-analysis, but it is not sent to Gemini on every conversation. Generation uses only this compact approved structure.</p>
  `;
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

async function refresh(): Promise<void> {
  const session = readSession();
  const enabled = Boolean(session);
  source.disabled = !enabled;
  analyzeButton.disabled = !enabled;
  if (!session) {
    render(null);
    message.textContent = "Sign in to build your identity.";
    return;
  }
  try {
    render(await loadIdentityBuilder(session));
    message.textContent = current?.reviewStatus === "approved"
      ? "Approved identity is stored server-side and reused in compact form."
      : current ? "Review the structured identity, edit if needed, then approve." : "Describe yourself, then analyze once.";
  } catch (error) {
    message.textContent = error instanceof Error ? error.message : "Unable to load identity.";
  }
}

analyzeButton.addEventListener("click", () => {
  void (async () => {
    const session = readSession();
    if (!session) return;
    analyzeButton.disabled = true;
    message.textContent = "Analyzing identity…";
    const result = await analyzeIdentity(session, source.value);
    render(result.state);
    message.textContent = result.cached
      ? "This exact text was already analyzed. Reused the stored result without another AI call."
      : "Analysis stored as a draft. Review it, then approve.";
  })().catch((error) => {
    message.textContent = error instanceof Error ? error.message : "Identity analysis failed.";
  }).finally(() => {
    analyzeButton.disabled = !readSession();
  });
});

approveButton.addEventListener("click", () => {
  void (async () => {
    const session = readSession();
    if (!session || !current) return;
    approveButton.disabled = true;
    message.textContent = "Approving compact identity…";
    render(await approveIdentity(session, editedAnalysis()));
    message.textContent = "Identity approved. Future generations use the compact stored identity, not the raw About Me text.";
    window.dispatchEvent(new CustomEvent("tnnd:profile-updated"));
  })().catch((error) => {
    message.textContent = error instanceof Error ? error.message : "Unable to approve identity.";
  }).finally(() => {
    approveButton.disabled = !current;
  });
});

window.addEventListener("tnnd:auth-session-changed", () => void refresh());
void refresh();
