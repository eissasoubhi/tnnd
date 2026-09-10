import type { AppConfig, ChatSettings, GeneratePurpose } from "./types";

function csv(value: string): string[] {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function languageGuidance(config: AppConfig): string {
  return [
    ["French", config.languages.fr],
    ["Moroccan Darija", config.languages.darija],
    ["English", config.languages.en]
  ]
    .filter(([, weight]) => Number(weight) > 0)
    .map(([name, weight]) => `${name}: ${weight}`)
    .join(", ");
}

function identityGuidance(config: AppConfig): string {
  const p = config.identity;
  const facts = [
    p.firstName && `first name=${p.firstName}`,
    p.age && `age=${p.age}`,
    p.city && `lives in=${p.city}`,
    p.origin && `origin=${p.origin}`,
    p.occupation && `occupation=${p.occupation}`,
    p.interests && `interests=${p.interests}`,
    p.aboutMe && `other context=${p.aboutMe}`
  ].filter(Boolean);

  const contact = [
    `off-app preference=${p.contactPreference}`,
    p.instagram && `Instagram=${p.instagram}`,
    p.whatsapp && `WhatsApp=${p.whatsapp}`
  ].filter(Boolean);

  return [
    facts.length ? `User identity facts: ${facts.join("; ")}. Use only when relevant; never dump profile facts unnaturally.` : "",
    `Contact transition: ${contact.join("; ")}. Prefer asking for the other person's Instagram before WhatsApp when the preference is instagram-first. Move off Tinder only when the conversation shows mutual interest; do not pressure. Share the user's own contact only when it fits the conversation and the configured value exists.`
  ].filter(Boolean).join("\n");
}

function perChatGuidance(chat?: ChatSettings): string {
  if (!chat) return "";
  const parts = [
    chat.alias && `Local conversation alias: ${chat.alias}.`,
    chat.stage !== "auto" && `Conversation stage override: ${chat.stage}.`,
    chat.goal && `Goal for this conversation: ${chat.goal}. Progress toward it gradually; do not force it into every reply.`,
    chat.instructions && `Instructions specific to this conversation: ${chat.instructions}`
  ].filter(Boolean);
  return parts.length ? `Per-chat configuration:\n${parts.join("\n")}` : "";
}

export function buildSystemInstruction(config: AppConfig, count: number, purpose: GeneratePurpose, chat?: ChatSettings): string {
  const preferred = csv(config.preferredWords);
  const avoided = csv(config.avoidedWords);

  return [
    "You are TNND, a dating conversation writing engine acting from the user's configured identity.",
    "Write concise, conversational messages. Avoid customer-support language, essays, generic motivational wording, repeated questions and canned pickup lines.",
    "Never invent personal facts, experiences, availability, feelings or promises that are not present in the conversation or configured identity.",
    "Keep the interaction respectful and consensual. Do not pressure, manipulate, guilt-trip, threaten or continue sexual escalation when the other person is not reciprocating.",
    `Generation purpose: ${purpose}.`,
    `Tone: ${config.tone}. Flirt level: ${config.flirtLevel}/3. Humor: ${config.humorLevel}/100. Emoji level: ${config.emojiLevel}. Message length: ${config.messageLength}.`,
    `Language mix guidance: ${languageGuidance(config)}. Mirror the other person's language naturally. Code-switch only when it feels normal; never force all enabled languages into every message. For Darija, prefer common Moroccan Latin-script usage when the chat is in Latin script.`,
    identityGuidance(config),
    preferred.length ? `Prefer naturally when useful: ${preferred.join(", ")}.` : "",
    avoided.length ? `Avoid these words or expressions: ${avoided.join(", ")}.` : "",
    config.extraInstructions ? `Global conversation instructions: ${config.extraInstructions}` : "",
    perChatGuidance(chat),
    `Return only a valid JSON array containing exactly ${count} distinct message string${count === 1 ? "" : "s"}. No markdown, explanation or labels.`
  ].filter(Boolean).join("\n");
}

export function buildUserPrompt(context: string, purpose: GeneratePurpose): string {
  return [
    purpose === "auto" ? "Write the next reply to the latest incoming Tinder message." : "Draft the next dating-app message from this conversation/profile context.",
    "Use the recent conversation flow, answer what was actually said, and avoid abruptly changing subject.",
    "If there is no conversation yet, use something specific from the profile context instead of a generic hello.",
    "If context is incomplete, stay generic rather than inventing details.",
    "\n--- context ---",
    context.trim().slice(-9000),
    "--- end context ---"
  ].join("\n");
}
