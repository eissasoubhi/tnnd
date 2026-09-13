export interface TinderMessageDeltaItem<T> {
  key: string;
  value: T;
}

export interface TinderMessageDeltaResult<T> {
  items: TinderMessageDeltaItem<T>[];
  nextCursor: string | null;
  cursorFound: boolean;
  truncated: boolean;
}

export interface TinderMessageDeltaOptions {
  maxItems?: number;
}

function normalizedLimit(value: number | undefined): number {
  if (!Number.isInteger(value) || (value ?? 0) <= 0) return 50;
  return Math.min(value as number, 200);
}

export function planTinderMessageDelta<T>(
  messagesOldestFirst: readonly TinderMessageDeltaItem<T>[],
  lastSeenKey: string | null,
  options: TinderMessageDeltaOptions = {}
): TinderMessageDeltaResult<T> {
  const limit = normalizedLimit(options.maxItems);
  const deduped: TinderMessageDeltaItem<T>[] = [];
  const seen = new Set<string>();

  for (const message of messagesOldestFirst) {
    const key = message.key.trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    deduped.push({ key, value: message.value });
  }

  const normalizedCursor = lastSeenKey?.trim() || null;
  const cursorIndex = normalizedCursor
    ? deduped.findIndex((message) => message.key === normalizedCursor)
    : -1;
  const cursorFound = normalizedCursor === null || cursorIndex >= 0;
  const unseen = normalizedCursor === null
    ? deduped
    : cursorIndex >= 0
      ? deduped.slice(cursorIndex + 1)
      : deduped;

  const truncated = unseen.length > limit;
  const items = unseen.slice(Math.max(0, unseen.length - limit));
  const nextCursor = items.at(-1)?.key ?? (cursorFound ? normalizedCursor : null);

  return { items, nextCursor, cursorFound, truncated };
}
