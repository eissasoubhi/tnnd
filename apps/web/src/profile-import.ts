export interface ImportedProfile {
  kind: "tnnd-user-profile";
  schemaVersion: 1;
  [key: string]: unknown;
}

export function validateImportedProfile(value: unknown): { ok: true; profile: ImportedProfile } | { ok: false; error: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, error: "Profile must be a JSON object." };
  }

  const candidate = value as Record<string, unknown>;
  if (candidate.kind !== "tnnd-user-profile") {
    return { ok: false, error: "Unsupported profile kind." };
  }
  if (candidate.schemaVersion !== 1) {
    return { ok: false, error: "Unsupported profile schema version." };
  }

  return { ok: true, profile: candidate as ImportedProfile };
}

export function parseImportedProfile(raw: string): { ok: true; profile: ImportedProfile } | { ok: false; error: string } {
  try {
    return validateImportedProfile(JSON.parse(raw) as unknown);
  } catch {
    return { ok: false, error: "Invalid JSON file." };
  }
}

export function downloadProfile(profile: ImportedProfile, filename = "tnnd-profile.json"): void {
  const blob = new Blob([JSON.stringify(profile, null, 2) + "\n"], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
