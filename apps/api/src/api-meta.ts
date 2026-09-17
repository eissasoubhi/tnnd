import { analyticsCapability } from "./analytics-route.js";

export const apiVersion = "v1";

export const apiCapabilities = [
  "health",
  "profile-schema",
  "account-registration",
  "password-login",
  "session-auth",
  "session-revocation",
  "session-management",
  "session-client-metadata",
  "account-profile",
  "texting-style-analysis",
  "extension-sync-foundation",
  "conversation-sync",
  "conversation-read",
  "conversation-thread-lookup",
  "conversation-status-control",
  "conversation-management",
  "conversation-temporary-instructions",
  "conversation-overrides",
  "conversation-generation",
  "conversation-outgoing-confirmation",
  "match-profiles",
  "human-actions",
  "human-action-manual-answer",
  analyticsCapability,
  "security-baseline"
] as const;

export function apiMeta() {
  return { apiVersion, capabilities: [...apiCapabilities] };
}
