import { DEFAULT_CONFIG } from "./storage";
import type { AppConfig } from "./types";

export const PROFILE_SCHEMA_VERSION = 1;

export interface ProfileBundle {
  kind: "tnnd-profile";
  schemaVersion: number;
  exportedAt: string;
  extensionVersion: string;
  config: AppConfig;
}

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export function normalizeImportedConfig(value: unknown): AppConfig {
  const raw = object(value);
  if (!raw) throw new Error("Profile config must be a JSON object.");

  const languages = object(raw.languages) ?? {};
  const identity = object(raw.identity) ?? {};
  const automation = object(raw.automation) ?? {};

  return {
    ...DEFAULT_CONFIG,
    ...raw,
    languages: { ...DEFAULT_CONFIG.languages, ...languages },
    identity: { ...DEFAULT_CONFIG.identity, ...identity },
    automation: { ...DEFAULT_CONFIG.automation, ...automation }
  } as AppConfig;
}

export function createProfileBundle(config: AppConfig): ProfileBundle {
  return {
    kind: "tnnd-profile",
    schemaVersion: PROFILE_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    extensionVersion: chrome.runtime.getManifest().version,
    config
  };
}

export function parseProfileBundle(text: string): ProfileBundle {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("The selected file is not valid JSON.");
  }

  const raw = object(parsed);
  if (!raw || raw.kind !== "tnnd-profile") throw new Error("This file is not a TNND profile bundle.");
  const schemaVersion = Number(raw.schemaVersion);
  if (!Number.isInteger(schemaVersion) || schemaVersion < 1) throw new Error("The profile schema version is invalid.");
  if (schemaVersion > PROFILE_SCHEMA_VERSION) throw new Error(`This profile needs a newer TNND version (schema ${schemaVersion}).`);

  return {
    kind: "tnnd-profile",
    schemaVersion,
    exportedAt: typeof raw.exportedAt === "string" ? raw.exportedAt : "",
    extensionVersion: typeof raw.extensionVersion === "string" ? raw.extensionVersion : "",
    config: normalizeImportedConfig(raw.config)
  };
}
