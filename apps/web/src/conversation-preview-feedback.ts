export type ConversationPreviewFeedbackTag =
  | "too-long"
  | "too-short"
  | "too-formal"
  | "too-direct"
  | "not-direct-enough"
  | "too-flirty"
  | "not-flirty-enough"
  | "not-natural";

export type ConversationPreviewPresetId =
  | "shorter"
  | "more-direct"
  | "warmer"
  | "funnier"
  | "less-flirty";

export interface ConversationPreviewPreset {
  id: ConversationPreviewPresetId;
  label: string;
  instruction: string;
}

export const CONVERSATION_PREVIEW_PRESETS: readonly ConversationPreviewPreset[] = [
  { id: "shorter", label: "Shorter", instruction: "Make the reply shorter while preserving the core intent." },
  { id: "more-direct", label: "More direct", instruction: "Make the reply more direct without becoming rude or unnatural." },
  { id: "warmer", label: "Warmer", instruction: "Make the reply warmer and more personable without overdoing enthusiasm." },
  { id: "funnier", label: "Funnier", instruction: "Add light natural humor only if it fits the conversation." },
  { id: "less-flirty", label: "Less flirty", instruction: "Reduce flirting while keeping the reply engaged and natural." }
] as const;

export interface ConversationPreviewFeedbackState {
  presetId: ConversationPreviewPresetId | null;
  tags: ConversationPreviewFeedbackTag[];
}

export function emptyConversationPreviewFeedback(): ConversationPreviewFeedbackState {
  return { presetId: null, tags: [] };
}

export function setConversationPreviewPreset(
  state: ConversationPreviewFeedbackState,
  presetId: ConversationPreviewPresetId | null
): ConversationPreviewFeedbackState {
  return { ...state, presetId };
}

export function toggleConversationPreviewFeedbackTag(
  state: ConversationPreviewFeedbackState,
  tag: ConversationPreviewFeedbackTag
): ConversationPreviewFeedbackState {
  const hasTag = state.tags.includes(tag);
  return {
    ...state,
    tags: hasTag ? state.tags.filter((item) => item !== tag) : [...state.tags, tag]
  };
}

export function previewFeedbackInstruction(state: ConversationPreviewFeedbackState): string | null {
  const parts: string[] = [];
  const preset = CONVERSATION_PREVIEW_PRESETS.find((item) => item.id === state.presetId);
  if (preset) parts.push(preset.instruction);
  if (state.tags.length) parts.push(`User feedback tags: ${state.tags.join(", ")}.`);
  return parts.length ? parts.join(" ") : null;
}
