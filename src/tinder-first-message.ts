/** First messages are always initiated by an explicit popup action for one Tinder chat.
 * This pure policy never equates 'AI managed' with permission to send immediately. */
export interface FirstMessageReadiness {
  sameThread: boolean;
  composerFound: boolean;
  visibleMessageCandidates: number;
  savedConversationMessages: number;
  aiManagedAndActive: boolean;
  globalAutomationEnabled: boolean;
  chatAutomationEnabled: boolean;
  insideQuietHours: boolean;
  belowDailyLimit: boolean;
  alreadyAttempted: boolean;
}

export type FirstMessageBlocker =
  | "wrong_thread" | "composer_missing" | "messages_present" | "backend_history_present"
  | "ai_management_not_active" | "global_automation_off" | "chat_automation_off"
  | "quiet_hours" | "daily_limit" | "already_attempted";

export function firstMessageBlocker(state: FirstMessageReadiness): FirstMessageBlocker | null {
  if (!state.sameThread) return "wrong_thread";
  if (!state.composerFound) return "composer_missing";
  if (state.visibleMessageCandidates > 0) return "messages_present";
  if (state.savedConversationMessages > 0) return "backend_history_present";
  if (!state.aiManagedAndActive) return "ai_management_not_active";
  if (!state.globalAutomationEnabled) return "global_automation_off";
  if (!state.chatAutomationEnabled) return "chat_automation_off";
  if (state.insideQuietHours) return "quiet_hours";
  if (!state.belowDailyLimit) return "daily_limit";
  if (state.alreadyAttempted) return "already_attempted";
  return null;
}

export function firstMessageContext(firstName?: string, age?: number): string {
  // Only visible match fields, never guesses from the Tinder route or photo.
  const name = firstName?.replace(/\s+/g, " ").trim().slice(0, 80);
  const verifiedAge = Number.isInteger(age) && age! >= 18 && age! <= 120 ? age : undefined;
  return [
    "There are no previous messages in this Tinder conversation.",
    "Write two or three short separate Tinder bubbles. First bubble must be a short greeting (Salut, Hello, Hi, or Salut cv?); follow with one or two natural brief lines. No invented profile reactions, feelings, compliments, familiarity or pickup lines.",
    name ? `Visible Tinder match name: ${name}.` : "The match's name is not confirmed.",
    verifiedAge ? `Visible Tinder match age: ${verifiedAge}.` : ""
  ].filter(Boolean).join("\n");
}

export const firstMessageAttemptKey = (threadRef: string): string => `first-message:${threadRef}`;
