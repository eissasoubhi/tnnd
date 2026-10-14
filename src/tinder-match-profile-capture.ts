import { safeTinderPhotoUrl } from "./tinder-chat-identity.ts";

export type TinderProfileCaptureInput = {
  route: string;
  firstName?: string | null;
  age?: number | null;
  photoUrl?: string | null;
  bio?: string | null;
  job?: string | null;
  education?: string | null;
  location?: string | null;
  interests?: string[] | null;
  relationshipGoal?: string | null;
  heightCm?: number | null;
  prompts?: Array<{ section: string; question: string; answer: string }> | null;
};

export type TinderVisibleProfileSource = {
  schemaVersion: 1;
  source: "tinder-visible-profile";
  captureMode: "read-only";
  capturedAt: string;
  route: string;
  visibleFields: {
    firstName?: string;
    age?: number;
    photoUrl?: string;
    bio?: string;
    job?: string;
    education?: string;
    location?: string;
    interests?: string[];
    relationshipGoal?: string;
    heightCm?: number;
    prompts?: Array<{ section: string; question: string; answer: string }>;
  };
};

export type TinderProfileCapture = {
  schemaVersion: 1;
  source: "tinder-visible-profile";
  capturedAt: string;
  route: string;
  sourceSnapshot: TinderVisibleProfileSource;
  fields: TinderVisibleProfileSource["visibleFields"];
};

const TEXT_LIMIT = 500;
const LIST_LIMIT = 20;

function boundedText(value: string | null | undefined): string | undefined {
  const normalized = value?.replace(/\s+/g, " ").trim();
  if (!normalized) return undefined;
  return normalized.slice(0, TEXT_LIMIT);
}

function boundedAge(value: number | null | undefined): number | undefined {
  return Number.isInteger(value) && Number(value) >= 18 && Number(value) <= 120 ? Number(value) : undefined;
}

export function buildReadOnlyProfileSource(
  input: TinderProfileCaptureInput,
  capturedAt = new Date().toISOString()
): TinderVisibleProfileSource {
  const prompts = (input.prompts ?? []).slice(0, 24).map(value => ({
    section: boundedText(value.section)?.slice(0, 80) ?? "",
    question: boundedText(value.question)?.slice(0, 120) ?? "",
    answer: boundedText(value.answer)?.slice(0, 120) ?? ""
  })).filter(value => value.section && value.question && value.answer);
  const interests = (input.interests ?? [])
    .map((item) => boundedText(item))
    .filter((item): item is string => Boolean(item))
    .slice(0, LIST_LIMIT);

  return {
    schemaVersion: 1,
    source: "tinder-visible-profile",
    captureMode: "read-only",
    capturedAt,
    route: input.route.slice(0, 512),
    visibleFields: {
      firstName: boundedText(input.firstName),
      age: boundedAge(input.age),
      photoUrl: safeTinderPhotoUrl(input.photoUrl),
      bio: boundedText(input.bio),
      job: boundedText(input.job),
      education: boundedText(input.education),
      location: boundedText(input.location),
      interests: interests.length ? interests : undefined,
      ...(prompts.length ? { prompts } : {}),
      relationshipGoal: boundedText(input.relationshipGoal),
      ...(Number.isInteger(input.heightCm) && Number(input.heightCm) >= 100 && Number(input.heightCm) <= 230 ? { heightCm: Number(input.heightCm) } : {}),
    },
  };
}

export function hasMeaningfulVisibleProfileFields(source: TinderVisibleProfileSource): boolean {
  const fields = source.visibleFields;
  return Boolean(
    fields.firstName
    || fields.photoUrl
    || fields.age
    || fields.bio
    || fields.job
    || fields.education
    || fields.location
    || fields.relationshipGoal
    || fields.heightCm
    || fields.interests?.length
    || fields.prompts?.length
  );
}

export function buildProfileCaptureDedupeKey(source: TinderVisibleProfileSource): string {
  const fields = source.visibleFields;
  const serialized = JSON.stringify({
    schemaVersion: source.schemaVersion,
    source: source.source,
    route: source.route,
    fields: {
      firstName: fields.firstName ?? null,
      age: fields.age ?? null,
      photoUrl: fields.photoUrl ?? null,
      bio: fields.bio ?? null,
      job: fields.job ?? null,
      education: fields.education ?? null,
      location: fields.location ?? null,
      interests: fields.interests ?? [],
      prompts: fields.prompts ?? [],
      relationshipGoal: fields.relationshipGoal ?? null,
      heightCm: fields.heightCm ?? null
    }
  });
  // The local sync store only permits 256 chars per value. Raw JSON was
  // silently truncated, causing repeated re-uploads of every rich profile.
  // Hash stable *content*, never the capture time or personal data in clear.
  let first = 2166136261, second = 0x811c9dc7 ^ 0x9e3779b9;
  for (let index = 0; index < serialized.length; index++) {
    const unit = serialized.charCodeAt(index);
    first = Math.imul(first ^ unit, 16777619) >>> 0;
    second = Math.imul(second ^ unit, 2246822519) >>> 0;
  }
  return `v2:${serialized.length}:${first.toString(16)}:${second.toString(16)}`;
}

export function normalizeProfileCaptureSource(sourceSnapshot: TinderVisibleProfileSource): TinderProfileCapture {
  return {
    schemaVersion: sourceSnapshot.schemaVersion,
    source: sourceSnapshot.source,
    capturedAt: sourceSnapshot.capturedAt,
    route: sourceSnapshot.route,
    sourceSnapshot,
    fields: { ...sourceSnapshot.visibleFields },
  };
}

export function buildReadOnlyProfileCapture(
  input: TinderProfileCaptureInput,
  capturedAt = new Date().toISOString()
): TinderProfileCapture {
  return normalizeProfileCaptureSource(buildReadOnlyProfileSource(input, capturedAt));
}
