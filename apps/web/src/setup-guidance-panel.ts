import { readSession } from "./auth-client";
import { createAiProviderClient } from "./ai-provider-client";
import { loadTopicCoverage, updateTopicPreference, avoidedTopicsFromProfile } from "./topic-coverage-client";
import type { TopicInsight } from "../../../src/setup-progress";
import { listPersonalMemories } from "./personal-memory-client";
import { fetchProfile } from "./profile-client";
import { missingStoryRecommendations, profileReadiness, setupProgress, type SetupSnapshot } from "../../../src/setup-progress";

const grid = document.querySelector<HTMLElement>(".grid");
if (!grid) throw new Error("TNND workspace grid was not found.");
const panel = document.createElement("article");
panel.className = "panel panel-wide workspace-feature";
panel.id = "setup-guidance-panel";
panel.innerHTML = `
  <div class="panel-heading">
    <div><p class="eyebrow">Getting started</p><h2>Complete your TNND setup</h2></div>
    <span class="pill" id="setup-progress-percent">Checking…</span>
  </div>
  <p class="subtle">One identity, one account. Complete each essential step once. Add personal stories whenever you are ready.</p>
  <progress id="setup-progress-bar" max="100" value="0" aria-label="TNND setup completion"></progress>
  <ol class="setup-checklist" id="setup-checklist"></ol>
  <p class="subtle" id="setup-load-message" role="status" aria-live="polite"></p>
  <div class="setup-recommendations">
    <h3>Suggestions for your stories</h3>
    <p class="subtle">Based on your most discussed topics across your history and approved Personal Memories. Suggestions never invent your experiences.</p>
    <div id="setup-story-suggestions"></div>
    <button id="setup-recheck" type="button" class="secondary">Recheck progress</button>
  </div>
`;
grid.prepend(panel);
const progressLabel = panel.querySelector<HTMLElement>("#setup-progress-percent")!;
const progressBar = panel.querySelector<HTMLProgressElement>("#setup-progress-bar")!;
const checklist = panel.querySelector<HTMLOListElement>("#setup-checklist")!;
const message = panel.querySelector<HTMLElement>("#setup-load-message")!;
const recommendations = panel.querySelector<HTMLElement>("#setup-story-suggestions")!;
let refreshGeneration = 0;
function renderSteps(snapshot: SetupSnapshot): void {
  const state = setupProgress(snapshot);
  progressLabel.textContent = state.percent === null ? `${state.completed}/4 verified` : `${state.percent}% complete`;
  if (state.percent === null) progressBar.removeAttribute("value");
  else progressBar.value = state.percent;
  checklist.replaceChildren();
  for (const step of state.steps) {
    const item = document.createElement("li");
    const link = document.createElement("a");
    link.href = step.href;
    link.textContent = step.label;
    const flag = document.createElement("span");
    flag.className = "setup-check-state";
    flag.textContent = step.state === "complete" ? "Done" : step.state === "unknown" ? "Check needed" : "To do";
    flag.dataset.state = step.state;
    item.append(link, flag);
    if (state.next?.id === step.id) item.classList.add("setup-next");
    checklist.append(item);
  }
}
function renderStories(
  insights: TopicInsight[],
  memories: Awaited<ReturnType<typeof listPersonalMemories>>,
  avoidedTopics: string[]
): void {
  const missing = missingStoryRecommendations([], memories, Date.now(), insights, avoidedTopics);
  recommendations.replaceChildren();
  if (!missing.length) {
    const hint = document.createElement("p");
    hint.className = "subtle";
    hint.textContent = "No topic-specific gaps detected. You can always add a personal story.";
    recommendations.append(hint);
    return;
  }
  for (const recommendation of missing) {
    const item = document.createElement("div");
    item.className = "setup-story-item";
    const title = document.createElement("strong");
    title.textContent = recommendation.label;
    const explanation = document.createElement("p");
    explanation.className = "subtle";
    explanation.textContent = recommendation.description;
    const link = document.createElement("a");
    link.href = "#personal-memory-panel";
    link.textContent = "Add a real story →";
    link.addEventListener("click", () => {
      const field = document.querySelector<HTMLTextAreaElement>("#memory-source");
      if (field) {
        field.placeholder = recommendation.prompt;
        field.focus();
      }
    });
    const avoid = document.createElement("button");
    avoid.type = "button";
    avoid.className = "secondary";
    avoid.textContent = "Avoid this topic";
    avoid.title = "Stop suggesting this topic and don't bring it up proactively in generated replies.";
    avoid.addEventListener("click", () => {
      const session = readSession();
      if (!session) return;
      avoid.disabled = true;
      void updateTopicPreference(session, recommendation.id, true).then(() => {
        window.dispatchEvent(new CustomEvent("tnnd:profile-updated"));
      }).catch(error => {
        message.textContent = error instanceof Error ? error.message : "Could not save topic preference.";
        avoid.disabled = false;
      });
    });
    item.append(title, explanation, link, avoid);
    recommendations.append(item);
  }
  if (avoidedTopics.length) {
    const heading = document.createElement("h4");
    heading.textContent = "Topics you've chosen to avoid";
    recommendations.append(heading);
    for (const topic of avoidedTopics) {
      const restore = document.createElement("button");
      restore.type = "button";
      restore.className = "secondary";
      restore.textContent = "Restore " + topic;
      restore.addEventListener("click", () => {
        const session = readSession();
        if (!session) return;
        restore.disabled = true;
        void updateTopicPreference(session, topic, false).then(() => {
          window.dispatchEvent(new CustomEvent("tnnd:profile-updated"));
        }).catch(error => {
          message.textContent = error instanceof Error ? error.message : "Could not restore topic.";
          restore.disabled = false;
        });
      });
      recommendations.append(restore);
    }
  }
}
async function refresh(): Promise<void> {
  const generation = ++refreshGeneration;
  const session = readSession();
  if (!session) {
    renderSteps({ signedIn: false, identityApproved: false, geminiConfigured: false, preferencesConfigured: false });
    recommendations.textContent = "Sign in to receive recommendations.";
    message.textContent = "Connect your account to begin.";
    return;
  }
  message.textContent = "Checking account setup and story coverage…";
  const results = await Promise.allSettled([
    fetchProfile(),
    createAiProviderClient(session.token).getSettings(),
    listPersonalMemories(session),
    loadTopicCoverage(session)
  ] as const);
  if (generation !== refreshGeneration || readSession()?.user.id !== session.user.id) return;
  const [profileResult, geminiResult, memoriesResult, coverageResult] = results;
  const profile = profileResult.status === "fulfilled" ? profileResult.value : null;
  const readiness = profileResult.status === "fulfilled" ? profileReadiness(profile) : null;
  renderSteps({
    signedIn: true,
    identityApproved: readiness?.identityApproved ?? null,
    geminiConfigured: geminiResult.status === "fulfilled" ? geminiResult.value.configured : null,
    preferencesConfigured: readiness?.preferencesConfigured ?? null
  });
  if (memoriesResult.status === "fulfilled" && coverageResult.status === "fulfilled" && profileResult.status === "fulfilled") {
    renderStories(coverageResult.value, memoriesResult.value, avoidedTopicsFromProfile(profile));
  } else {
    recommendations.textContent = "Story suggestions are unavailable right now. Try again later.";
  }
  message.textContent = results.some(result => result.status === "rejected")
    ? "Some information could not be verified. Unavailable steps are not counted as completed."
    : "Your progress is based on data saved in TNND, not manual checkboxes.";
}
panel.querySelector("#setup-recheck")?.addEventListener("click", () => { void refresh(); });
for (const event of ["tnnd:auth-session-changed", "tnnd:profile-updated", "tnnd:ai-provider-updated", "tnnd:personal-memory-updated", "tnnd:conversation-updated"]) {
  window.addEventListener(event, () => { void refresh(); });
}
void refresh();
