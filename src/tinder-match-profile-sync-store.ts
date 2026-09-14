import type { MatchProfileSyncState } from "./tinder-match-profile-sync";

const STORAGE_KEY = "tnnd.matchProfileSyncStates";
const MAX_SCOPES = 100;
const MAX_SCOPE_KEY_LENGTH = 256;
const MAX_DEDUPE_KEY_LENGTH = 256;

type StoredScopeState = {
  lastUploadedDedupeKey: string;
  updatedAt: string;
};

type StoredStateMap = Record<string, StoredScopeState>;

function cleanString(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function validTimestamp(value: unknown): string | null {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) return null;
  return value;
}

export function normalizeMatchProfileSyncStateMap(value: unknown): StoredStateMap {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const entries: Array<[string, StoredScopeState]> = [];

  for (const [rawScopeKey, rawState] of Object.entries(value as Record<string, unknown>)) {
    const scopeKey = cleanString(rawScopeKey, MAX_SCOPE_KEY_LENGTH);
    if (!scopeKey || !rawState || typeof rawState !== "object" || Array.isArray(rawState)) continue;
    const candidate = rawState as Record<string, unknown>;
    const lastUploadedDedupeKey = cleanString(candidate.lastUploadedDedupeKey, MAX_DEDUPE_KEY_LENGTH);
    const updatedAt = validTimestamp(candidate.updatedAt);
    if (!lastUploadedDedupeKey || !updatedAt) continue;
    entries.push([scopeKey, { lastUploadedDedupeKey, updatedAt }]);
  }

  entries.sort((a, b) => Date.parse(b[1].updatedAt) - Date.parse(a[1].updatedAt));
  return Object.fromEntries(entries.slice(0, MAX_SCOPES));
}

export async function loadMatchProfileSyncState(scopeKeyInput: string): Promise<MatchProfileSyncState> {
  const scopeKey = cleanString(scopeKeyInput, MAX_SCOPE_KEY_LENGTH);
  if (!scopeKey) return {};
  const result = await chrome.storage.local.get(STORAGE_KEY);
  const states = normalizeMatchProfileSyncStateMap(result[STORAGE_KEY]);
  const stored = states[scopeKey];
  return stored ? { lastUploadedDedupeKey: stored.lastUploadedDedupeKey } : {};
}

export async function saveMatchProfileSyncState(
  scopeKeyInput: string,
  state: MatchProfileSyncState,
  now = new Date()
): Promise<void> {
  const scopeKey = cleanString(scopeKeyInput, MAX_SCOPE_KEY_LENGTH);
  const dedupeKey = cleanString(state.lastUploadedDedupeKey, MAX_DEDUPE_KEY_LENGTH);
  if (!scopeKey || !dedupeKey) return;

  const result = await chrome.storage.local.get(STORAGE_KEY);
  const states = normalizeMatchProfileSyncStateMap(result[STORAGE_KEY]);
  states[scopeKey] = { lastUploadedDedupeKey: dedupeKey, updatedAt: now.toISOString() };
  const bounded = normalizeMatchProfileSyncStateMap(states);
  await chrome.storage.local.set({ [STORAGE_KEY]: bounded });
}

export async function clearMatchProfileSyncState(scopeKeyInput: string): Promise<void> {
  const scopeKey = cleanString(scopeKeyInput, MAX_SCOPE_KEY_LENGTH);
  if (!scopeKey) return;
  const result = await chrome.storage.local.get(STORAGE_KEY);
  const states = normalizeMatchProfileSyncStateMap(result[STORAGE_KEY]);
  if (!(scopeKey in states)) return;
  delete states[scopeKey];
  await chrome.storage.local.set({ [STORAGE_KEY]: states });
}
