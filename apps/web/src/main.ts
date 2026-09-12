import "./styles.css";
import { downloadProfile, parseImportedProfile, type ImportedProfile } from "./profile-import";

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
const app = document.querySelector<HTMLElement>("#app");
if (!app) throw new Error("TNND web app root was not found.");

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
          <strong>${card.value}</strong>
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
            <p class="eyebrow">Operations</p>
            <h2>Action Center</h2>
          </div>
          <span class="pill">0 pending</span>
        </div>
        <p>Manual actions such as Instagram, WhatsApp, availability and low-confidence personal questions will be surfaced here.</p>
      </article>
    </section>
  </section>
`;

const status = document.querySelector<HTMLElement>("#profile-status");
const message = document.querySelector<HTMLElement>("#profile-message");
const input = document.querySelector<HTMLInputElement>("#profile-file");
const exportButton = document.querySelector<HTMLButtonElement>("#profile-export");

function loadStoredProfile(): ImportedProfile | null {
  const raw = localStorage.getItem(storageKey);
  if (!raw) return null;
  const parsed = parseImportedProfile(raw);
  return parsed.ok ? parsed.profile : null;
}

function refreshStatus(): void {
  const current = loadStoredProfile();
  if (status) status.textContent = current ? `Schema v${current.schemaVersion}` : "No profile";
  if (exportButton) exportButton.disabled = !current;
}

input?.addEventListener("change", async () => {
  const file = input.files?.[0];
  if (!file) return;
  const parsed = parseImportedProfile(await file.text());
  if (!parsed.ok) {
    if (message) message.textContent = parsed.error;
    return;
  }

  localStorage.setItem(storageKey, JSON.stringify(parsed.profile));
  if (message) message.textContent = "Profile imported locally. Backend persistence will replace this temporary browser storage.";
  refreshStatus();
});

exportButton?.addEventListener("click", () => {
  const profile = loadStoredProfile();
  if (profile) downloadProfile(profile);
});

refreshStatus();
