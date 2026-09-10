import { getApiKey, getConfig, saveApiKey, saveConfig } from "./storage";
import type { AppConfig, EmojiLevel, MessageLength, Tone, GenerateRequest, GenerateResponse } from "./types";

function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Missing options field: ${id}`);
  return found as T;
}

const fields = {
  form: element<HTMLFormElement>("settings-form"),
  chatContext: element<HTMLTextAreaElement>("chatContext"),
  generateLab: element<HTMLButtonElement>("generateLab"),
  clearLab: element<HTMLButtonElement>("clearLab"),
  labStatus: element<HTMLElement>("labStatus"),
  labSuggestions: element<HTMLElement>("labSuggestions"),
  apiKey: element<HTMLInputElement>("apiKey"),
  model: element<HTMLInputElement>("model"),
  tone: element<HTMLSelectElement>("tone"),
  messageLength: element<HTMLSelectElement>("messageLength"),
  flirtLevel: element<HTMLInputElement>("flirtLevel"),
  flirtValue: element<HTMLElement>("flirtValue"),
  humorLevel: element<HTMLInputElement>("humorLevel"),
  humorValue: element<HTMLElement>("humorValue"),
  emojiLevel: element<HTMLSelectElement>("emojiLevel"),
  replyCount: element<HTMLSelectElement>("replyCount"),
  langFr: element<HTMLInputElement>("langFr"),
  langDarija: element<HTMLInputElement>("langDarija"),
  langEn: element<HTMLInputElement>("langEn"),
  langAr: element<HTMLInputElement>("langAr"),
  preferredWords: element<HTMLTextAreaElement>("preferredWords"),
  avoidedWords: element<HTMLTextAreaElement>("avoidedWords"),
  personalContext: element<HTMLTextAreaElement>("personalContext"),
  extraInstructions: element<HTMLTextAreaElement>("extraInstructions"),
  testGemini: element<HTMLButtonElement>("testGemini"),
  status: element<HTMLElement>("status")
};

function numberValue(control: HTMLInputElement | HTMLSelectElement, fallback = 0): number {
  const parsed = Number(control.value);
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
    replyCount: numberValue(fields.replyCount, 3),
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

function renderSuggestions(suggestions: string[]): void {
  fields.labSuggestions.replaceChildren();

  for (const suggestion of suggestions) {
    const card = document.createElement("div");
    card.className = "suggestion";
    const text = document.createElement("div");
    text.className = "suggestion-text";
    text.textContent = suggestion;
    const copy = document.createElement("button");
    copy.type = "button";
    copy.className = "copy";
    copy.textContent = "Copy";
    copy.addEventListener("click", () => {
      void navigator.clipboard.writeText(suggestion).then(() => {
        fields.labStatus.textContent = "Copied.";
      });
    });
    card.append(text, copy);
    fields.labSuggestions.append(card);
  }
}

async function generateFromContext(context: string): Promise<GenerateResponse> {
  const request: GenerateRequest = { type: "GENERATE_SUGGESTIONS", context };
  return (await chrome.runtime.sendMessage(request)) as GenerateResponse;
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

fields.generateLab.addEventListener("click", () => {
  void (async () => {
    const context = fields.chatContext.value.trim();
    if (!context) {
      fields.labStatus.textContent = "Paste some conversation or profile context first.";
      return;
    }

    fields.generateLab.disabled = true;
    fields.labStatus.textContent = "Generating…";
    fields.labSuggestions.replaceChildren();
    await save();
    const response = await generateFromContext(context);
    if (!response.ok || !response.suggestions?.length) throw new Error(response.error || "No suggestions returned.");
    renderSuggestions(response.suggestions);
    fields.labStatus.textContent = `${response.suggestions.length} suggestion(s) ready.`;
  })()
    .catch((error) => {
      fields.labStatus.textContent = error instanceof Error ? error.message : "Could not generate replies.";
    })
    .finally(() => {
      fields.generateLab.disabled = false;
    });
});

fields.clearLab.addEventListener("click", () => {
  fields.chatContext.value = "";
  fields.labSuggestions.replaceChildren();
  fields.labStatus.textContent = "";
});

fields.testGemini.addEventListener("click", () => {
  void (async () => {
    fields.status.textContent = "Testing Gemini…";
    await save();
    const response = await generateFromContext("Test context: new match. Their profile says they love coffee and weekend trips.");
    fields.status.textContent = response.ok
      ? `Gemini works: ${response.suggestions?.[0] ?? "response received"}`
      : response.error ?? "Gemini test failed.";
  })().catch((error) => {
    fields.status.textContent = error instanceof Error ? error.message : "Gemini test failed.";
  });
});

void load();
