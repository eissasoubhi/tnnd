import { readSession } from "./auth-client";
import { fetchProfile, saveProfile } from "./profile-client";
import { writeEditablePreferences, type EditablePreferences } from "./profile-preferences";
import { analyzeTextingStyle } from "./texting-style-analysis-client";
import {
  approveStyleAnalysis,
  approvedStylePreferences,
  createTextingStyleLearningDraft,
  editStyleAnalysis,
  markStyleAnalysisReviewed,
  setStyleExamples,
  type TextingStyleLearningDraft
} from "./texting-style-learning";

const grid = document.querySelector<HTMLElement>(".grid");
if (!grid) throw new Error("TNND dashboard grid was not found.");

const styleFields: Array<{ key: keyof EditablePreferences; label: string }> = [
  { key: "datingGoal", label: "Dating goal" },
  { key: "disclosureStrategy", label: "Disclosure" },
  { key: "formality", label: "Formality" },
  { key: "capitalization", label: "Capitalization" },
  { key: "emojiFrequency", label: "Emoji frequency" },
  { key: "abbreviations", label: "Abbreviations" },
  { key: "messageLength", label: "Message length" },
  { key: "punctuationDensity", label: "Punctuation" },
  { key: "slangLevel", label: "Slang" },
  { key: "fragmentStyle", label: "Fragments" },
  { key: "grammarStyle", label: "Grammar" },
  { key: "directness", label: "Directness" },
  { key: "questionFrequency", label: "Questions" },
  { key: "teasingStyle", label: "Teasing" },
  { key: "humorStyle", label: "Humor" },
  { key: "doubleTexting", label: "Double texting" },
  { key: "frenchStyle", label: "French" },
  { key: "darijaStyle", label: "Darija" },
  { key: "englishStyle", label: "English" }
];

const panel = document.createElement("article");
panel.className = "panel panel-wide";
panel.innerHTML = `
  <div class="panel-heading">
    <div>
      <p class="eyebrow">AI style learning</p>
      <h2>Learn my texting style</h2>
    </div>
    <span class="pill" id="style-learning-status">Not analyzed</span>
  </div>
  <p>Paste examples of messages you wrote. TNND analyzes writing habits only. Nothing is applied to your profile until you review and approve the result.</p>
  <label>
    Message examples
    <textarea id="style-learning-examples" rows="8" maxlength="12000" placeholder="Paste several messages you wrote…"></textarea>
  </label>
  <label>
    <input id="style-learning-retain" type="checkbox" />
    Keep source examples when server-side retention becomes available
  </label>
  <div>
    <button id="style-learning-analyze" type="button">Analyze style</button>
    <button id="style-learning-review" type="button" disabled>Mark reviewed</button>
    <button id="style-learning-apply" type="button" disabled>Approve & apply to profile</button>
  </div>
  <p class="subtle" id="style-learning-message" role="status">Sign in to analyze your texting style.</p>
  <div id="style-learning-analysis" class="preferences-grid" hidden></div>
`;
grid.append(panel);

const examples = panel.querySelector<HTMLTextAreaElement>("#style-learning-examples");
const retain = panel.querySelector<HTMLInputElement>("#style-learning-retain");
const analyzeButton = panel.querySelector<HTMLButtonElement>("#style-learning-analyze");
const reviewButton = panel.querySelector<HTMLButtonElement>("#style-learning-review");
const applyButton = panel.querySelector<HTMLButtonElement>("#style-learning-apply");
const status = panel.querySelector<HTMLElement>("#style-learning-status");
const message = panel.querySelector<HTMLElement>("#style-learning-message");
const analysisContainer = panel.querySelector<HTMLElement>("#style-learning-analysis");

let draft: TextingStyleLearningDraft = createTextingStyleLearningDraft();
let model = "";

function setMessage(value: string): void {
  if (message) message.textContent = value;
}

