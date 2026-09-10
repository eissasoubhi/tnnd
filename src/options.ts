import { createProfileBundle, parseProfileBundle } from "./profile-bundle";
import { getApiKey, getConfig, saveApiKey, saveConfig } from "./storage";
import type { AppConfig, ContactPreference, EmojiLevel, MessageLength, Tone } from "./types";

function el<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Missing options field: ${id}`);
  return found as T;
}

const f = {
  form: el<HTMLFormElement>("settings-form"), apiKey: el<HTMLInputElement>("apiKey"), model: el<HTMLInputElement>("model"),
  tone: el<HTMLSelectElement>("tone"), messageLength: el<HTMLSelectElement>("messageLength"), flirtLevel: el<HTMLInputElement>("flirtLevel"), flirtValue: el<HTMLElement>("flirtValue"), humorLevel: el<HTMLInputElement>("humorLevel"), humorValue: el<HTMLElement>("humorValue"), emojiLevel: el<HTMLSelectElement>("emojiLevel"), replyCount: el<HTMLSelectElement>("replyCount"),
  langFr: el<HTMLInputElement>("langFr"), langDarija: el<HTMLInputElement>("langDarija"), langEn: el<HTMLInputElement>("langEn"), preferredWords: el<HTMLTextAreaElement>("preferredWords"), avoidedWords: el<HTMLTextAreaElement>("avoidedWords"), extraInstructions: el<HTMLTextAreaElement>("extraInstructions"),
  firstName: el<HTMLInputElement>("firstName"), age: el<HTMLInputElement>("age"), city: el<HTMLInputElement>("city"), origin: el<HTMLInputElement>("origin"), occupation: el<HTMLInputElement>("occupation"), interests: el<HTMLInputElement>("interests"), aboutMe: el<HTMLTextAreaElement>("aboutMe"), instagram: el<HTMLInputElement>("instagram"), whatsapp: el<HTMLInputElement>("whatsapp"), contactPreference: el<HTMLSelectElement>("contactPreference"),
  autoEnabled: el<HTMLInputElement>("autoEnabled"), replyDelaySeconds: el<HTMLInputElement>("replyDelaySeconds"), quietHoursEnabled: el<HTMLInputElement>("quietHoursEnabled"), quietStart: el<HTMLInputElement>("quietStart"), quietEnd: el<HTMLInputElement>("quietEnd"), maxAutoRepliesPerDay: el<HTMLInputElement>("maxAutoRepliesPerDay"),
  exportProfile: el<HTMLButtonElement>("exportProfile"), importProfile: el<HTMLButtonElement>("importProfile"), importProfileFile: el<HTMLInputElement>("importProfileFile"), extensionVersion: el<HTMLElement>("extensionVersion"), aiStatus: el<HTMLElement>("aiStatus"),
  testGemini: el<HTMLButtonElement>("testGemini"), status: el<HTMLElement>("status")
};

const num = (control: HTMLInputElement | HTMLSelectElement, fallback = 0) => Number.isFinite(Number(control.value)) ? Number(control.value) : fallback;
const updateRanges = () => { f.flirtValue.textContent = `${f.flirtLevel.value}/3`; f.humorValue.textContent = `${f.humorLevel.value}/100`; };

function readConfig(): AppConfig {
  return {
    model: f.model.value.trim(), tone: f.tone.value as Tone, messageLength: f.messageLength.value as MessageLength,
    flirtLevel: num(f.flirtLevel, 2), humorLevel: num(f.humorLevel, 65), emojiLevel: f.emojiLevel.value as EmojiLevel, replyCount: num(f.replyCount, 3),
    languages: { fr: num(f.langFr), darija: num(f.langDarija), en: num(f.langEn) },
    preferredWords: f.preferredWords.value.trim(), avoidedWords: f.avoidedWords.value.trim(), extraInstructions: f.extraInstructions.value.trim(),
    identity: { firstName: f.firstName.value.trim(), age: f.age.value.trim(), city: f.city.value.trim(), origin: f.origin.value.trim(), occupation: f.occupation.value.trim(), interests: f.interests.value.trim(), aboutMe: f.aboutMe.value.trim(), instagram: f.instagram.value.trim(), whatsapp: f.whatsapp.value.trim(), contactPreference: f.contactPreference.value as ContactPreference },
    automation: { enabled: f.autoEnabled.checked, replyDelaySeconds: num(f.replyDelaySeconds, 45), quietHoursEnabled: f.quietHoursEnabled.checked, quietStart: f.quietStart.value, quietEnd: f.quietEnd.value, maxAutoRepliesPerDay: num(f.maxAutoRepliesPerDay, 40) }
  };
}

function applyConfig(c: AppConfig): void {
  f.model.value = c.model; f.tone.value = c.tone; f.messageLength.value = c.messageLength; f.flirtLevel.value = String(c.flirtLevel); f.humorLevel.value = String(c.humorLevel); f.emojiLevel.value = c.emojiLevel; f.replyCount.value = String(c.replyCount);
  f.langFr.value = String(c.languages.fr); f.langDarija.value = String(c.languages.darija); f.langEn.value = String(c.languages.en); f.preferredWords.value = c.preferredWords; f.avoidedWords.value = c.avoidedWords; f.extraInstructions.value = c.extraInstructions;
  f.firstName.value = c.identity.firstName; f.age.value = c.identity.age; f.city.value = c.identity.city; f.origin.value = c.identity.origin; f.occupation.value = c.identity.occupation; f.interests.value = c.identity.interests; f.aboutMe.value = c.identity.aboutMe; f.instagram.value = c.identity.instagram; f.whatsapp.value = c.identity.whatsapp; f.contactPreference.value = c.identity.contactPreference;
  f.autoEnabled.checked = c.automation.enabled; f.replyDelaySeconds.value = String(c.automation.replyDelaySeconds); f.quietHoursEnabled.checked = c.automation.quietHoursEnabled; f.quietStart.value = c.automation.quietStart; f.quietEnd.value = c.automation.quietEnd; f.maxAutoRepliesPerDay.value = String(c.automation.maxAutoRepliesPerDay); updateRanges();
}

function setAiStatus(kind: "unconfigured" | "idle" | "checking" | "connected" | "error", detail = ""): void {
  const labels = { unconfigured: "AI: not configured", idle: "AI: not tested", checking: "AI: checking…", connected: "AI: connected", error: "AI: error" } as const;
  f.aiStatus.dataset.state = kind;
  f.aiStatus.textContent = detail ? `${labels[kind]} · ${detail}` : labels[kind];
}

async function load(): Promise<void> {
  const [c, apiKey] = await Promise.all([getConfig(), getApiKey()]);
  f.apiKey.value = apiKey;
  applyConfig(c);
  f.extensionVersion.textContent = `v${chrome.runtime.getManifest().version}`;
  setAiStatus(apiKey ? "idle" : "unconfigured", apiKey ? c.model : "");
}

async function save(): Promise<void> {
  await Promise.all([saveConfig(readConfig()), saveApiKey(f.apiKey.value)]);
  f.status.textContent = "Saved.";
  if (!f.apiKey.value.trim()) setAiStatus("unconfigured");
}

function downloadProfile(config: AppConfig): void {
  const bundle = createProfileBundle(config);
  const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `tnnd-profile-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

