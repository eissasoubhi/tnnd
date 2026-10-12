import "./styles.css";
import "./neo-bento.css";
import { bindActionCenter, loadHumanActions, readHumanActions, renderActionCenter, type HumanActionItem } from "./action-center";
import { readSession } from "./auth-client";
import { fetchProfile, saveProfile } from "./profile-client";
import { downloadProfile, parseImportedProfile, type ImportedProfile } from "./profile-import";
import { datingGoals, disclosureStrategies, readEditablePreferences, writeEditablePreferences } from "./profile-preferences";
import { groupForPanelId, viewForHash, workspaceCopy, type WorkspaceView } from "./workspace-sections";

let optionalPanelsLoaded = false;

async function loadOptionalPanels(): Promise<void> {
  if (optionalPanelsLoaded || !readSession()) return;
  optionalPanelsLoaded = true;
  for (const loader of [
    () => import("./ai-provider-panel"),
    () => import("./identity-builder-panel"),
    () => import("./personal-memory-panel"),
    () => import("./conversation-panel"),
    () => import("./conversation-overrides-panel"),
    () => import("./conversation-quick-filters"),
    () => import("./conversation-action-indicator"),
    () => import("./conversation-takeover-onboarding"),
    () => import("./conversation-management-panel"),
    () => import("./conversation-management-badges"),
    () => import("./dating-goal-details-panel"),
    () => import("./texting-style-learning-panel"),
    () => import("./analytics-panel"),
    () => import("./account-privacy-panel"),
    () => import("./setup-guidance-panel")
  ]) {
    await new Promise<void>((resolve) => globalThis.setTimeout(resolve, 0));
    try {
      await loader();
    } catch (error) {
      console.error("Unable to load an optional TNND panel", error);
    }
  }
}

type ConversationState = "Active" | "Waiting for them" | "Action required" | "Paused";

interface DashboardCard {
  label: string;
  value: number;
  state: ConversationState;
}

const cards: DashboardCard[] = [
  { label: "Active conversations", value: 0, state: "Active" },
  { label: "Waiting for them", value: 0, state: "Waiting for them" },
  { label: "Human actions", value: 0, state: "Action required" },
  { label: "Paused", value: 0, state: "Paused" }
];

const storageKey = "tnnd:web:imported-profile";
const maxLocalProfileBytes = 512 * 1024;
const app = document.querySelector<HTMLElement>("#app");
if (!app) throw new Error("TNND web app root was not found.");

const options = (values: readonly string[]) => values.map((value) => `<option value="${value}">${value}</option>`).join("");

function initWorkspaceNavigation(): void {
  const nav = document.querySelector<HTMLElement>(".workspace-nav");
  const grid = document.querySelector<HTMLElement>("#conversation-workspace");
  const shell = document.querySelector<HTMLElement>(".shell");
  const title = document.querySelector<HTMLElement>("#workspace-title");
  const description = document.querySelector<HTMLElement>("#workspace-description");
  const sectionLabel = document.querySelector<HTMLElement>("#workspace-location");
  const empty = document.querySelector<HTMLElement>("#workspace-section-empty");
  if (!nav || !grid || !shell) return;

  const links = Array.from(nav.querySelectorAll<HTMLAnchorElement>('a[href^="#"]'));
  let lastScrolledHash = "";
  const update = (): void => {
    const targetId = decodeURIComponent(window.location.hash.slice(1)) || "workspace-overview";
    const target = document.getElementById(targetId);
    const panelId = target?.closest<HTMLElement>(".panel")?.id ?? "";
    const view: WorkspaceView = viewForHash(window.location.hash, panelId);
    shell.dataset.workspaceView = view;
    if (title) title.textContent = workspaceCopy[view].title;
    if (description) description.textContent = workspaceCopy[view].subtitle;
    if (sectionLabel) sectionLabel.textContent = workspaceCopy[view].label;
    for (const link of links) {
      const linkView = viewForHash(link.hash);
      if (linkView === view) link.setAttribute("aria-current", "location");
      else link.removeAttribute("aria-current");
    }
    let visible = 0;
    for (const panel of Array.from(grid.children)) {
      if (!(panel instanceof HTMLElement) || panel === empty) continue;
      const group = groupForPanelId(panel.id);
      const show = group === view || (view === "overview" && panel.id === "auth-panel" && !readSession());
      panel.hidden = !show;
      if (show) visible++;
    }
    if (empty) {
      empty.hidden = visible > 0 || view === "overview";
      if (!empty.hidden) {
        const label = empty.querySelector<HTMLElement>("[data-empty-view]");
        if (label) label.textContent = workspaceCopy[view].label;
      }
    }
    if (window.location.hash && target && lastScrolledHash !== window.location.hash) {
      lastScrolledHash = window.location.hash;
      const navigationLink = links.some((link) => link.hash === window.location.hash);
      const scrollTarget = navigationLink ? document.querySelector(".topbar") : target;
      window.requestAnimationFrame(() => scrollTarget?.scrollIntoView({ block: "start" }));
    }
  };
  window.addEventListener("hashchange", update);
  const observer = new MutationObserver(update);
  observer.observe(grid, { childList: true });
  window.addEventListener("tnnd:auth-session-changed", update);
  update();
}

