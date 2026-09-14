export type MatchProfileVisibleFields = {
  firstName?: string;
  age?: number;
  bio?: string;
  job?: string;
  education?: string;
  location?: string;
  interests?: string[];
  relationshipGoal?: string;
};

export type MatchProfileSourceCapture = {
  schemaVersion: 1;
  source: "tinder-visible-profile";
  captureMode: "read-only";
  capturedAt: string;
  route: string;
  visibleFields: MatchProfileVisibleFields;
};

export type MatchProfileRetention = {
  mode: "temporary" | "durable";
  reason: "pre-match-capture" | "conversation-linked";
  expiresAt: string | null;
};

export type NormalizedMatchProfile = {
  schemaVersion: 1;
  source: "tinder-visible-profile";
  capturedAt: string;
  route: string;
  fields: MatchProfileVisibleFields;
  retention: MatchProfileRetention;
  conversationRef: string | null;
};

const TEXT_LIMIT = 500;
const LIST_LIMIT = 20;
const ROUTE_LIMIT = 512;
const TEMPORARY_RETENTION_DAYS = 7;

function normalizeText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized ? normalized.slice(0, TEXT_LIMIT) : undefined;
}

function normalizeAge(value: unknown): number | undefined {
  return Number.isInteger(value) && Number(value) >= 18 && Number(value) <= 120 ? Number(value) : undefined;
}

function normalizeFields(value: unknown): MatchProfileVisibleFields {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const input = value as Record<string, unknown>;
  const interests = Array.isArray(input.interests)
    ? input.interests.map(normalizeText).filter((item): item is string => Boolean(item)).slice(0, LIST_LIMIT)
    : [];

  return {
    firstName: normalizeText(input.firstName),
    age: normalizeAge(input.age),
    bio: normalizeText(input.bio),
    job: normalizeText(input.job),
    education: normalizeText(input.education),
    location: normalizeText(input.location),
    interests: interests.length ? interests : undefined,
    relationshipGoal: normalizeText(input.relationshipGoal),
  };
}

export function parseMatchProfileSourceCapture(value: unknown): MatchProfileSourceCapture {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid_match_profile_capture");
  const input = value as Record<string, unknown>;
  if (input.schemaVersion !== 1 || input.source !== "tinder-visible-profile" || input.captureMode !== "read-only") {
    throw new Error("invalid_match_profile_capture");
  }
  if (typeof input.capturedAt !== "string" || Number.isNaN(Date.parse(input.capturedAt))) throw new Error("invalid_match_profile_captured_at");
  if (typeof input.route !== "string") throw new Error("invalid_match_profile_route");

  return {
    schemaVersion: 1,
    source: "tinder-visible-profile",
    captureMode: "read-only",
    capturedAt: new Date(input.capturedAt).toISOString(),
    route: input.route.slice(0, ROUTE_LIMIT),
    visibleFields: normalizeFields(input.visibleFields),
  };
}

export function normalizeMatchProfile(
  capture: MatchProfileSourceCapture,
  options: { conversationRef?: string | null; now?: Date } = {}
): NormalizedMatchProfile {
  const conversationRef = normalizeText(options.conversationRef) ?? null;
  const now = options.now ?? new Date();
  const durable = Boolean(conversationRef);
  const expiresAt = durable
    ? null
    : new Date(now.getTime() + TEMPORARY_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();

  return {
    schemaVersion: 1,
    source: capture.source,
    capturedAt: capture.capturedAt,
    route: capture.route,
    fields: { ...capture.visibleFields },
    retention: {
      mode: durable ? "durable" : "temporary",
      reason: durable ? "conversation-linked" : "pre-match-capture",
      expiresAt,
    },
    conversationRef,
  };
}
