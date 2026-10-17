/** Single-tab, single-account safety gates for the explicit automatic-mode arm.
 * Separate from user preference storage; never start a Tinder action by default.
 */
export interface AutoSwipeDriveContext {
  armed: boolean;
  settingsEnabled: boolean;
  authenticated: boolean;
  oneTinderTab: boolean;
  selectedTabMatches: boolean;
  userOwnsTab: boolean;
  existingRunnerEnabled: boolean;
  newMatchRunnerEnabled: boolean;
  userTakeover: boolean;
}
export type DriveDecision = "allowed" | "not_armed" | "disabled" | "not_signed_in"
  | "multiple_tinder_tabs" | "tab_changed" | "account_mismatch"
  | "existing_runner_active" | "new_match_runner_active" | "user_takeover";
export function decideAutoSwipeDrive(c: AutoSwipeDriveContext): DriveDecision {
  if (!c.armed) return "not_armed";
  if (!c.settingsEnabled) return "disabled";
  if (!c.authenticated) return "not_signed_in";
  if (!c.oneTinderTab) return "multiple_tinder_tabs";
  if (!c.selectedTabMatches) return "tab_changed";
  if (!c.userOwnsTab) return "account_mismatch";
  if (c.userTakeover) return "user_takeover";
  if (c.existingRunnerEnabled) return "existing_runner_active";
  if (c.newMatchRunnerEnabled) return "new_match_runner_active";
  return "allowed";
}
