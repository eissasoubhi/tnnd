import type { EffectiveConversationContext } from "./effective-conversation-context.js";

export interface GeminiConversationPayload {
  settings: EffectiveConversationContext["settings"];
  instructions: string[];
  provenance: EffectiveConversationContext["provenance"];
}

export function buildGeminiConversationPayload(context: EffectiveConversationContext): GeminiConversationPayload {
  const instructions = context.instructionStack
    .map((value) => value.trim())
    .filter(Boolean)
    .slice(0, 4);

  return {
    settings: { ...context.settings },
    instructions,
    provenance: {
      overriddenFields: [...context.provenance.overriddenFields],
      hasPersistentInstruction: context.provenance.hasPersistentInstruction,
      hasTemporaryInstruction: context.provenance.hasTemporaryInstruction
    }
  };
}

export function serializeGeminiConversationPayload(context: EffectiveConversationContext): string {
  return JSON.stringify(buildGeminiConversationPayload(context));
}
