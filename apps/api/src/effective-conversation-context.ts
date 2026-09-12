import type { ConversationOverrides } from "./conversation-overrides.js";

export type TemporaryInstructionScope = "next-message" | "next-n-replies" | "until-cleared";

export interface TemporaryConversationInstruction {
  text: string;
  scope: TemporaryInstructionScope;
  remainingReplies?: number | null;
}

export interface GlobalConversationDefaults extends ConversationOverrides {
  languages?: Partial<{ fr: number; darija: number; en: number }>;
}

export interface EffectiveConversationContext {
  settings: ConversationOverrides;
  instructionStack: string[];
  temporaryInstruction: TemporaryConversationInstruction | null;
  provenance: {
    overriddenFields: Array<keyof ConversationOverrides>;
    hasPersistentInstruction: boolean;
    hasTemporaryInstruction: boolean;
  };
}

function definedEntries<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined)
  ) as Partial<T>;
}

function mergeLanguageWeights(
  defaults: ConversationOverrides["languages"],
  overrides: ConversationOverrides["languages"]
): ConversationOverrides["languages"] {
  if (!defaults && !overrides) return undefined;
  return {
    ...(defaults ?? {}),
    ...(overrides ?? {})
  };
}

export function buildEffectiveConversationContext(
  defaults: GlobalConversationDefaults,
  overrides: ConversationOverrides = {},
  temporaryInstruction: TemporaryConversationInstruction | null = null
): EffectiveConversationContext {
  const cleanDefaults = definedEntries(defaults);
  const cleanOverrides = definedEntries(overrides);
  const languages = mergeLanguageWeights(defaults.languages, overrides.languages);

  const settings: ConversationOverrides = {
    ...cleanDefaults,
    ...cleanOverrides,
    ...(languages ? { languages } : {})
  };

  const persistentInstruction = settings.persistentInstructions?.trim() ?? "";
  const temporaryText = temporaryInstruction?.text.trim() ?? "";
  const instructionStack = [persistentInstruction, temporaryText].filter(Boolean);

  return {
    settings,
    instructionStack,
    temporaryInstruction: temporaryInstruction && temporaryText
      ? { ...temporaryInstruction, text: temporaryText }
      : null,
    provenance: {
      overriddenFields: Object.keys(cleanOverrides) as Array<keyof ConversationOverrides>,
      hasPersistentInstruction: Boolean(persistentInstruction),
      hasTemporaryInstruction: Boolean(temporaryText)
    }
  };
}
