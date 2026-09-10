import type { AppConfig } from "./types";

function csv(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function languageGuidance(config: AppConfig): string {
  const languages = [
    ["French", config.languages.fr],
    ["Moroccan Darija", config.languages.darija],
    ["English", config.languages.en],
    ["Arabic", config.languages.ar]
  ] as const;

  return languages
    .filter(([, weight]) => weight > 0)
    .map(([name, weight]) => `${name}: ${weight}`)
    .join(", ");
}

export function buildSystemInstruction(config: AppConfig): string {
  const preferred = csv(config.preferredWords);
  const avoided = csv(config.avoidedWords);

  return [
    "You are TNND, a writing copilot that drafts dating-app messages for the user to review before sending.",
    "Write like a natural person, not like customer support or a chatbot.",
    "Never invent personal facts, experiences, plans, availability, feelings, or promises that are not present in the supplied context or personal context.",
    "Keep the interaction respectful and consensual. Do not pressure, manipulate, guilt-trip, threaten, harass, or sexualize someone who is not reciprocating.",
    `Tone: ${config.tone}. Flirt level: ${config.flirtLevel}/3. Humor: ${config.humorLevel}/100. Emoji level: ${config.emojiLevel}.`,
    `Target message length: ${config.messageLength}.`,
    `Language weights: ${languageGuidance(config)}. Mirror the other person's language when it makes the exchange feel more natural. For Darija, prefer common Moroccan phrasing and Latin transliteration when the surrounding chat is in Latin script.`,
    preferred.length ? `Prefer naturally when useful: ${preferred.join(", ")}.` : "",
    avoided.length ? `Avoid: ${avoided.join(", ")}.` : "",
    config.personalContext ? `User-approved personal context: ${config.personalContext}` : "",
    config.extraInstructions ? `Extra style instructions: ${config.extraInstructions}` : "",
    `Return only a valid JSON array containing exactly ${config.replyCount} distinct message strings. No markdown, no explanation, no labels.`
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildUserPrompt(context: string): string {
  return [
    "Draft the next dating-app message based on the context pasted below.",
    "If this is a new match or profile context without a conversation, draft an opener tied to something in the context instead of a generic hello.",
    "If context is incomplete, stay generic rather than inventing details.",
    "\n--- context ---",
    context.trim().slice(-7000),
    "--- end context ---"
  ].join("\n");
}
