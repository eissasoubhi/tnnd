/** Product Design Expert: group durable settings by a clear user task. */
export const preferenceSections = [
  {
    title: "Dating intentions",
    description: "Your relationship goal, boundaries and disclosure preferences.",
    expanded: true,
    ids: ["dating-goal", "dating-goal-details", "disclosure-strategy"]
  },
  {
    title: "Your locations & Tinder Passport",
    description: "Distinguish where you come from, live and are now from where you want to meet people.",
    expanded: true,
    ids: ["origin-city", "target-cities"]
  },
  {
    title: "Message style & auto-adapt",
    description: "Set the baseline TNND follows before it adapts to each conversation.",
    expanded: true,
    ids: ["message-length", "directness", "teasing-style", "humor-style", "double-texting"]
  },
  {
    title: "Languages & culture",
    description: "Natural French, Moroccan Darija and English conversation styles.",
    expanded: false,
    ids: ["french-style", "darija-style", "english-style", "adapt-languages"]
  },
  {
    title: "Contact & handoff",
    description: "Your own Instagram/WhatsApp and where conversations should continue.",
    expanded: false,
    ids: ["profile-instagram", "profile-whatsapp", "profile-contact-preference"]
  },
  {
    title: "Multi-bubble replies",
    description: "Optional: split longer messages into two separate bubbles.",
    expanded: false,
    ids: ["multi-part-replies"]
  },
  {
    title: "Match screening",
    description: "Optional conditions that can pause automatic replies when facts are verified.",
    expanded: false,
    ids: ["pause-on-marriage"]
  },
  {
    title: "Writing details",
    description: "Fine-tune grammar, punctuation, slang and emoji usage.",
    expanded: false,
    ids: ["text-formality", "capitalization", "emoji-frequency", "abbreviations", "punctuation-density", "slang-level", "fragment-style", "grammar-style", "question-frequency"]
  },
  {
    title: "Privacy & retention",
    description: "Control how long temporary match context remains available.",
    expanded: false,
    ids: ["match-profile-retention-days"]
  }
] as const;
