import { getConfig } from "./storage";
import type { GenerateRequest, GenerateResponse } from "./types";

const scenarios = [
  { title: "Casual reply", context: "Them: Hey :) how's your week going?\nMe: Pretty good, busy but can't complain 😄\nThem: Same haha, I need the weekend already" },
  { title: "Darija / French mix", context: "Them: T'es marocain aussi ?\nMe: Ahaha oui 😄\nThem: Je savais, ça se voit direct 😂 tu viens d'où ?" },
  { title: "Move off Tinder", context: "Me: Franchement t'as l'air cool\nThem: Haha toi aussi 😄\nMe: On parle bien depuis un moment là\nThem: Grave, j'aime bien parler avec toi" }
];

const cards = document.getElementById("cards")!;
const status = document.getElementById("status")!;
const summary = document.getElementById("summary")!;
const version = document.getElementById("extensionVersion")!;
const regenerate = document.getElementById("regenerate") as HTMLButtonElement;
version.textContent = `v${chrome.runtime.getManifest().version}`;

async function generate(context: string): Promise<string> {
  const request: GenerateRequest = { type: "GENERATE_SUGGESTIONS", context, purpose: "preview", replyCount: 1 };
  const response = (await chrome.runtime.sendMessage(request)) as GenerateResponse;
  if (!response.ok || !response.suggestions?.[0]) throw new Error(response.error ?? "No preview generated.");
  return response.suggestions[0];
}

async function renderSummary(): Promise<void> {
  const c = await getConfig();
  summary.textContent = `${c.tone} · flirt ${c.flirtLevel}/3 · humor ${c.humorLevel}/100 · FR ${c.languages.fr} / Darija ${c.languages.darija} / EN ${c.languages.en}`;
}

async function render(): Promise<void> {
  regenerate.disabled = true; cards.replaceChildren(); status.textContent = "Generating examples…"; await renderSummary();
  try {
    for (const scenario of scenarios) {
      const card = document.createElement("section"); const h = document.createElement("h2"); h.textContent = scenario.title;
      const context = document.createElement("pre"); context.textContent = scenario.context;
      const reply = document.createElement("div"); reply.className = "reply"; reply.textContent = await generate(scenario.context);
      card.append(h, context, reply); cards.append(card);
    }
    status.textContent = "Preview generated from your current configuration.";
  } catch (error) { status.textContent = error instanceof Error ? error.message : "Could not generate preview."; }
  finally { regenerate.disabled = false; }
}

regenerate.addEventListener("click", () => void render());
chrome.storage.onChanged.addListener((_changes, area) => { if (area === "local") status.textContent = "Settings changed. Regenerate to refresh the examples."; });
void render();
