import type { AppConfig } from "./types";

/**
 * Web-backed profile fields must not be copied back to the extension's local
 * fallback when an authenticated TNND account is controlling the profile.
 * This keeps offline preferences available without creating competing edits.
 *
 * Automation and flow controls currently remain browser-owned (Tinder/tab
 * integration); server-controlled sender gates are unchanged by this policy.
 */
export function settingsToSaveLocally(
  savedFallback: AppConfig,
  draft: AppConfig,
  backendConnected: boolean
): AppConfig {
  if (!backendConnected) return draft;
  return {
    ...savedFallback,
    replyCount: draft.replyCount,
    conversationFlowEnabled: draft.conversationFlowEnabled,
    conversationFlowOrder: draft.conversationFlowOrder,
    automation: { ...savedFallback.automation, ...draft.automation }
  };
}
