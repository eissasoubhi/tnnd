import { createProfileBundle, parseProfileBundle } from "./profile-bundle";
import { getApiKey, getBackendProfileCache, getBackendSession, getConfig, saveApiKey, saveConfig } from "./storage";
import { profileReadiness } from "./setup-progress";
import { mountTextingStyleControls } from "./texting-options";
import { MAX_FIRST_MESSAGE_DAILY_LIMIT, firstMessageDailyLimit } from "./tinder-first-message-daily-limit";
import { openerDelayWindow } from "./tinder-opener-timing";
import type { AppConfig, ContactPreference, EmojiLevel, MessageLength, Tone } from "./types";

function el<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Missing options field: ${id}`);
  return found as T;
}

const textingStyle = mountTextingStyleControls();

const f = {
  form: el<HTMLFormElement>("settings-form"), apiKey: el<HTMLInputElement>("apiKey"), model: el<HTMLInputElement>("model"),
  tone: el<HTMLSelectElement>("tone"), messageLength: el<HTMLSelectElement>("messageLength"), flirtLevel: el<HTMLInputElement>("flirtLevel"), flirtValue: el<HTMLElement>("flirtValue"), humorLevel: el<HTMLInputElement>("humorLevel"), humorValue: el<HTMLElement>("humorValue"), emojiLevel: el<HTMLSelectElement>("emojiLevel"), replyCount: el<HTMLSelectElement>("replyCount"),
  conversationFlowEnabled: el<HTMLInputElement>("conversationFlowEnabled"), conversationFlowOrder: el<HTMLSelectElement>("conversationFlowOrder"),
  langFr: el<HTMLInputElement>("langFr"), langDarija: el<HTMLInputElement>("langDarija"), langEn: el<HTMLInputElement>("langEn"), preferredWords: el<HTMLTextAreaElement>("preferredWords"), avoidedWords: el<HTMLTextAreaElement>("avoidedWords"), extraInstructions: el<HTMLTextAreaElement>("extraInstructions"),
  instagram: el<HTMLInputElement>("instagram"), whatsapp: el<HTMLInputElement>("whatsapp"), contactPreference: el<HTMLSelectElement>("contactPreference"),
  autoEnabled: el<HTMLInputElement>("autoEnabled"), replyDelayMinSeconds: el<HTMLInputElement>("replyDelayMinSeconds"), replyDelayMaxSeconds: el<HTMLInputElement>("replyDelayMaxSeconds"), openerDelayMinSeconds: el<HTMLInputElement>("openerDelayMinSeconds"), openerDelayMaxSeconds: el<HTMLInputElement>("openerDelayMaxSeconds"), quietHoursEnabled: el<HTMLInputElement>("quietHoursEnabled"), quietStart: el<HTMLInputElement>("quietStart"), quietEnd: el<HTMLInputElement>("quietEnd"), maxAutoRepliesPerDay: el<HTMLInputElement>("maxAutoRepliesPerDay"), maxFirstMessagesPerDay: el<HTMLInputElement>("maxFirstMessagesPerDay"),
  exportProfile: el<HTMLButtonElement>("exportProfile"), importProfile: el<HTMLButtonElement>("importProfile"), importProfileFile: el<HTMLInputElement>("importProfileFile"), extensionVersion: el<HTMLElement>("extensionVersion"), aiStatus: el<HTMLElement>("aiStatus"),
  testGemini: el<HTMLButtonElement>("testGemini"), status: el<HTMLElement>("status")
};

let identityCache: AppConfig["identity"] | null = null;

const num = (control: HTMLInputElement | HTMLSelectElement, fallback = 0) => Number.isFinite(Number(control.value)) ? Number(control.value) : fallback;
const updateRanges = () => { f.flirtValue.textContent = `${f.flirtLevel.value}/3`; f.humorValue.textContent = `${f.humorLevel.value}/100`; };

function readConfig(): AppConfig {
  const rawMin = Math.max(0, num(f.replyDelayMinSeconds, 20));
  const rawMax = Math.max(0, num(f.replyDelayMaxSeconds, 60));
  const replyDelayMinSeconds = Math.min(rawMin, rawMax);
  const replyDelayMaxSeconds = Math.max(rawMin, rawMax);
  const rawOpenerMin = Number(f.openerDelayMinSeconds.value);
  const rawOpenerMax = Number(f.openerDelayMaxSeconds.value);
  if (![rawOpenerMin, rawOpenerMax].every(value => Number.isInteger(value) && value >= 1 && value <= 60)) {
    throw new Error("Opening-message gap must be 1–60 whole seconds.");
  }
  const [openerDelayMinSeconds, openerDelayMaxSeconds] = openerDelayWindow({ openerDelayMinSeconds: rawOpenerMin, openerDelayMaxSeconds: rawOpenerMax });
  const rawFirstMessageLimit = Number(f.maxFirstMessagesPerDay.value);
  if (!Number.isInteger(rawFirstMessageLimit) || rawFirstMessageLimit < 1 || rawFirstMessageLimit > MAX_FIRST_MESSAGE_DAILY_LIMIT) {
    throw new Error(`First-message daily limit must be a whole number from 1 to ${MAX_FIRST_MESSAGE_DAILY_LIMIT}.`);
  }

  return {
    model: f.model.value.trim(), tone: f.tone.value as Tone, messageLength: f.messageLength.value as MessageLength,
    flirtLevel: num(f.flirtLevel, 2), humorLevel: num(f.humorLevel, 65), emojiLevel: f.emojiLevel.value as EmojiLevel, replyCount: num(f.replyCount, 3),
    languages: { fr: num(f.langFr), darija: num(f.langDarija), en: num(f.langEn) },
    preferredWords: f.preferredWords.value.trim(), avoidedWords: f.avoidedWords.value.trim(), extraInstructions: f.extraInstructions.value.trim(),
    conversationFlowEnabled: f.conversationFlowEnabled.checked, conversationFlowOrder: f.conversationFlowOrder.value as "default" | "work-first" | "interests-first",
    textingStyle: textingStyle.read(),
    identity: { ...(identityCache ?? { firstName: "", age: "", city: "", origin: "", occupation: "", interests: "", aboutMe: "" }), instagram: f.instagram.value.trim(), whatsapp: f.whatsapp.value.trim(), contactPreference: f.contactPreference.value as ContactPreference },
    automation: { enabled: f.autoEnabled.checked, replyDelayMinSeconds, replyDelayMaxSeconds, openerDelayMinSeconds, openerDelayMaxSeconds, quietHoursEnabled: f.quietHoursEnabled.checked, quietStart: f.quietStart.value, quietEnd: f.quietEnd.value, maxAutoRepliesPerDay: num(f.maxAutoRepliesPerDay, 40), maxFirstMessagesPerDay: rawFirstMessageLimit }
  };
}

function applyConfig(c: AppConfig): void {
  f.model.value = c.model; f.tone.value = c.tone; f.messageLength.value = c.messageLength; f.flirtLevel.value = String(c.flirtLevel); f.humorLevel.value = String(c.humorLevel); f.emojiLevel.value = c.emojiLevel; f.replyCount.value = String(c.replyCount);
  f.conversationFlowEnabled.checked = c.conversationFlowEnabled !== false;
  f.conversationFlowOrder.value = c.conversationFlowOrder ?? "default";
  f.langFr.value = String(c.languages.fr); f.langDarija.value = String(c.languages.darija); f.langEn.value = String(c.languages.en); f.preferredWords.value = c.preferredWords; f.avoidedWords.value = c.avoidedWords; f.extraInstructions.value = c.extraInstructions;
  textingStyle.apply(c.textingStyle);
  identityCache = c.identity;
  f.instagram.value = c.identity.instagram; f.whatsapp.value = c.identity.whatsapp; f.contactPreference.value = c.identity.contactPreference;
  const legacy = Number(c.automation.replyDelaySeconds);
  f.autoEnabled.checked = c.automation.enabled;
  f.replyDelayMinSeconds.value = String(c.automation.replyDelayMinSeconds ?? (Number.isFinite(legacy) ? Math.max(0, legacy - 15) : 20));
  f.replyDelayMaxSeconds.value = String(c.automation.replyDelayMaxSeconds ?? (Number.isFinite(legacy) ? legacy + 15 : 60));
  const [openerMin, openerMax] = openerDelayWindow(c.automation);
  f.openerDelayMinSeconds.value = String(openerMin);
  f.openerDelayMaxSeconds.value = String(openerMax);
  f.quietHoursEnabled.checked = c.automation.quietHoursEnabled; f.quietStart.value = c.automation.quietStart; f.quietEnd.value = c.automation.quietEnd; f.maxAutoRepliesPerDay.value = String(c.automation.maxAutoRepliesPerDay); f.maxFirstMessagesPerDay.value = String(firstMessageDailyLimit(c.automation.maxFirstMessagesPerDay)); updateRanges();
}

function setAiStatus(kind: "unconfigured" | "idle" | "checking" | "connected" | "error", detail = ""): void {
  const labels = { unconfigured: "AI: not configured", idle: "AI: not tested", checking: "AI: checking…", connected: "AI: connected", error: "AI: error" } as const;
  f.aiStatus.dataset.state = kind;
  f.aiStatus.textContent = detail ? `${labels[kind]} · ${detail}` : labels[kind];
}

async function load(): Promise<void> {
  const [c, apiKey, session, cache] = await Promise.all([getConfig(), getApiKey(), getBackendSession(), getBackendProfileCache()]);
  f.apiKey.value = apiKey;
  applyConfig(c);
  const summary = document.getElementById("serverIdentityPreview");
  const status = document.getElementById("serverIdentityStatus");
  if (summary && status) {
    const approved = session && cache && profileReadiness(cache.profile).identityApproved;
    summary.textContent = approved ? c.identity.aboutMe || "Identity approved in TNND." : session ? "Complete and approve your About Me on TNND Web, then reopen this page." : "Connect your TNND account in the extension, then manage your identity on TNND Web.";
    status.textContent = approved ? "Approved on TNND Web" : "Needs setup or sync";
  }
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
