export const profileSchemaVersion = 1 as const;

export interface TnndProfileEnvelope {
  kind: "tnnd-user-profile";
  schemaVersion: typeof profileSchemaVersion;
  profileVersion?: string;
  status?: string;
  identity?: Record<string, unknown>;
  datingIntent?: Record<string, unknown>;
  languages?: Record<string, unknown>;
  textingStyle?: Record<string, unknown>;
  automation?: Record<string, unknown>;
  conversationDefaults?: Record<string, unknown>;
  humanActionRequired?: Record<string, unknown>;
  personalMemory?: Record<string, unknown>;
  topicEngine?: Record<string, unknown>;
  matchProfileCapture?: Record<string, unknown>;
  dashboard?: Record<string, unknown>;
  contextAssembly?: Record<string, unknown>;
  storageAndSync?: Record<string, unknown>;
  privacyAndSafety?: Record<string, unknown>;
  unresolvedPreferences?: Record<string, unknown>;
}

const profileObjectSections = [
  "identity",
  "datingIntent",
  "languages",
  "textingStyle",
  "automation",
  "conversationDefaults",
  "humanActionRequired",
  "personalMemory",
  "topicEngine",
  "matchProfileCapture",
  "dashboard",
  "contextAssembly",
  "storageAndSync",
  "privacyAndSafety",
  "unresolvedPreferences"
] as const satisfies ReadonlyArray<keyof TnndProfileEnvelope>;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function validateProfileEnvelope(value: unknown): { ok: true; profile: TnndProfileEnvelope } | { ok: false; errors: string[] } {
  if (!isPlainObject(value)) {
    return { ok: false, errors: ["Profile must be a JSON object."] };
  }

  const candidate = value as Record<string, unknown>;
  const errors: string[] = [];
  if (candidate.kind !== "tnnd-user-profile") errors.push("kind must be tnnd-user-profile");
  if (candidate.schemaVersion !== profileSchemaVersion) errors.push(`schemaVersion must be ${profileSchemaVersion}`);
  if (candidate.profileVersion !== undefined && typeof candidate.profileVersion !== "string") {
    errors.push("profileVersion must be a string when provided");
  }
  if (candidate.status !== undefined && typeof candidate.status !== "string") {
    errors.push("status must be a string when provided");
  }

  for (const section of profileObjectSections) {
    const sectionValue = candidate[section];
    if (sectionValue !== undefined && !isPlainObject(sectionValue)) {
      errors.push(`${section} must be a JSON object when provided`);
    }
  }

  return errors.length
    ? { ok: false, errors }
    : { ok: true, profile: candidate as unknown as TnndProfileEnvelope };
}

export function publicProfileSchema() {
  return {
    kind: "tnnd-user-profile",
    schemaVersion: profileSchemaVersion,
    required: ["kind", "schemaVersion"],
    sections: [...profileObjectSections]
  };
}
