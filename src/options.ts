import { getApiKey, getConfig, saveApiKey, saveConfig } from "./storage";
import type { AppConfig, EmojiLevel, MessageLength, Tone, GenerateRequest, GenerateResponse } from "./types";

function input<T extends HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing options field: ${id}`);
  return element as T;
}

const fields = {
  form: input<HTMLFormElement>("settings-form"),
  apiKey: input<HTMLInputElement>("apiKey"),
  model: input<HTMLInputElement>("model"),
  tone: input<HTMLSelectElement>("tone"),
  messageLength: input<HTMLSelectElement>("messageLength"),
  flirtLevel: input<HTMLInputElement>("flirtLevel"),
  flirtValue: document.getElementById("flirtValue")!,
  humorLevel: input<HTMLInputElement>("humorLevel"),
  humorValue: document.getElementById("humorValue")!,
  emojiLevel: input<HTMLSelectElement>("emojiLevel"),
  replyCount: input<HTMLSelectElement>("replyCount"),
  langFr: input<HTMLInputElement>("langFr"),
  langDarija: input<HTMLInputElement>("langDarija"),
  langEn: input<HTMLInputElement>("langEn"),
  langAr: input<HTMLInputElement>("langAr"),
  preferredWords: input<HTMLTextAreaElement>("preferredWords"),
  avoidedWords: input<HTMLTextAreaElement>("avoidedWords"),
  personalContext: input<HTMLTextAreaElement>("personalContext"),
  extraInstructions: input<HTMLTextAreaElement>("extraInstructions"),
  testGemini: input<HTMLButtonElement>("testGemini"),
  status: document.getElementById("status")!
};

function numberValue(element: HTMLInputElement, fallback = 0): number {
  const parsed = Number(element.value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function updateRangeLabels(): void {
  fields.flirtValue.textContent = `${fields.flirtLevel.value}/3`;
  fields.humorValue.textContent = `${fields.humorLevel.value}/100`;
}

function readConfig(): AppConfig {
  return {
    model: fields.model.value.trim(),
    tone: fields.tone.value as Tone,
    messageLength: fields.messageLength.value as MessageLength,
    flirtLevel: numberValue(fields.flirtLevel, 2),
    humorLevel: numberValue(fields.humorLevel, 65),
    emojiLevel: fields.emojiLevel.value as EmojiLevel,
    replyCount: numberValue(fields.replyCount as unknown as HTMLInputElement, 3),
    languages: {
      fr: numberValue(fields.langFr),
      darija: numberValue(fields.langDarija),
      en: numberValue(fields.langEn),
      ar: numberValue(fields.langAr)
    },
    preferredWords: fields.preferredWords.value.trim(),
    avoidedWords: fields.avoidedWords.value.trim(),
    personalContext: fields.personalContext.value.trim(),
    extraInstructions: fields.extraInstructions.value.trim()
  };
}

async function load(): Promise<void> {
  const [config, apiKey] = await Promise.all([getConfig(), getApiKey()]);
  fields.apiKey.value = apiKey;
  fields.model.value = config.model;
  fields.tone.value = config.tone;
  fields.messageLength.value = config.messageLength;
  fields.flirtLevel.value = String(config.flirtLevel);
  fields.humorLevel.value = String(config.humorLevel);
  fields.emojiLevel.value = config.emojiLevel;
  fields.replyCount.value = String(config.replyCount);
  fields.langFr.value = String(config.languages.fr);
  fields.langDarija.value = String(config.languages.darija);
  fields.langEn.value = String(config.languages.en);
  fields.langAr.value = String(config.languages.ar);
  fields.preferredWords.value = config.preferredWords;
  fields.avoidedWords.value = config.avoidedWords;
  fields.personalContext.value = config.personalContext;
  fields.extraInstructions.value = config.extraInstructions;
  updateRangeLabels();
}

async function save(): Promise<void> {
  await Promise.all([saveConfig(readConfig()), saveApiKey(fields.apiKey.value)]);
  fields.status.textContent = "Saved.";
}

fields.flirtLevel.addEventListener("input", updateRangeLabels);
fields.humorLevel.addEventListener("input", updateRangeLabels);
fields.form.addEventListener("submit", (event) => {
  event.preventDefault();
  fields.status.textContent = "Saving…";
  void save().catch((error) => {
    fields.status.textContent = error instanceof Error ? error.message : "Could not save settings.";
  });
});

fields.testGemini.addEventListener("click", () => {
  void (async () => {
    fields.status.textContent = "Testing Gemini…";
    await save();
    const request: GenerateRequest = {
      type: "GENERATE_SUGGESTIONS",
      context: "Test context: new match. Their profile says they love coffee and weekend trips."
    };
    const response = (await chrome.runtime.sendMessage(request)) as GenerateResponse;
    fields.status.textContent = response.ok
      ? `Gemini works: ${response.suggestions?.[0] ?? "response received"}`
      : response.error ?? "Gemini test failed.";
  })().catch((error) => {
    fields.status.textContent = error instanceof Error ? error.message : "Gemini test failed.";
  });
});

void load();