app.innerHTML = `
  <section class="shell">
    <header class="topbar" id="workspace-overview">
      <div>
        <p class="eyebrow">TNND / <span id="workspace-location">Overview</span></p>
        <h1 id="workspace-title">Your conversation universe.</h1>
        <p class="subtle" id="workspace-description">A quick view of your conversations, setup and next steps.</p>
      </div>
      <span class="status">Private by design</span>
    </header>

    <nav class="workspace-nav" aria-label="Workspace sections"><a href="#workspace-overview" aria-current="location">Overview</a><a href="#conversation-panel">Conversations</a><a href="#identity-builder-panel">Identity</a><a href="#personal-memory-panel">Memories</a><a href="#action-center-section">Action Center</a><a href="#analytics-panel">Analytics</a><a href="#profile-settings">Settings</a></nav>

    <section class="metrics" aria-label="Conversation overview">
      ${cards.map((card) => `
        <article class="metric">
          <span>${card.label}</span>
          <strong data-metric-state="${card.state}">${card.value}</strong>
          <small>${card.state}</small>
        </article>
      `).join("")}
    </section>

    <section class="grid" id="conversation-workspace">
      <div id="workspace-section-empty" class="workspace-empty-state" hidden><h2>No <span data-empty-view>items</span> yet</h2><p>This space becomes available when you connect your account and complete the initial setup.</p><a href="#workspace-overview">Go to setup overview →</a></div>
      <article class="panel" id="profile-import-panel">
        <div class="panel-heading">
          <div>
            <p class="eyebrow">Backup</p>
            <h2>Import & export</h2>
          </div>
          <span class="pill" id="profile-status">No profile</span>
        </div>
        <p>Import a schema-versioned TNND profile JSON. Secrets such as Gemini API keys do not belong in this file.</p>
        <input id="profile-file" type="file" accept="application/json,.json" />
        <button id="profile-export" type="button">Export current profile</button>
        <p class="subtle" id="profile-message" role="status"></p>
      </article>

      <article class="panel panel-wide" id="profile-settings">
        <div class="panel-heading">
          <div>
            <p class="eyebrow">Preferences</p>
            <h2>Dating goal & texting identity</h2><p class="subtle">Choose your normal style, then independently allow each preference to adapt. The baseline stays unchanged, even during a serious conversation. Manual chat overrides always win.</p>
          </div>
          <span class="pill" id="preferences-status">Import a profile first</span>
        </div>
        <div class="preferences-grid" id="profile-preferences-grid">
          <label>Dating goal<select id="dating-goal">${options(datingGoals)}</select></label>
          <label>Disclosure<select id="disclosure-strategy">${options(disclosureStrategies)}</select></label>
          <label>Formality<select id="text-formality"><option value="very-casual">very-casual</option><option value="casual">casual</option><option value="neutral">neutral</option></select></label>
          <label>Capitalization<select id="capitalization"><option value="relaxed">relaxed</option><option value="standard">standard</option><option value="lowercase-heavy">lowercase-heavy</option></select></label>
          <label>Emoji frequency<select id="emoji-frequency"><option value="none">none</option><option value="low">low</option><option value="medium">medium</option></select></label>
          <label>Abbreviations<select id="abbreviations"><option value="low">low</option><option value="medium">medium</option><option value="high">high</option></select></label>
          <div class="adaptive-preference"><label>Message length<select id="message-length"><option value="very-short">very-short</option><option value="short">short</option><option value="medium">medium</option></select></label><label class="adaptive-toggle"><input id="adapt-message-length" type="checkbox" checked> Auto-adapt</label></div>
          <label>Punctuation<select id="punctuation-density"><option value="none">none</option><option value="low">low</option><option value="medium">medium</option><option value="high">high</option></select></label>
          <label>Slang level<select id="slang-level"><option value="none">none</option><option value="low">low</option><option value="medium">medium</option><option value="high">high</option></select></label>
          <label>Fragments<select id="fragment-style"><option value="sentences">sentences</option><option value="mixed">mixed</option><option value="fragment-heavy">fragment-heavy</option></select></label>
          <label>Grammar<select id="grammar-style"><option value="clean">clean</option><option value="casual">casual</option><option value="very-casual">very-casual</option></select></label>
          <div class="adaptive-preference"><label>Directness<select id="directness"><option value="soft">soft</option><option value="balanced">balanced</option><option value="direct">direct</option><option value="very-direct">very-direct</option></select></label><label class="adaptive-toggle"><input id="adapt-directness" type="checkbox" checked> Auto-adapt</label></div>
          <label>Question frequency<select id="question-frequency"><option value="low">low</option><option value="medium">medium</option><option value="high">high</option></select></label>
          <div class="adaptive-preference"><label>Teasing<select id="teasing-style"><option value="none">none</option><option value="light">light</option><option value="playful">playful</option><option value="bold">bold</option></select></label><label class="adaptive-toggle"><input id="adapt-teasing-style" type="checkbox" checked> Auto-adapt</label></div>
          <div class="adaptive-preference"><label>Humor<select id="humor-style"><option value="dry">dry</option><option value="playful">playful</option><option value="witty">witty</option><option value="mixed">mixed</option></select></label><label class="adaptive-toggle"><input id="adapt-humor-style" type="checkbox" checked> Auto-adapt</label></div>
          <div class="adaptive-preference"><label>Double texting<select id="double-texting"><option value="avoid">avoid</option><option value="sometimes">sometimes</option><option value="comfortable">comfortable</option></select></label><label class="adaptive-toggle"><input id="adapt-double-texting" type="checkbox" checked> Auto-adapt</label></div>
          <label>French behavior<select id="french-style"><option value="neutral">neutral</option><option value="casual">casual</option><option value="very-casual">very-casual</option></select></label>
          <label>Darija behavior<select id="darija-style"><option value="light">light</option><option value="natural">natural</option><option value="darija-heavy">darija-heavy</option></select></label>
          <label>English behavior<select id="english-style"><option value="neutral">neutral</option><option value="casual">casual</option><option value="very-casual">very-casual</option></select></label>
          <div class="adaptive-preference adaptive-languages"><label class="adaptive-toggle"><input id="adapt-languages" type="checkbox" checked> Auto-adapt language across English, French & Darija</label><small>Language styles above remain your defaults; language mixing follows the conversation.</small></div>
          <label>Temporary Tinder profile retention (days)<input id="match-profile-retention-days" type="number" min="1" max="30" step="1" value="7" /></label>
        </div>
        <button id="preferences-save" type="button">Save preferences</button>
        <p class="subtle">Signed-in profiles are stored in the backend. Browser storage is only a disconnected fallback.</p>
      </article>

      <article class="panel panel-wide" id="action-center-section">
        <div class="panel-heading">
          <div>
            <p class="eyebrow">Operations</p>
            <h2>Action Center</h2>
          </div>
          <span class="pill" id="action-count">0 pending</span>
        </div>
        <div id="action-center"></div>
      </article>
    </section>
  </section>
`;