function refreshAvailability(): void {
  const authenticated = Boolean(readSession());
  if (analyzeButton) analyzeButton.disabled = !authenticated || !draft.sourceExamples.trim();
  if (!authenticated) setMessage("Sign in to analyze your texting style.");
}

function renderAnalysis(): void {
  if (!analysisContainer) return;
  analysisContainer.replaceChildren();
  if (!draft.analysis) {
    analysisContainer.hidden = true;
    if (reviewButton) reviewButton.disabled = true;
    if (applyButton) applyButton.disabled = true;
    return;
  }

  analysisContainer.hidden = false;
  for (const field of styleFields) {
    const label = document.createElement("label");
    label.textContent = field.label;
    const input = document.createElement("input");
    input.type = "text";
    input.value = draft.analysis[field.key];
    input.dataset.styleField = field.key;
    input.addEventListener("input", () => {
      draft = editStyleAnalysis(draft, { [field.key]: input.value } as Partial<EditablePreferences>);
      if (status) status.textContent = "Edited · review required";
      if (reviewButton) reviewButton.disabled = false;
      if (applyButton) applyButton.disabled = true;
    });
    label.append(input);
    analysisContainer.append(label);
  }

  if (reviewButton) reviewButton.disabled = false;
  if (applyButton) applyButton.disabled = !draft.reviewed;
}

examples?.addEventListener("input", () => {
  draft = setStyleExamples(draft, examples.value, retain?.checked === true);
  if (status) status.textContent = "Not analyzed";
  renderAnalysis();
  refreshAvailability();
});

retain?.addEventListener("change", () => {
  draft = setStyleExamples(draft, examples?.value ?? draft.sourceExamples, retain.checked);
  if (status) status.textContent = "Not analyzed";
  renderAnalysis();
  refreshAvailability();
});

analyzeButton?.addEventListener("click", async () => {
  if (!readSession()) {
    setMessage("Sign in before analyzing examples.");
    return;
  }
  if (!draft.sourceExamples.trim()) {
    setMessage("Paste at least one message example first.");
    return;
  }

  analyzeButton.disabled = true;
  setMessage("Analyzing your texting habits…");
  try {
    const result = await analyzeTextingStyle(draft, { retainSourceExamples: retain?.checked === true });
    draft = result.draft;
    model = result.model;
    if (status) status.textContent = "Analysis ready · review required";
    setMessage(result.retainedSourceExamples
      ? `Analysis ready with ${model}. Source examples retained.`
      : `Analysis ready with ${model}. Source examples were not stored.`);
    renderAnalysis();
  } catch (error) {
    setMessage(error instanceof Error ? error.message : "Unable to analyze texting style.");
  } finally {
    refreshAvailability();
  }
});

reviewButton?.addEventListener("click", () => {
  try {
    draft = markStyleAnalysisReviewed(draft);
    if (status) status.textContent = "Reviewed · approval required";
    if (applyButton) applyButton.disabled = false;
    setMessage("Review recorded. Nothing has been applied yet.");
  } catch (error) {
    setMessage(error instanceof Error ? error.message : "Unable to mark analysis reviewed.");
  }
});

applyButton?.addEventListener("click", async () => {
  if (!readSession()) {
    setMessage("Sign in before applying the learned style.");
    return;
  }
  try {
    draft = approveStyleAnalysis(draft);
    const preferences = approvedStylePreferences(draft);
    if (!preferences) throw new Error("style_analysis_approval_required");
    const profile = await fetchProfile();
    if (!profile) throw new Error("profile_not_found");
    applyButton.disabled = true;
    await saveProfile(writeEditablePreferences(profile, preferences));
    if (status) status.textContent = "Approved & applied";
    setMessage("Approved style saved to your backend profile.");
    window.dispatchEvent(new CustomEvent("tnnd:profile-changed"));
  } catch (error) {
    if (applyButton) applyButton.disabled = false;
    setMessage(error instanceof Error ? error.message : "Unable to apply learned style.");
  }
});

window.addEventListener("tnnd:auth-session-changed", refreshAvailability);
refreshAvailability();
