import { readSession } from "./auth-client";
import { fetchProfile, saveProfile } from "./profile-client";
import { parseImportedProfile, type ImportedProfile } from "./profile-import";
import { readEditablePreferences, writeEditablePreferences } from "./profile-preferences";

const storageKey = "tnnd:web:imported-profile";

function readLocalProfile(): ImportedProfile | null {
  const raw = localStorage.getItem(storageKey);
  if (!raw) return null;
  const parsed = parseImportedProfile(raw);
  return parsed.ok ? parsed.profile : null;
}

async function loadProfile(): Promise<ImportedProfile | null> {
  if (readSession()) return fetchProfile();
  return readLocalProfile();
}

async function persistProfile(profile: ImportedProfile): Promise<void> {
  if (readSession()) {
    await saveProfile(profile);
    return;
  }
  localStorage.setItem(storageKey, JSON.stringify(profile));
}

function mount(): void {
  const goal = document.querySelector<HTMLSelectElement>("#dating-goal");
  const saveButton = document.querySelector<HTMLButtonElement>("#preferences-save");
  if (!goal || !saveButton || document.querySelector("#dating-goal-details")) return;

  const label = document.createElement("label");
  label.textContent = "Goal details";
  const input = document.createElement("input");
  input.id = "dating-goal-details";
  input.type = "text";
  input.placeholder = "Optional context for your dating goal";
  input.autocomplete = "off";
  label.append(input);
  goal.closest("label")?.insertAdjacentElement("afterend", label);

  const refresh = async (): Promise<void> => {
    try {
      const profile = await loadProfile();
      input.disabled = !profile;
      input.value = profile ? readEditablePreferences(profile).datingGoalDetails ?? "" : "";
    } catch {
      input.disabled = true;
    }
  };

  saveButton.addEventListener("click", async () => {
    try {
      const profile = await loadProfile();
      if (!profile) return;
      const preferences = readEditablePreferences(profile);
      await persistProfile(writeEditablePreferences(profile, {
        ...preferences,
        datingGoalDetails: input.value
      }));
    } catch (error) {
      console.error("Unable to save dating goal details", error);
    }
  });

  window.addEventListener("tnnd:auth-session-changed", () => { void refresh(); });
  window.addEventListener("focus", () => { void refresh(); });
  void refresh();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", mount, { once: true });
} else {
  mount();
}