void import("./auth-panel").then(() => loadOptionalPanels()).catch((error) => {
  console.error("Unable to load TNND authentication panel", error);
});
window.addEventListener("tnnd:auth-session-changed", () => {
  void loadOptionalPanels();
});

const status = document.querySelector<HTMLElement>("#profile-status");
const message = document.querySelector<HTMLElement>("#profile-message");
const input = document.querySelector<HTMLInputElement>("#profile-file");
const exportButton = document.querySelector<HTMLButtonElement>("#profile-export");
const preferencesStatus = document.querySelector<HTMLElement>("#preferences-status");
const preferencesSave = document.querySelector<HTMLButtonElement>("#preferences-save");
const datingGoal = document.querySelector<HTMLSelectElement>("#dating-goal");
const disclosureStrategy = document.querySelector<HTMLSelectElement>("#disclosure-strategy");
const textFormality = document.querySelector<HTMLSelectElement>("#text-formality");
const capitalization = document.querySelector<HTMLSelectElement>("#capitalization");
const emojiFrequency = document.querySelector<HTMLSelectElement>("#emoji-frequency");
const abbreviations = document.querySelector<HTMLSelectElement>("#abbreviations");
const messageLength = document.querySelector<HTMLSelectElement>("#message-length");
const punctuationDensity = document.querySelector<HTMLSelectElement>("#punctuation-density");
const slangLevel = document.querySelector<HTMLSelectElement>("#slang-level");
const fragmentStyle = document.querySelector<HTMLSelectElement>("#fragment-style");
const grammarStyle = document.querySelector<HTMLSelectElement>("#grammar-style");
const directness = document.querySelector<HTMLSelectElement>("#directness");
const questionFrequency = document.querySelector<HTMLSelectElement>("#question-frequency");
const teasingStyle = document.querySelector<HTMLSelectElement>("#teasing-style");
const humorStyle = document.querySelector<HTMLSelectElement>("#humor-style");
const doubleTexting = document.querySelector<HTMLSelectElement>("#double-texting");
const frenchStyle = document.querySelector<HTMLSelectElement>("#french-style");
const darijaStyle = document.querySelector<HTMLSelectElement>("#darija-style");
const englishStyle = document.querySelector<HTMLSelectElement>("#english-style");
const matchProfileRetentionDays = document.querySelector<HTMLInputElement>("#match-profile-retention-days");
const adaptiveCheckboxes = {
  messageLength: document.querySelector<HTMLInputElement>("#adapt-message-length"),
  directness: document.querySelector<HTMLInputElement>("#adapt-directness"),
  teasingStyle: document.querySelector<HTMLInputElement>("#adapt-teasing-style"),
  humorStyle: document.querySelector<HTMLInputElement>("#adapt-humor-style"),
  doubleTexting: document.querySelector<HTMLInputElement>("#adapt-double-texting"),
  languages: document.querySelector<HTMLInputElement>("#adapt-languages")
};
const actionCenter = document.querySelector<HTMLElement>("#action-center");
const actionCount = document.querySelector<HTMLElement>("#action-count");
const humanActionMetric = document.querySelector<HTMLElement>('[data-metric-state="Action required"]');

