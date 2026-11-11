/** Global existing-chat runner only rotates among previously saved conversations.
 * Never grants backend AI management: user must explicitly bulk/individually opt in. */
export interface ExistingChatCandidate {
  id: string;
  externalThreadId: string;
  managementState: string;
  explicitlySelected: boolean;
}
export interface ExistingChatSummary {
  id: string;
  status: string;
  lastMessageAt?: string | null;
  pendingHumanActions?: number;
}

const ELIGIBLE_STATUSES = new Set(["active", "waiting-for-them", "stale"]);

export function eligibleExistingThreadRefs(
  records: readonly ExistingChatCandidate[],
  summaries: readonly ExistingChatSummary[]
): string[] {
  const byId = new Map(summaries.map(x => [x.id, x]));
  const refs: string[] = [];
  const seen = new Set<string>();
  for (const record of records) {
    const summary = byId.get(record.id);
    const ref = record.externalThreadId?.trim();
    if (record.managementState !== "ai-managed" || !record.explicitlySelected
      || !summary || !summary.lastMessageAt || !ELIGIBLE_STATUSES.has(summary.status)
      || (summary.pendingHumanActions ?? 0) > 0 || !ref || ref.length > 512
      || ref.includes("/") || seen.has(ref)) continue;
    seen.add(ref);
    refs.push(ref);
  }
  return refs.slice(0, 200);
}

/** Starting global Chat is an explicit opt-in for synced, previously unmanaged
 * threads. Preserve choices the user already made (including Unmanaged selected
 * manually), and never override manual/archived, disabled, human-action states.
 */
export function planAutomaticExistingChatEnrollment(
  records: readonly ExistingChatCandidate[],
  summaries: readonly ExistingChatSummary[]
): { manage: string[]; resume: string[] } {
  const byId = new Map(summaries.map(item => [item.id, item]));
  const manage: string[] = [];
  const resume: string[] = [];
  const seen = new Set<string>();
  for (const record of records) {
    const chat = byId.get(record.id);
    if (!chat || !chat.lastMessageAt || (chat.pendingHumanActions ?? 0) > 0 ||
        !["active", "paused", "waiting-for-them", "stale"].includes(chat.status) ||
        !["unmanaged", "ai-managed"].includes(record.managementState) ||
        record.explicitlySelected || !record.id || seen.has(record.id) ||
        !/^[a-zA-Z0-9_-]{3,512}$/.test(record.externalThreadId)) continue;
    seen.add(record.id);
    manage.push(record.id);
    if (chat.status === "paused") resume.push(record.id);
  }
  return { manage, resume };
}

export function nextExistingThreadRef(refs: readonly string[], lastRef: string | null): string | null {
  if (!refs.length) return null;
  const index = lastRef ? refs.indexOf(lastRef) : -1;
  return refs[(index + 1) % refs.length] ?? null;
}
