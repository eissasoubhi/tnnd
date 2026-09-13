import type { ConversationOverridesPayload } from "./conversation-overrides-model";

export interface ConversationOverrideProvenanceSummary {
  overriddenFields: string[];
  nestedLanguageFields: string[];
}

export function summarizeOverrideProvenance(overrides: ConversationOverridesPayload): ConversationOverrideProvenanceSummary {
  const overriddenFields = Object.entries(overrides)
    .filter(([, value]) => value !== undefined)
    .map(([key]) => key)
    .sort();
  const nestedLanguageFields = Object.entries(overrides.languages ?? {})
    .filter(([, value]) => value !== undefined)
    .map(([key]) => key)
    .sort();
  return { overriddenFields, nestedLanguageFields };
}