let currentProfile: ImportedProfile | null = null;

function loadFallbackProfile(): ImportedProfile | null {
  const raw = localStorage.getItem(storageKey);
  if (!raw) return null;
  if (raw.length > maxLocalProfileBytes) {
    localStorage.removeItem(storageKey);
    return null;
  }
  const parsed = parseImportedProfile(raw);
  if (!parsed.ok) {
    localStorage.removeItem(storageKey);
    return null;
  }
  return parsed.profile;
}

function setProfile(profile: ImportedProfile | null, source: "backend" | "local" | "none"): void {
  currentProfile = profile;
  if (status) status.textContent = profile ? `Schema v${profile.schemaVersion} · ${source}` : "No profile";
  if (exportButton) exportButton.disabled = !profile;
  refreshPreferences(profile);
}

async function refreshProfile(): Promise<void> {
  if (!readSession()) {
    setProfile(loadFallbackProfile(), localStorage.getItem(storageKey) ? "local" : "none");
    if (message) message.textContent = "Sign in to sync your profile with the backend.";
    return;
  }

  if (message) message.textContent = "Loading profile from backend…";
  try {
    const profile = await fetchProfile();
    setProfile(profile, profile ? "backend" : "none");
    if (message) message.textContent = profile ? "Profile loaded from backend." : "No backend profile yet. Import one to create it.";
  } catch (error) {
    setProfile(loadFallbackProfile(), localStorage.getItem(storageKey) ? "local" : "none");
    if (message) message.textContent = error instanceof Error ? `${error.message} Using local fallback when available.` : "Unable to load backend profile.";
  }
}

