import { getConfig } from "./storage";
import type { AppConfig, GenerateRequest, GenerateResponse, PreviewOverrides } from "./types";

interface PreviewScenario {
  id: string;
  title: string;
  seed: string;
  followUps: string[];
}

interface PreviewVariant {
  id: string;
  title: string;
  description: string;
  overrides?: PreviewOverrides;
}

const scenarios: PreviewScenario[] = [
  {
    id: "discovery",
    title: "Getting to know each other",
    seed: "Them: Hey :) what are you up to this week?",
    followUps: ["Them: Haha same, work has been a lot. What do you usually do when you're free?"]
  },
  {
    id: "fr-darija",
    title: "French / Darija conversation",
    seed: "Them: T'es marocain aussi ? 😄",
    followUps: ["Them: Ahaha je savais 😂 tu connais bien le Maroc du coup ?"]
  },
  {
    id: "date-prep",
    title: "Mutual interest / future date",
    seed: "Them: Franchement j'aime bien parler avec toi 😄",
    followUps: ["Them: Oui grave, ça serait cool de se voir quand on peut"]
  }
];

const variants: PreviewVariant[] = [
  { id: "current", title: "Current configuration", description: "Exactly your saved global profile." },
  {
    id: "darija-fr",
    title: "FR + Darija chill",
    description: "More Moroccan code-switching, relaxed and lightly playful.",
    overrides: { tone: "chill", flirtLevel: 1, humorLevel: 55, languages: { fr: 50, darija: 45, en: 5 } }
  },
  {
    id: "flirty-humor",
    title: "FR + Darija · flirty + humor",
    description: "Shorter, more playful/flirty messages with stronger humor.",
    overrides: { tone: "flirty", messageLength: "short", flirtLevel: 3, humorLevel: 85, emojiLevel: "low", languages: { fr: 45, darija: 45, en: 10 } }
  }
];

const cards = document.getElementById("cards")!;
const status = document.getElementById("status")!;
const summary = document.getElementById("summary")!;
const version = document.getElementById("extensionVersion")!;
const generateButton = document.getElementById("generateMatrix") as HTMLButtonElement;
const selection = document.getElementById("selection")!;
const callEstimate = document.getElementById("callEstimate")!;
version.textContent = `v${chrome.runtime.getManifest().version}`;

function selectedIds(name: string): Set<string> {
  return new Set(
    Array.from(document.querySelectorAll<HTMLInputElement>(`input[name="${name}"]:checked`)).map((input) => input.value)
  );
}

function selectedScenarios(): PreviewScenario[] {
  const ids = selectedIds("scenario");
  return scenarios.filter((scenario) => ids.has(scenario.id));
}

function selectedVariants(): PreviewVariant[] {
  const ids = selectedIds("variant");
  return variants.filter((variant) => ids.has(variant.id));
}

function updateEstimate(): void {
  const calls = selectedScenarios().length * selectedVariants().length * 2;
  callEstimate.textContent = `${calls} Gemini call${calls === 1 ? "" : "s"}`;
  generateButton.textContent = calls ? `Generate preview matrix (${calls})` : "Select previews to generate";
  generateButton.disabled = calls === 0;
}

function renderSelectors(): void {
  selection.replaceChildren();
  const scenariosBox = document.createElement("div");
  scenariosBox.className = "selector-group";
  const scenariosTitle = document.createElement("strong");
  scenariosTitle.textContent = "Conversations";
  scenariosBox.append(scenariosTitle);
  for (const scenario of scenarios) {
    const label = document.createElement("label");
    label.className = "check";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.name = "scenario";
    input.value = scenario.id;
    input.checked = true;
    input.addEventListener("change", updateEstimate);
    label.append(input, document.createTextNode(scenario.title));
    scenariosBox.append(label);
  }

  const variantsBox = document.createElement("div");
  variantsBox.className = "selector-group";
  const variantsTitle = document.createElement("strong");
  variantsTitle.textContent = "Configuration mixes";
  variantsBox.append(variantsTitle);
  for (const variant of variants) {
    const label = document.createElement("label");
    label.className = "check";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.name = "variant";
    input.value = variant.id;
    input.checked = true;
    input.addEventListener("change", updateEstimate);
    const text = document.createElement("span");
    text.innerHTML = `<b>${variant.title}</b><small>${variant.description}</small>`;
    label.append(input, text);
    variantsBox.append(label);
  }
  selection.append(scenariosBox, variantsBox);
  updateEstimate();
}

function overrideValue<T>(override: T | undefined, current: T): T {
  return override ?? current;
}

