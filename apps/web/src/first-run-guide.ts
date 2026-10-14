import { readSession } from "./auth-client";
import { shouldShowGuidedTour } from "./overview-onboarding-state";

/**
 * Optional, local-only walkthrough. It never performs a network mutation:
 * every primary action merely navigates to the corresponding real control.
 */
const steps = [
  {
    title: "Connect your TNND account",
    description: "Sign in once. Your conversations and personal settings will be stored securely in TNND.",
    location: "#auth-panel",
    action: "Go to sign in",
    expected: "The account badge says Connected."
  },
  {
    title: "Configure and test Gemini",
    description: "Save your Gemini model and API key. Then click Test connection. This verifies the provider before drafting.",
    location: "#ai-provider-panel",
    action: "Open Gemini settings",
    expected: "Gemini reports a successful connection."
  },
  {
    title: "Approve who you are",
    description: "Add an About Me, analyze it once and approve the extracted facts so replies sound like you.",
    location: "#identity-builder-panel",
    action: "Open Identity Builder",
    expected: "Identity approved appears."
  },
  {
    title: "Import one Tinder chat",
    description: "Open an existing chat on Tinder. In the extension click Import visible chat (read-only), then return here.",
    location: "#conversation-panel",
    action: "Open Conversations",
    expected: "One conversation appears with status Synced. Keep it paused and unmanaged for testing."
  },
  {
    title: "Test one draft, without sending",
    description: "Select a synced conversation and choose Generate a reply. TNND uses the latest saved incoming message; you only type a custom message for optional testing. No message is sent to Tinder.",
    location: "#conversation-panel",
    action: "Try your first draft",
    expected: "Draft ready and a copy button appear. If not, read the error guidance and export diagnostics."
  }
] as const;
const key = "tnnd-web-guide-complete-v1";
const grid = document.getElementById("conversation-workspace");
if (!grid) throw new Error("TNND workspace missing");
const panel = document.createElement("article");
panel.id = "first-run-guide-panel";
panel.className = "panel panel-wide first-run-guide-panel";
panel.setAttribute("aria-label", "TNND getting started tutorial");
panel.innerHTML = `
  <div class="panel-heading">
    <div><p class="eyebrow">First steps / Guided mode</p><h2>Start here · One task at a time</h2></div>
    <span class="pill" id="guide-progress">1 of 5</span>
  </div>
  <div class="guide-main">
    <h3 id="guide-title"></h3>
    <p id="guide-description"></p>
    <p class="guide-expected"><strong>What success looks like:</strong> <span id="guide-expected"></span></p>
    <div class="guide-actions">
      <a id="guide-go" class="guide-primary" href="#workspace-overview"></a>
      <button type="button" id="guide-previous" class="secondary">Back</button>
      <button type="button" id="guide-next" class="secondary">Next step</button>
      <button type="button" id="guide-dismiss" class="secondary">Finish tutorial</button>
    </div>
    <p class="subtle">This guide does not change your account or send messages. You can reopen it from Overview at any time.</p>
  </div>
`;
grid.prepend(panel);
const progress = panel.querySelector<HTMLElement>("#guide-progress")!;
const title = panel.querySelector<HTMLElement>("#guide-title")!;
const description = panel.querySelector<HTMLElement>("#guide-description")!;
const expected = panel.querySelector<HTMLElement>("#guide-expected")!;
const go = panel.querySelector<HTMLAnchorElement>("#guide-go")!;
const previous = panel.querySelector<HTMLButtonElement>("#guide-previous")!;
const next = panel.querySelector<HTMLButtonElement>("#guide-next")!;
const dismiss = panel.querySelector<HTMLButtonElement>("#guide-dismiss")!;
let index = readSession() ? 1 : 0;
function render(): void {
  const step = steps[index];
  progress.textContent = `${index + 1} of ${steps.length}`;
  title.textContent = step.title;
  description.textContent = step.description;
  expected.textContent = step.expected;
  go.href = step.location;
  go.textContent = step.action + " →";
  previous.hidden = index === 0;
  next.hidden = index === steps.length - 1;
  dismiss.textContent = index === steps.length - 1 ? "Done — hide guide" : "Skip tutorial";
}
previous.addEventListener("click", () => { index = Math.max(0, index - 1); render(); });
next.addEventListener("click", () => { index = Math.min(steps.length - 1, index + 1); render(); });
let reopenedManually = false;
let setupComplete = document.querySelector<HTMLElement>("#setup-guidance-panel")?.dataset.setupComplete === "true";
function updateGuideVisibility(): void {
  panel.hidden = !shouldShowGuidedTour({
    dismissed: localStorage.getItem(key) === "yes",
    setupComplete,
    reopenedManually
  });
}
dismiss.addEventListener("click", () => {
  reopenedManually = false;
  localStorage.setItem(key, "yes");
  updateGuideVisibility();
});
render();
window.addEventListener("tnnd:auth-session-changed", () => {
  // Another session cannot inherit the previous account's setup completion.
  setupComplete = false;
  updateGuideVisibility();
  if (readSession() && index === 0) {
    index = 1;
    render();
  }
});
updateGuideVisibility();
window.addEventListener("tnnd:setup-completion-changed", (event: Event) => {
  setupComplete = (event as CustomEvent<{ complete: boolean }>).detail?.complete === true;
  updateGuideVisibility();
});
// When a user who has finished the tour wants to see it again, Overview
// always has a small discoverable link. No extra prominent dashboard buttons.
const reopen = document.createElement("a");
reopen.href = "#first-run-guide-panel";
reopen.className = "guide-reopen";
reopen.textContent = "Need help? Open the 5-step guide";
const topbar = document.querySelector(".topbar");
topbar?.append(reopen);
reopen.addEventListener("click", () => {
  reopenedManually = true;
  localStorage.removeItem(key);
  updateGuideVisibility();
  render();
});