f.flirtLevel.addEventListener("input", updateRanges); f.humorLevel.addEventListener("input", updateRanges);
f.form.addEventListener("submit", (event) => { event.preventDefault(); f.status.textContent = "Saving…"; void save().catch((error) => { f.status.textContent = error instanceof Error ? error.message : "Could not save settings."; }); });

f.exportProfile.addEventListener("click", () => {
  downloadProfile(readConfig());
  f.status.textContent = "Profile exported. Gemini API key was not included.";
});

f.importProfile.addEventListener("click", () => f.importProfileFile.click());
f.importProfileFile.addEventListener("change", () => {
  void (async () => {
    const file = f.importProfileFile.files?.[0];
    if (!file) return;
    const bundle = parseProfileBundle(await file.text());
    await saveConfig(bundle.config);
    applyConfig(bundle.config);
    f.status.textContent = `Profile imported${bundle.extensionVersion ? ` from TNND ${bundle.extensionVersion}` : ""}. Gemini API key was left unchanged.`;
    f.importProfileFile.value = "";
  })().catch((error) => {
    f.status.textContent = error instanceof Error ? error.message : "Could not import profile.";
    f.importProfileFile.value = "";
  });
});

f.apiKey.addEventListener("input", () => setAiStatus(f.apiKey.value.trim() ? "idle" : "unconfigured", f.apiKey.value.trim() ? f.model.value.trim() : ""));
f.model.addEventListener("input", () => { if (f.apiKey.value.trim()) setAiStatus("idle", f.model.value.trim()); });

f.testGemini.addEventListener("click", () => { void (async () => {
  setAiStatus("checking", f.model.value.trim());
  f.status.textContent = "Testing Gemini connection…";
  await save();
  const response = await chrome.runtime.sendMessage({ type: "GENERATE_SUGGESTIONS", context: "Them: Hey, how's your week going?", purpose: "preview", replyCount: 1 });
  if (!response?.ok) throw new Error(response?.error ?? "Gemini test failed.");
  setAiStatus("connected", f.model.value.trim());
  f.status.textContent = "Gemini connection is working.";
})().catch((error) => {
  const message = error instanceof Error ? error.message : "Gemini test failed.";
  setAiStatus("error", message);
  f.status.textContent = message;
}); });

void load();