function configLabel(base: AppConfig, variant: PreviewVariant): string {
  const o = variant.overrides;
  const languages = { ...base.languages, ...(o?.languages ?? {}) };
  return [
    `tone ${overrideValue(o?.tone, base.tone)}`,
    `flirt ${overrideValue(o?.flirtLevel, base.flirtLevel)}/3`,
    `humor ${overrideValue(o?.humorLevel, base.humorLevel)}/100`,
    `FR ${languages.fr} · Darija ${languages.darija} · EN ${languages.en}`
  ].join(" · ");
}

async function generate(context: string, overrides?: PreviewOverrides): Promise<string> {
  const request: GenerateRequest = {
    type: "GENERATE_SUGGESTIONS",
    context,
    purpose: "preview",
    replyCount: 1,
    previewOverrides: overrides
  };
  const response = (await chrome.runtime.sendMessage(request)) as GenerateResponse;
  if (!response.ok || !response.suggestions?.[0]) throw new Error(response.error ?? "No preview generated.");
  return response.suggestions[0];
}

function appendBubble(container: HTMLElement, speaker: "them" | "tnnd", text: string): void {
  const bubble = document.createElement("div");
  bubble.className = `bubble ${speaker}`;
  const who = document.createElement("span");
  who.className = "speaker";
  who.textContent = speaker === "them" ? "Them" : "TNND";
  const body = document.createElement("div");
  body.textContent = text;
  bubble.append(who, body);
  container.append(bubble);
}

async function buildConversation(scenario: PreviewScenario, variant: PreviewVariant, base: AppConfig): Promise<HTMLElement> {
  const card = document.createElement("section");
  const heading = document.createElement("div");
  heading.className = "card-heading";
  const h2 = document.createElement("h2");
  h2.textContent = `${scenario.title} · ${variant.title}`;
  const meta = document.createElement("div");
  meta.className = "meta";
  meta.textContent = configLabel(base, variant);
  heading.append(h2, meta);

  const chat = document.createElement("div");
  chat.className = "chat";
  const seedText = scenario.seed.replace(/^Them:\s*/i, "");
  appendBubble(chat, "them", seedText);
  let context = scenario.seed;

  const first = await generate(context, variant.overrides);
  appendBubble(chat, "tnnd", first);
  context += `\nMe: ${first}`;

  for (const followUp of scenario.followUps) {
    const clean = followUp.replace(/^Them:\s*/i, "");
    appendBubble(chat, "them", clean);
    context += `\n${followUp}`;
    const reply = await generate(context, variant.overrides);
    appendBubble(chat, "tnnd", reply);
    context += `\nMe: ${reply}`;
  }

  card.append(heading, chat);
  return card;
}

async function renderMatrix(): Promise<void> {
  const chosenScenarios = selectedScenarios();
  const chosenVariants = selectedVariants();
  const total = chosenScenarios.length * chosenVariants.length * 2;
  if (!total) return;

  generateButton.disabled = true;
  cards.replaceChildren();
  status.textContent = `Generating ${chosenScenarios.length} conversation(s) × ${chosenVariants.length} configuration(s)…`;
  const base = await getConfig();
  summary.textContent = `Saved profile: ${base.tone} · flirt ${base.flirtLevel}/3 · humor ${base.humorLevel}/100 · FR ${base.languages.fr} / Darija ${base.languages.darija} / EN ${base.languages.en}`;

  let completed = 0;
  try {
    for (const scenario of chosenScenarios) {
      for (const variant of chosenVariants) {
        const card = await buildConversation(scenario, variant, base);
        cards.append(card);
        completed += 2;
        status.textContent = `Generated ${completed}/${total} Gemini turns.`;
      }
    }
    status.textContent = `Done · ${total} Gemini calls. Compare the conversations, then change your saved configuration or regenerate a smaller selection.`;
  } catch (error) {
    status.textContent = error instanceof Error ? error.message : "Could not generate preview matrix.";
  } finally {
    generateButton.disabled = false;
    updateEstimate();
  }
}

renderSelectors();
void getConfig().then((base) => {
  summary.textContent = `Saved profile: ${base.tone} · flirt ${base.flirtLevel}/3 · humor ${base.humorLevel}/100 · FR ${base.languages.fr} / Darija ${base.languages.darija} / EN ${base.languages.en}`;
});
generateButton.addEventListener("click", () => void renderMatrix());
chrome.storage.onChanged.addListener((_changes, area) => {
  if (area === "local") status.textContent = "Settings changed. Generate again to compare the updated profile.";
});
