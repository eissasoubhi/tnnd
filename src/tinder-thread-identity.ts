const CONVERSATION_PREFIX = "/app/messages/";

function normalizePath(value: string): string {
  const raw = value.trim();
  if (!raw) return "/";
  try {
    return new URL(raw, "https://tinder.com").pathname.replace(/\/+$/, "") || "/";
  } catch {
    const path = raw.split(/[?#]/, 1)[0] ?? "/";
    return (path.startsWith("/") ? path : `/${path}`).replace(/\/+$/, "") || "/";
  }
}

export function tinderThreadKeyFromPath(value: string): string {
  const path = normalizePath(value);
  return path.startsWith(CONVERSATION_PREFIX) && path.length > CONVERSATION_PREFIX.length
    ? path
    : path;
}

export function hashTinderThreadKey(value: string): string {
  const normalized = tinderThreadKeyFromPath(value);
  let hash = 2166136261;
  for (let index = 0; index < normalized.length; index += 1) {
    hash ^= normalized.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}
