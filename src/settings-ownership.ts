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


/** Browser-owned sender controls are never silently overwritten by imported
 * profile defaults. Only the extension's explicit local controls may enable
 * auto-replies; other Web-owned effective settings remain intact.
 */
export function withBrowserRuntimeControls(local: AppConfig, fromWeb: AppConfig): AppConfig {
  return {
    ...fromWeb,
    automation: {
      ...fromWeb.automation,
      enabled: local.automation.enabled,
      replyDelayMinSeconds: local.automation.replyDelayMinSeconds,
      replyDelayMaxSeconds: local.automation.replyDelayMaxSeconds,
      openerDelayMinSeconds: local.automation.openerDelayMinSeconds,
      openerDelayMaxSeconds: local.automation.openerDelayMaxSeconds,
      maxFirstMessagesPerDay: local.automation.maxFirstMessagesPerDay,
      maxAutoRepliesPerDay: local.automation.maxAutoRepliesPerDay,
      quietHoursEnabled: local.automation.quietHoursEnabled,
      quietStart: local.automation.quietStart,
      quietEnd: local.automation.quietEnd
    }
  };
}
