import "./styles.css";
import { bindActionCenter, readHumanActions, renderActionCenter } from "./action-center";
import { readSession } from "./auth-client";
import { fetchProfile, saveProfile } from "./profile-client";
import { downloadProfile, parseImportedProfile, type ImportedProfile } from "./profile-import";
import { datingGoals, disclosureStrategies, readEditablePreferences, writeEditablePreferences } from "./profile-preferences";

type ConversationState = "Active" | "Waiting for them" | "Action required" | "Paused";

interface DashboardCard {
  label: string;
  value: number;
  state: ConversationState;
}

const cards: DashboardCard[] = [
  { label: "Active conversations", value: 0, state: "Active" },
  { label: "Waiting for them", value: 0, state: "Waiting for them" },
  { label: "Human actions", value: readHumanActions().filter((item) => item.status === "pending").length, state: "Action required" },
  { label: "Paused", value: 0, state: "Paused" }
];

const storageKey = "tnnd:web:imported-profile";
const app = document.querySelector<HTMLElement>("#app");
if (!app) throw new Error("TNND web app root was not found.");

const options = (values: readonly string[]) => values.map((value) => `<option value="${value}">${value}</option>`).join("");

app.innerHTML = `
  <section class="shell">
    <header class="topbar">
      <div>
        <p class="eyebrow">TNND</p>
        <h1>Conversation control center</h1>
        <p class="subtle">Platform foundation for profile, conversations, actions, memories and analytics.</p>
      </div>
      <span class="status">Platform foundation</span>
    </header>

    <section class="metrics" aria-label="Conversation overview">
      ${cards.map((card) => `
        <article class="metric">
          <span>${card.label}</span>
          <strong data-metric-state="${card.state}">${card.value}</strong>
          <small>${card.state}</small>
        </article>
      `).join("")}
    </section>

    <section class="grid">
      <article class="panel">
        <div class="panel-heading">
          <div>
            <p class="eyebrow">Account</p>
            <h2>Profile import / export</h2>
          </div>
          <span class="pill" id="profile-status">No profile</span>
        </div>
        <p>Import a schema-versioned TNND profile JSON. Secrets such as Gemini API keys do not belong in this file.</p>
        <input id="profile-file" type="file" accept="application/json,.json" />
        <button id="profile-export" type="button">Export current profile</button>
        <p class="subtle" id="profile-message" role="status"></p>
      </article>

      <article class="panel">
        <div class="panel-heading">
          <div>
            <p class="eyebrow">Preferences</p>
            <h2>Dating goal & texting identity</h2>
          </div>
          <span class="pill" id="preferences-status">Import a profile first</span>
        </div>
        <div class="preferences-grid">
          <label>Dating goal<select id="dating-goal">${options(datingGoals)}</select></label>
          <label>Disclosure<select id="disclosure-strategy">${options(disclosureStrategies)}</select></label>
          <label>Formality<select id="text-formality"><option value="very-casual">very-casual</option><option value="casual">casual</option><option value="neutral">neutral</option></select></label>
          <label>Emoji frequency<select id="emoji-frequency"><option value="none">none</option><option value="low">low</option><option value="medium">medium</option></select></label>
          <label>Abbreviations<select id="abbreviations"><option value="low">low</option><option value="medium">medium</option><option value="high">high</option></select></label>
          <label>Message length<select id="message-length"><option value="very-short">very-short</option><option value="short">short</option><option value="medium">medium</option></select></label>
        </div>
        <button id="preferences-save" type="button">Save preferences</button>
        <p class="subtle">Signed-in profiles are stored in the backend. Browser storage is only a disconnected fallback.</p>
      </article>

      <article class="panel panel-wide">
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

const status = document.querySelector<HTMLElement>("#profile-status");
const message = document.querySelector<HTMLElement>("#profile-message");
const input = document.querySelector<HTMLInputElement>("#profile-file");
const exportButton = document.querySelector<HTMLButtonElement>("#profile-export");
const preferencesStatus = document.querySelector<HTMLElement>("#preferences-status");
const preferencesSave = document.querySelector<HTMLButtonElement>("#preferences-save");
const datingGoal = document.querySelector<HTMLSelectElement>("#dating-goal");
const disclosureStrategy = document.querySelector<HTMLSelectElement>("#disclosure-strategy");
const textFormality = document.querySelector<HTMLSelectElement>("#text-formality");
const emojiFrequency = document.querySelector<HTMLSelectElement>("#emoji-frequency");
const abbreviations = document.querySelector<HTMLSelectElement>("#abbreviations");
const messageLength = document.querySelector<HTMLSelectElement>("#message-length");
const actionCenter = document.querySelector<HTMLElement>("#action-center");
const actionCount = document.querySelector<HTMLElement>("#action-count");
const humanActionMetric = document.querySelector<HTMLElement>('[data-metric-state="Action required"]');

let currentProfile: ImportedProfile | null = null;

function loadFallbackProfile(): ImportedProfile | null {
  const raw = localStorage.getItem(storageKey);
  if (!raw) return null;
  const parsed = parseImportedProfile(raw);
  return parsed.ok ? parsed.profile : null;
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
  const controls = [datingGoal, disclosureStrategy, textFormality, emojiFrequency, abbreviations, messageLength, preferencesSave];
  controls.forEach((control) => { if (control) control.disabled = !profile; });
  if (!profile) {
    if (preferencesStatus) preferencesStatus.textContent = "Import a profile first";
    return;
  }

  const preferences = readEditablePreferences(profile);
  if (datingGoal) datingGoal.value = preferences.datingGoal;
  if (disclosureStrategy) disclosureStrategy.value = preferences.disclosureStrategy;
  if (textFormality) textFormality.value = preferences.formality;
  if (emojiFrequency) emojiFrequency.value = preferences.emojiFrequency;
  if (abbreviations) abbreviations.value = preferences.abbreviations;
  if (messageLength) messageLength.value = preferences.messageLength;
  if (preferencesStatus) preferencesStatus.textContent = readSession() ? "Synced" : "Local fallback";
}

function refreshActionCounts(): void {
  const pending = readHumanActions().filter((item) => item.status === "pending").length;
  if (actionCount) actionCount.textContent = `${pending} pending`;
  if (humanActionMetric) humanActionMetric.textContent = String(pending);
}

async function persistProfile(profile: ImportedProfile): Promise<void> {
  if (readSession()) {
    currentProfile = await saveProfile(profile);
    localStorage.removeItem(storageKey);
    setProfile(currentProfile, "backend");
    return;
  }
  localStorage.setItem(storageKey, JSON.stringify(profile));
  setProfile(profile, "local");
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
  if (!currentProfile || !datingGoal || !disclosureStrategy || !textFormality || !emojiFrequency || !abbreviations || !messageLength) return;
  const updated = writeEditablePreferences(currentProfile, {
    datingGoal: datingGoal.value,
    disclosureStrategy: disclosureStrategy.value,
    formality: textFormality.value,
    emojiFrequency: emojiFrequency.value,
    abbreviations: abbreviations.value,
    messageLength: messageLength.value
  });
  try {
    await persistProfile(updated);
    if (preferencesStatus) preferencesStatus.textContent = readSession() ? "Synced" : "Saved locally";
    if (message) message.textContent = readSession() ? "Preferences saved to backend." : "Preferences saved to local fallback.";
  } catch (error) {
    if (message) message.textContent = error instanceof Error ? error.message : "Unable to save preferences.";
  }
});

window.addEventListener("tnnd:auth-session-changed", () => { void refreshProfile(); });

if (actionCenter) {
  renderActionCenter(actionCenter);
  bindActionCenter(actionCenter, refreshActionCounts);
}
refreshActionCounts();
void refreshProfile();
void import("./auth-panel");