function refreshPreferences(profile: ImportedProfile | null): void {
  const controls = [datingGoal, disclosureStrategy, textFormality, capitalization, emojiFrequency, abbreviations, messageLength, punctuationDensity, slangLevel, fragmentStyle, grammarStyle, directness, questionFrequency, teasingStyle, humorStyle, doubleTexting, frenchStyle, darijaStyle, englishStyle, matchProfileRetentionDays, ...Object.values(adaptiveCheckboxes), preferencesSave];
  controls.forEach((control) => { if (control) control.disabled = !profile; });
  if (!profile) {
    if (preferencesStatus) preferencesStatus.textContent = "Import a profile first";
    return;
  }

  const preferences = readEditablePreferences(profile);
  if (datingGoal) datingGoal.value = preferences.datingGoal;
  if (disclosureStrategy) disclosureStrategy.value = preferences.disclosureStrategy;
  if (textFormality) textFormality.value = preferences.formality;
  if (capitalization) capitalization.value = preferences.capitalization;
  if (emojiFrequency) emojiFrequency.value = preferences.emojiFrequency;
  if (abbreviations) abbreviations.value = preferences.abbreviations;
  if (messageLength) messageLength.value = preferences.messageLength;
  if (punctuationDensity) punctuationDensity.value = preferences.punctuationDensity;
  if (slangLevel) slangLevel.value = preferences.slangLevel;
  if (fragmentStyle) fragmentStyle.value = preferences.fragmentStyle;
  if (grammarStyle) grammarStyle.value = preferences.grammarStyle;
  if (directness) directness.value = preferences.directness;
  if (questionFrequency) questionFrequency.value = preferences.questionFrequency;
  if (teasingStyle) teasingStyle.value = preferences.teasingStyle;
  if (humorStyle) humorStyle.value = preferences.humorStyle;
  if (doubleTexting) doubleTexting.value = preferences.doubleTexting;
  if (frenchStyle) frenchStyle.value = preferences.frenchStyle;
  if (darijaStyle) darijaStyle.value = preferences.darijaStyle;
  if (englishStyle) englishStyle.value = preferences.englishStyle;
  for (const key of Object.keys(adaptiveCheckboxes) as Array<keyof typeof adaptiveCheckboxes>) {
    const input = adaptiveCheckboxes[key];
    if (input) input.checked = preferences.autoAdapt?.[key] ?? true;
  }
  if (matchProfileRetentionDays) matchProfileRetentionDays.value = String(preferences.temporaryMatchProfileRetentionDays);
  if (preferencesStatus) preferencesStatus.textContent = readSession() ? "Synced" : "Local fallback";
}

function refreshActionCounts(items: HumanActionItem[] = readHumanActions()): void {
  const pending = items.filter((item) => item.status === "pending").length;
  if (actionCount) actionCount.textContent = `${pending} pending`;
  if (humanActionMetric) humanActionMetric.textContent = String(pending);
}

async function refreshActionCenter(): Promise<void> {
  if (!actionCenter) return;
  try {
    const items = await loadHumanActions();
    renderActionCenter(actionCenter, items);
    refreshActionCounts(items);
  } catch (error) {
    const fallback = readHumanActions();
    renderActionCenter(actionCenter, fallback);
    refreshActionCounts(fallback);
    console.error("Unable to load TNND actions", error);
  }
}

async function persistProfile(profile: ImportedProfile): Promise<void> {
  if (readSession()) {
    currentProfile = await saveProfile(profile);
    localStorage.removeItem(storageKey);
    setProfile(currentProfile, "backend");
    window.dispatchEvent(new CustomEvent("tnnd:profile-updated"));
    return;
  }
  localStorage.setItem(storageKey, JSON.stringify(profile));
  setProfile(profile, "local");
  window.dispatchEvent(new CustomEvent("tnnd:profile-updated"));
}

input?.addEventListener("change", async () => {
  const file = input.files?.[0];
  if (!file) return;
  const parsed = parseImportedProfile(await file.text());
  if (!parsed.ok) {
    if (message) message.textContent = parsed.error;
    return;
  }

  try {
    await persistProfile(parsed.profile);
    if (message) message.textContent = readSession() ? "Profile imported and saved to backend." : "Profile imported locally. Sign in to move it to backend storage.";
  } catch (error) {
    if (message) message.textContent = error instanceof Error ? error.message : "Unable to save profile.";
  }
});

exportButton?.addEventListener("click", () => {
  if (currentProfile) downloadProfile(currentProfile);
});

