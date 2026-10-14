/** User-scoped, position-independent cache of Tinder conversations to inspect.
 * Source of truth remains server conversation management and the verified
 * message thread; this queue never authorizes an AI send by itself.
 * The server already persists each conversation under externalThreadId.
 */
export interface IndexedThread {
  ref: string;
  serverMessageAt: string | null;
  lastMessageDirection?: "incoming" | "outgoing" | null;
  checkedMessageAt: string | null;
  lastCheckedAt: string | null;
  queuedAt: string | null;
  unreadAt: string | null;
}
export interface ExistingThreadIndex {
  schemaVersion: 1;
  userId: string;
  threads: IndexedThread[];
  updatedAt: string;
}
export const RECHECK_IDLE_MS = 30 * 60_000;
export const UNREAD_HINT_COOLDOWN_MS = 60_000;
const LIMIT = 200;
const goodRef = (ref: string) => Boolean(ref && ref.length <= 512 && !ref.includes("/"));
export function reconcileExistingIndex(
  previous: ExistingThreadIndex | null,
  userId: string,
  eligible: readonly { ref: string; lastMessageAt: string | null; lastMessageDirection?: "incoming" | "outgoing" | null }[],
  now = new Date().toISOString()
): ExistingThreadIndex {
  const previousEntries = previous?.userId === userId
    ? new Map(previous.threads.map(entry => [entry.ref, entry]))
    : new Map<string, IndexedThread>();
  const seen = new Set<string>();
  const threads: IndexedThread[] = [];
  for (const { ref, lastMessageAt, lastMessageDirection } of eligible) {
    if (!goodRef(ref) || seen.has(ref)) continue;
    seen.add(ref);
    const old = previousEntries.get(ref);
    const nextMessageAt = lastMessageAt ?? null;
    const changed = Boolean(old && nextMessageAt && nextMessageAt !== old.checkedMessageAt);
    const direction = lastMessageDirection ?? null;
    // Synced outgoing chats are already answered: skip initial pass, unless Tinder reports unread.
    // Periodic safety recheck remains, but less frequently than for potential incoming chats.
    const idleDelay = direction === "outgoing" ? 6 * 60 * 60_000 : RECHECK_IDLE_MS;
    const stale = old?.lastCheckedAt && Date.parse(now) - Date.parse(old.lastCheckedAt) >= idleDelay;
    const pending = (!old && direction !== "outgoing") || Boolean(old?.queuedAt)
      || (changed && direction !== "outgoing") || stale;
    threads.push({
      ref, serverMessageAt: nextMessageAt, lastMessageDirection: direction,
      checkedMessageAt: old?.checkedMessageAt ?? null,
      lastCheckedAt: old?.lastCheckedAt ?? null,
      queuedAt: pending ? (old?.queuedAt ?? now) : null,
      unreadAt: old?.unreadAt ?? null
    });
    if (threads.length >= LIMIT) break;
  }
  return { schemaVersion: 1, userId, threads, updatedAt: now };
}
export function markThreadChecked(
  state: ExistingThreadIndex, ref: string, at = new Date().toISOString()
): ExistingThreadIndex {
  return { ...state,
    threads: state.threads.map(entry => entry.ref === ref ? {
      ...entry, checkedMessageAt: entry.serverMessageAt,
      lastCheckedAt: at, queuedAt: null, unreadAt: null
    } : entry),
    updatedAt: at
  };
}
export function observeUnreadThreads(
  state: ExistingThreadIndex, refs: readonly string[], at = new Date().toISOString()
): ExistingThreadIndex {
  const unread = new Set(refs.filter(goodRef));
  const time = Date.parse(at);
  return { ...state,
    threads: state.threads.map(entry => {
      if (!unread.has(entry.ref)) return entry;
      // One hint per cooldown to avoid resending indefinitely while Tinder
      // keeps the badge visible. A true new DB message time will requeue later.
      if (entry.lastCheckedAt && time - Date.parse(entry.lastCheckedAt) < UNREAD_HINT_COOLDOWN_MS) return entry;
      return { ...entry, queuedAt: entry.queuedAt ?? at, unreadAt: at };
    }), updatedAt: at
  };
}
export function nextIndexedExistingThread(state: ExistingThreadIndex): string | null {
  const pending = state.threads.filter(t => t.queuedAt);
  if (!pending.length) return null;
  pending.sort((a,b) =>
    Number(Boolean(b.unreadAt)) - Number(Boolean(a.unreadAt))
    || Number(b.lastMessageDirection === "incoming") - Number(a.lastMessageDirection === "incoming")
    || (a.queuedAt ?? "").localeCompare(b.queuedAt ?? "")
    || a.ref.localeCompare(b.ref)
  );
  return pending[0]?.ref ?? null;
}
export function isExistingThreadIndex(value: unknown): value is ExistingThreadIndex {
  if (!value || typeof value !== "object") return false;
  const state = value as Partial<ExistingThreadIndex>;
  return state.schemaVersion === 1 && typeof state.userId === "string"
    && Array.isArray(state.threads) && state.threads.length <= LIMIT
    && state.threads.every(t => goodRef(t.ref) && (t.queuedAt === null || typeof t.queuedAt === "string")
      && (t.lastCheckedAt === null || typeof t.lastCheckedAt === "string"))
    && typeof state.updatedAt === "string";
}
