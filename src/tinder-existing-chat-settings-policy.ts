/** Globally eligible chats must already be AI-managed and Active in TNND Web.
 * A saved per-chat OFF is an explicit exclusion unless the user separately
 * confirms reactivation. Never infer an OFF is merely missing/default.
 */
export interface ExistingChatPermissionPartition {
  ready: string[];
  disabled: string[];
}
export function partitionExistingChatPermissions(
  authorized: readonly string[],
  settingsByRef: ReadonlyMap<string, { enabled: boolean }>
): ExistingChatPermissionPartition {
  const ready: string[] = [];
  const disabled: string[] = [];
  const seen = new Set<string>();
  for (const ref of authorized) {
    if (!ref || seen.has(ref)) continue;
    seen.add(ref);
    if (settingsByRef.get(ref)?.enabled === false) disabled.push(ref);
    else ready.push(ref);
  }
  return { ready, disabled };
}