preferencesSave?.addEventListener("click", async () => {
  if (!currentProfile || !datingGoal || !disclosureStrategy || !textFormality || !capitalization || !emojiFrequency || !abbreviations || !messageLength || !punctuationDensity || !slangLevel || !fragmentStyle || !grammarStyle || !directness || !questionFrequency || !teasingStyle || !humorStyle || !doubleTexting || !frenchStyle || !darijaStyle || !englishStyle || !matchProfileRetentionDays) return;
  const updated = writeEditablePreferences(currentProfile, {
    datingGoal: datingGoal.value,
    disclosureStrategy: disclosureStrategy.value,
    formality: textFormality.value,
    capitalization: capitalization.value,
    emojiFrequency: emojiFrequency.value,
    abbreviations: abbreviations.value,
    messageLength: messageLength.value,
    punctuationDensity: punctuationDensity.value,
    slangLevel: slangLevel.value,
    fragmentStyle: fragmentStyle.value,
    grammarStyle: grammarStyle.value,
    directness: directness.value,
    questionFrequency: questionFrequency.value,
    teasingStyle: teasingStyle.value,
    humorStyle: humorStyle.value,
    doubleTexting: doubleTexting.value,
    frenchStyle: frenchStyle.value,
    darijaStyle: darijaStyle.value,
    englishStyle: englishStyle.value,
    autoAdapt: Object.fromEntries(Object.entries(adaptiveCheckboxes).map(([key, input]) => [key, input?.checked ?? false])) as ReturnType<typeof readEditablePreferences>["autoAdapt"],
    temporaryMatchProfileRetentionDays: Number(matchProfileRetentionDays.value)
  });
  try {
    await persistProfile(updated);
    if (preferencesStatus) preferencesStatus.textContent = readSession() ? "Synced" : "Saved locally";
    if (message) message.textContent = readSession() ? "Preferences saved to backend." : "Preferences saved to local fallback.";
  } catch (error) {
    if (message) message.textContent = error instanceof Error ? error.message : "Unable to save preferences.";
  }
});

window.addEventListener("tnnd:auth-session-changed", () => {
  void refreshProfile();
  void refreshActionCenter();
});
window.addEventListener("tnnd:profile-updated", () => {
  void refreshProfile();
});

function organizeProfilePreferences(): void {
  const original = document.querySelector<HTMLElement>("#profile-preferences-grid");
  if (!original || original.dataset.organized) return;
  original.dataset.organized = "true";
  const groups = [
    { title: "Conversation identity", description: "Your intent and how you present yourself.", expanded: true, ids: ["dating-goal", "disclosure-strategy"] },
    { title: "Your baseline & Auto-adapt", description: "Choose a starting style. TNND adapts without rewriting your preference.", expanded: true, ids: ["message-length", "directness", "teasing-style", "humor-style", "double-texting"] },
    { title: "Language & culture", description: "French, English and Moroccan Darija keep their own natural style.", expanded: true, ids: ["french-style", "darija-style", "english-style", "adapt-languages"] },
    { title: "Writing details", description: "Fine-tune grammar, punctuation and emoji usage when you need to.", expanded: false, ids: ["text-formality", "capitalization", "emoji-frequency", "abbreviations", "punctuation-density", "slang-level", "fragment-style", "grammar-style", "question-frequency"] },
    { title: "Privacy & retention", description: "Choose how long temporary match context remains available.", expanded: false, ids: ["match-profile-retention-days"] }
  ];
  const layout = document.createElement("div");
  layout.className = "preference-sections";
  for (const group of groups) {
    const details = document.createElement("details");
    details.className = "preference-section";
    details.open = group.expanded;
    const summary = document.createElement("summary");
    const heading = document.createElement("strong");
    heading.textContent = group.title;
    const hint = document.createElement("span");
    hint.textContent = group.description;
    summary.append(heading, hint);
    details.append(summary);
    const fields = document.createElement("div");
    fields.className = "preferences-grid preference-section-grid";
    for (const controlId of group.ids) {
      const field: Element | null = original.querySelector("#" + controlId);
      const row: HTMLElement | null = field?.closest(".adaptive-preference") ?? field?.closest("label") ?? null;
      if (row && row.parentElement === original) fields.append(row);
    }
    details.append(fields);
    layout.append(details);
  }
  if (original.children.length) {
    const other = layout.querySelector<HTMLElement>(".preference-section-grid");
    other?.append(...Array.from(original.children));
  }
  original.replaceWith(layout);
}

organizeProfilePreferences();
initWorkspaceNavigation();
if (actionCenter) bindActionCenter(actionCenter, refreshActionCounts);
void refreshActionCenter();
void refreshProfile();
