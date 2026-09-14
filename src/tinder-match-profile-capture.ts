export type TinderProfileCaptureInput = {
  route: string;
  firstName?: string | null;
  age?: number | null;
  bio?: string | null;
  job?: string | null;
  education?: string | null;
  location?: string | null;
  interests?: string[] | null;
  relationshipGoal?: string | null;
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
    bio?: string;
    job?: string;
    education?: string;
    location?: string;
    interests?: string[];
    relationshipGoal?: string;
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
      bio: boundedText(input.bio),
      job: boundedText(input.job),
      education: boundedText(input.education),
      location: boundedText(input.location),
      interests: interests.length ? interests : undefined,
      relationshipGoal: boundedText(input.relationshipGoal),
    },
  };
}

export function hasMeaningfulVisibleProfileFields(source: TinderVisibleProfileSource): boolean {
  const fields = source.visibleFields;
  return Boolean(
    fields.firstName
    || fields.age
    || fields.bio
    || fields.job
    || fields.education
    || fields.location
    || fields.relationshipGoal
    || fields.interests?.length
  );
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
