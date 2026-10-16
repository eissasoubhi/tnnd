import "./styles.css";
import "./neo-bento.css";
import { bindActionCenter, loadHumanActions, readHumanActions, renderActionCenter, resetActionCenterSession, type HumanActionItem } from "./action-center";
import { isLatestSessionResponse } from "./workspace-request-guard";
import { readSession } from "./auth-client";
import { listConversations } from "./conversation-client";
import { countOverviewStatuses } from "./overview-metrics";
import { fetchProfile, saveProfile } from "./profile-client";
import { downloadProfile, parseImportedProfile, type ImportedProfile } from "./profile-import";
import { datingGoals, disclosureStrategies, readEditablePreferences, writeEditablePreferences } from "./profile-preferences";
import { initWorkspaceScrollNavigation } from "./workspace-scroll-navigation";
import { webBuildInfo } from "./web-build-label";
import { preferenceSections } from "./preference-sections";

let optionalPanelsLoaded = false;

async function loadOptionalPanels(): Promise<void> {
  if (optionalPanelsLoaded || !readSession()) return;
  optionalPanelsLoaded = true;
  for (const loader of [
    () => import("./ai-provider-panel"),
    () => import("./smart-auto-swipe-panel"),
    () => import("./identity-builder-panel"),
    () => import("./personal-memory-panel"),
    () => import("./conversation-panel"),
    () => import("./conversation-attention-panel"),
    () => import("./conversation-overrides-panel"),
    () => import("./conversation-quick-filters"),
    () => import("./conversation-action-indicator"),
    () => import("./conversation-takeover-onboarding"),
    () => import("./conversation-management-panel"),
    () => import("./conversation-management-badges"),
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

    <nav class="workspace-nav" aria-label="Workspace sections"><a href="#workspace-overview" aria-current="location">Overview</a><a href="#workspace-conversations-section">Conversations</a><a href="#workspace-identity-section">Identity</a><a href="#workspace-memories-section">Memories</a><a href="#workspace-actions-section">Action Center</a><a href="#workspace-attention-section">Attention</a><a href="#workspace-analytics-section">Analytics</a><a href="#workspace-settings-section">Settings</a></nav>

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
        <label for="profile-file">Profile JSON file</label>
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
          <div class="dating-goal-editor"><h3>Your locations · separate facts</h3><p class="subtle">Home and current location are different. Tinder Passport cities do NOT prove where you are. Leave unknown neighborhoods empty: Léa must ask you rather than invent them.</p><label>City of origin<input id="origin-city" maxlength="120" placeholder="Casablanca"></label><label>Usual residence city<input id="residence-city" maxlength="120" placeholder="Paris"></label><label>Current city (update when traveling)<input id="current-city" maxlength="120" placeholder="Paris, Casablanca or Rabat"></label><label>Origin neighborhood (optional)<input id="origin-neighborhood" maxlength="120" placeholder="Leave blank if unknown"></label><label>Residence neighborhood (optional)<input id="residence-neighborhood" maxlength="120" placeholder="Leave blank if unknown"></label></div><label>Dating goal<select id="dating-goal">${options(datingGoals)}</select></label><div class="dating-goal-editor"><label for="target-cities">Cities where you want to meet matches (Tinder Passport)</label><p class="subtle" id="target-cities-help">Separate from where you currently live. Enter cities separated by commas, e.g. Paris, Casablanca, Rabat. TNND uses these as preferences, not verified match locations.</p><input id="target-cities" type="text" maxlength="1600" aria-describedby="target-cities-help" placeholder="Paris, Casablanca, Rabat" autocomplete="off"></div>
          <div class="dating-goal-editor">
            <label for="dating-goal-details">What are you looking for? <span class="dating-goal-optional">Optional</span></label>
            <p id="dating-goal-help" class="subtle">Go beyond your dating goal. Describe the kind of connection you want and how you'd like things to develop. This helps TNND suggest replies that match your intentions.</p>
            <textarea id="dating-goal-details" rows="3" maxlength="1000" aria-describedby="dating-goal-help" placeholder="e.g. I'm open to meeting new people and seeing where things go, without rushing or unnecessary drama."></textarea>
            <div class="dating-goal-inspiration">
              <span>Need inspiration? Try an example:</span>
              <div class="dating-goal-example-actions">
                <button type="button" class="secondary" data-goal-example="open">Open to see</button>
                <button type="button" class="secondary" data-goal-example="serious">Something serious</button>
                <button type="button" class="secondary" data-goal-example="casual">Keep it casual</button>
              </div>
              <small>Examples fill the field without saving. You can edit the text before choosing “Save preferences”.</small>
            </div>
          </div>
          <div class="dating-goal-editor">
            <h3>Match screening · Optional rules</h3>
            <p class="subtle">A Tinder “Long-term partner” label does not prove marriage intent. Clarify what the match wants first. Automation only pauses on a clearly confirmed answer when you enable the rule.</p>
            <label><input id="pause-on-marriage" type="checkbox"> Pause after explicit confirmation of marriage intent</label>
            <label for="max-match-height">Pause if verified height exceeds (cm, optional)</label>
            <input id="max-match-height" type="number" min="100" max="230" step="1" placeholder="e.g. 170">
            <label for="marriage-expressions">Expressions suggesting marriage (comma-separated)</label>
            <input id="marriage-expressions" maxlength="1600" placeholder="mariage, se marier">
            <label for="casual-expressions">Expressions suggesting casual intentions (comma-separated)</label>
            <input id="casual-expressions" maxlength="1600" placeholder="plan cul, one night stand">
            <p class="subtle">Custom expressions suggest an intention; they never auto-pause a match. Do not infer height or intentions from photographs.</p>
          </div><label>Disclosure<select id="disclosure-strategy">${options(disclosureStrategies)}</select></label>
          <div class="dating-goal-editor">
            <h3>Contact details & off-app preferences</h3>
            <p class="subtle">Your own verified contact details, used only when appropriate. TNND never invents or shares a handle from the match's name.</p>
            <label>Instagram username or link<input id="profile-instagram" maxlength="160" autocomplete="off" placeholder="@yourusername"></label>
            <label>WhatsApp number or contact link<input id="profile-whatsapp" maxlength="160" autocomplete="off" placeholder="+212…"></label>
            <label>Preferred contact handoff<select id="profile-contact-preference">
              <option value="instagram-first">Instagram first</option>
              <option value="whatsapp-first">WhatsApp first</option>
              <option value="stay-on-tinder">Stay on Tinder</option>
            </select></label>
          </div><div class="dating-goal-editor"><h3>Long replies in multiple bubbles</h3><label><input id="multi-part-replies" type="checkbox"> Sometimes send long replies in 2 separate Tinder bubbles</label><p class="subtle">One generated reply; natural sentence boundary only. 3–10 seconds between bubbles; stop if the match replies or you intervene.</p><label>Minimum reply characters<input id="multi-part-min-characters" type="number" min="90" max="400" step="10" value="150"></label></div><label>Formality<select id="text-formality"><option value="very-casual">very-casual</option><option value="casual">casual</option><option value="neutral">neutral</option></select></label>
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
        <div class="preferences-save-bar">
          <div class="preferences-save-message">
            <strong>Save your preferences</strong>
            <p class="subtle">Changes are applied only after saving. Nothing is sent to Tinder.</p>
            <p id="preferences-save-feedback" role="status" aria-live="polite" class="subtle"></p>
          </div>
          <button id="preferences-save" type="button">Save preferences</button>
        </div>
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

const build = webBuildInfo();
const buildBadge = document.createElement("small");
buildBadge.id = "web-build-version";
buildBadge.className = "workspace-build-version";
buildBadge.textContent = build.label;
buildBadge.title = build.description;
buildBadge.setAttribute("aria-label", build.description);
document.querySelector<HTMLElement>(".workspace-nav")?.append(buildBadge);

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
const preferencesSaveFeedback = document.querySelector<HTMLElement>("#preferences-save-feedback");
const datingGoal = document.querySelector<HTMLSelectElement>("#dating-goal");
const datingGoalDetails = document.querySelector<HTMLTextAreaElement>("#dating-goal-details");
const targetCities = document.querySelector<HTMLInputElement>("#target-cities");
const profileInstagram = document.querySelector<HTMLInputElement>("#profile-instagram");
const profileWhatsapp = document.querySelector<HTMLInputElement>("#profile-whatsapp");
const profileContactPreference = document.querySelector<HTMLSelectElement>("#profile-contact-preference");
const originCity = document.querySelector<HTMLInputElement>("#origin-city");
const residenceCity = document.querySelector<HTMLInputElement>("#residence-city");
const currentCity = document.querySelector<HTMLInputElement>("#current-city");
const originNeighborhood = document.querySelector<HTMLInputElement>("#origin-neighborhood");
const residenceNeighborhood = document.querySelector<HTMLInputElement>("#residence-neighborhood");
const multiPartReplies = document.querySelector<HTMLInputElement>("#multi-part-replies");
const multiPartMinCharacters = document.querySelector<HTMLInputElement>("#multi-part-min-characters");
const pauseOnMarriage = document.querySelector<HTMLInputElement>("#pause-on-marriage");
const maxMatchHeight = document.querySelector<HTMLInputElement>("#max-match-height");
const marriageExpressions = document.querySelector<HTMLInputElement>("#marriage-expressions");
const casualExpressions = document.querySelector<HTMLInputElement>("#casual-expressions");
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
let overviewRefreshId = 0;
async function refreshOverviewMetrics(): Promise<void> {
  const run = ++overviewRefreshId;
  const session = readSession();
  const metric = (status: string): HTMLElement | null => document.querySelector<HTMLElement>('[data-metric-state="' + status + '"]');
  if (!session) {
    for (const state of ["Active", "Waiting for them", "Paused"]) {
      const field = metric(state);
      if (field) field.textContent = "—";
    }
    return;
  }
  try {
    const list = await listConversations(session);
    if (run !== overviewRefreshId || readSession()?.user.id !== session.user.id) return;
    const counts = countOverviewStatuses(list);
    const pairs: Array<[string, number]> = [
      ["Active", counts.active],
      ["Waiting for them", counts.waitingForThem],
      ["Paused", counts.paused]
    ];
    for (const [state, count] of pairs) {
      const field = metric(state);
      if (field) field.textContent = String(count);
    }
  } catch {
    if (run !== overviewRefreshId) return;
    for (const state of ["Active", "Waiting for them", "Paused"]) {
      const field = metric(state);
      if (field) field.textContent = "—";
    }
  }
}
window.addEventListener("tnnd:conversation-updated", () => { void refreshOverviewMetrics(); });
window.addEventListener("tnnd:auth-session-changed", () => { void refreshOverviewMetrics(); });
void refreshOverviewMetrics();


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
  const controls = [datingGoal, datingGoalDetails, targetCities, profileInstagram, profileWhatsapp, profileContactPreference, originCity, residenceCity, currentCity, originNeighborhood, residenceNeighborhood, multiPartReplies, multiPartMinCharacters, pauseOnMarriage, maxMatchHeight, marriageExpressions, casualExpressions, disclosureStrategy, textFormality, capitalization, emojiFrequency, abbreviations, messageLength, punctuationDensity, slangLevel, fragmentStyle, grammarStyle, directness, questionFrequency, teasingStyle, humorStyle, doubleTexting, frenchStyle, darijaStyle, englishStyle, matchProfileRetentionDays, ...Object.values(adaptiveCheckboxes), preferencesSave];
  controls.forEach((control) => { if (control) control.disabled = !profile; });
  if (!profile) {
    if (preferencesStatus) preferencesStatus.textContent = "Import a profile first";
    return;
  }

  const preferences = readEditablePreferences(profile);
  if (datingGoal) datingGoal.value = preferences.datingGoal;
  if (datingGoalDetails) datingGoalDetails.value = preferences.datingGoalDetails ?? "";
  if (targetCities) targetCities.value = preferences.targetCities ?? "";
  if (profileInstagram) profileInstagram.value = preferences.instagram ?? "";
  if (profileWhatsapp) profileWhatsapp.value = preferences.whatsapp ?? "";
  if (profileContactPreference) profileContactPreference.value = preferences.contactPreference ?? "instagram-first";
  if (originCity) originCity.value = preferences.originCity ?? "";
  if (residenceCity) residenceCity.value = preferences.residenceCity ?? "";
  if (currentCity) currentCity.value = preferences.currentCity ?? "";
  if (originNeighborhood) originNeighborhood.value = preferences.originNeighborhood ?? "";
  if (residenceNeighborhood) residenceNeighborhood.value = preferences.residenceNeighborhood ?? "";
  if (multiPartReplies) multiPartReplies.checked = preferences.multiPartRepliesEnabled === true;
  if (multiPartMinCharacters) multiPartMinCharacters.value = String(preferences.multiPartMinCharacters ?? 150);
  if (pauseOnMarriage) pauseOnMarriage.checked = preferences.pauseOnConfirmedMarriage === "true";
  if (maxMatchHeight) maxMatchHeight.value = preferences.maximumHeightCm ?? "";
  if (marriageExpressions) marriageExpressions.value = preferences.marriageExpressions ?? "";
  if (casualExpressions) casualExpressions.value = preferences.casualExpressions ?? "";
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

let actionCenterRequestSequence = 0;
async function refreshActionCenter(): Promise<void> {
  if (!actionCenter) return;
  const requestId = ++actionCenterRequestSequence;
  const session = readSession();
  if (!session) {
    resetActionCenterSession();
    actionCenter.innerHTML = '<div class="action-empty" role="status"><strong>Sign in to review actions</strong><p>Your action queue is only available when your TNND account is connected.</p></div>';
    if (actionCount) actionCount.textContent = "Sign in required";
    if (humanActionMetric) humanActionMetric.textContent = "—";
    return;
  }
  // Loading or API failure must not look like a verified zero-action queue.
  actionCenter.innerHTML = '<p class="workspace-empty" role="status">Checking your pending actions…</p>';
  if (actionCount) actionCount.textContent = "Checking…";
  if (humanActionMetric) humanActionMetric.textContent = "—";
  try {
    const items = await loadHumanActions();
    if (!isLatestSessionResponse(requestId, actionCenterRequestSequence, session.token, readSession()?.token)) return;
    renderActionCenter(actionCenter, items);
    refreshActionCounts(items);
  } catch {
    if (!isLatestSessionResponse(requestId, actionCenterRequestSequence, session.token, readSession()?.token)) return;
    actionCenter.innerHTML = '<div class="action-empty" role="alert"><strong>Action Center unavailable</strong><p>TNND could not verify your current pending actions. Check the API connection and try again. No actions were marked completed.</p><button type="button" id="action-center-retry" class="secondary">Retry</button></div>';
    actionCenter.querySelector<HTMLButtonElement>("#action-center-retry")?.addEventListener("click", () => void refreshActionCenter());
    if (actionCount) actionCount.textContent = "Unavailable";
    if (humanActionMetric) humanActionMetric.textContent = "—";
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

const goalDetailExamples = {
  open: "I'm open to meeting new people, having fun conversations and seeing where things go. I value humor, chemistry and a natural connection without pressure.",
  serious: "I'm looking for a genuine, meaningful connection that could grow into a serious relationship, with honesty, humor and mutual respect.",
  casual: "I'd like to meet someone for easygoing dates, fun conversations and natural chemistry, without rushing into anything serious. Clear communication matters to me."
} as const;
document.querySelectorAll<HTMLButtonElement>("[data-goal-example]").forEach(button => {
  button.addEventListener("click", () => {
    if (!datingGoalDetails || datingGoalDetails.disabled) return;
    const key = button.dataset.goalExample as keyof typeof goalDetailExamples;
    const example = goalDetailExamples[key];
    if (!example) return;
    // Examples are suggestions, never auto-save or overwrite silently.
    if (datingGoalDetails.value.trim() && !window.confirm("Replace your current description with this example?")) return;
    datingGoalDetails.value = example;
    datingGoalDetails.focus();
  });
});

preferencesSave?.addEventListener("click", async () => {
  if (!preferencesSave || !currentProfile || !datingGoal || !datingGoalDetails || !targetCities || !pauseOnMarriage || !maxMatchHeight || !marriageExpressions || !casualExpressions || !disclosureStrategy || !textFormality || !capitalization || !emojiFrequency || !abbreviations || !messageLength || !punctuationDensity || !slangLevel || !fragmentStyle || !grammarStyle || !directness || !questionFrequency || !teasingStyle || !humorStyle || !doubleTexting || !frenchStyle || !darijaStyle || !englishStyle || !matchProfileRetentionDays) return;
  const updated = writeEditablePreferences(currentProfile, {
    datingGoal: datingGoal.value,
    datingGoalDetails: datingGoalDetails.value,
    targetCities: targetCities.value,
    instagram: profileInstagram?.value,
    whatsapp: profileWhatsapp?.value,
    contactPreference: profileContactPreference?.value as "instagram-first" | "whatsapp-first" | "stay-on-tinder" | undefined,
    originCity: originCity?.value,
    residenceCity: residenceCity?.value,
    currentCity: currentCity?.value,
    originNeighborhood: originNeighborhood?.value,
    residenceNeighborhood: residenceNeighborhood?.value,
    multiPartRepliesEnabled: multiPartReplies?.checked,
    multiPartMinCharacters: multiPartMinCharacters?.valueAsNumber,
    pauseOnConfirmedMarriage: String(pauseOnMarriage.checked),
    maximumHeightCm: maxMatchHeight.value,
    marriageExpressions: marriageExpressions.value,
    casualExpressions: casualExpressions.value,
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
  preferencesSave.disabled = true;
  if (preferencesSaveFeedback) preferencesSaveFeedback.textContent = "Saving preferences…";
  try {
    await persistProfile(updated);
    if (preferencesStatus) preferencesStatus.textContent = readSession() ? "Synced" : "Saved locally";
    const success = readSession() ? "Preferences saved to TNND." : "Preferences saved locally. Sign in to sync them.";
    if (message) message.textContent = success;
    if (preferencesSaveFeedback) preferencesSaveFeedback.textContent = success;
  } catch (error) {
    const failure = error instanceof Error ? error.message : "Unable to save preferences. Check your connection and try again.";
    if (message) message.textContent = failure;
    if (preferencesSaveFeedback) preferencesSaveFeedback.textContent = failure;
  } finally {
    preferencesSave.disabled = false;
  }
});

window.addEventListener("tnnd:auth-session-changed", () => {
  resetActionCenterSession();
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
  const layout = document.createElement("div");
  layout.className = "preference-sections";
  for (const group of preferenceSections) {
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
      const row: HTMLElement | null = field?.closest(".adaptive-preference") ?? field?.closest(".dating-goal-editor") ?? field?.closest("label") ?? null;
      if (row && row.parentElement === original) fields.append(row);
    }
    details.append(fields);
    layout.append(details);
  }
  // Keep future or unsupported preference controls accessible, but never
  // silently mix them into the most prominent Dating intentions section.
  if (original.children.length) {
    const details = document.createElement("details");
    details.className = "preference-section";
    const summary = document.createElement("summary");
    const title = document.createElement("strong");
    title.textContent = "Other preferences";
    const description = document.createElement("span");
    description.textContent = "Additional settings not listed in the main groups.";
    summary.append(title, description);
    const fields = document.createElement("div");
    fields.className = "preferences-grid preference-section-grid";
    fields.append(...Array.from(original.children));
    details.append(summary, fields);
    layout.append(details);
  }
  original.replaceWith(layout);
}

organizeProfilePreferences();
initWorkspaceScrollNavigation();
void import("./first-run-guide").catch(error => console.error("Unable to open TNND guide", error));
if (actionCenter) bindActionCenter(actionCenter, refreshActionCounts);
void refreshActionCenter();
void refreshProfile();
