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

export type TinderProfileCapture = {
  schemaVersion: 1;
  source: "tinder-visible-profile";
  capturedAt: string;
  route: string;
  fields: {
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

const TEXT_LIMIT = 500;
const LIST_LIMIT = 20;

function boundedText(value: string | null | undefined): string | undefined {
  const normalized = value?.replace(/\s+/g, " ").trim();
  if (!normalized) return undefined;
  return normalized.slice(0, TEXT_LIMIT);
}

export function buildReadOnlyProfileCapture(input: TinderProfileCaptureInput, capturedAt = new Date().toISOString()): TinderProfileCapture {
  const interests = (input.interests ?? [])
    .map((item) => boundedText(item))
    .filter((item): item is string => Boolean(item))
    .slice(0, LIST_LIMIT);

  return {
    schemaVersion: 1,
    source: "tinder-visible-profile",
    capturedAt,
    route: input.route.slice(0, 512),
    fields: {
      firstName: boundedText(input.firstName),
      age: Number.isInteger(input.age) && Number(input.age) >= 18 && Number(input.age) <= 120 ? Number(input.age) : undefined,
      bio: boundedText(input.bio),
      job: boundedText(input.job),
      education: boundedText(input.education),
      location: boundedText(input.location),
      interests: interests.length ? interests : undefined,
      relationshipGoal: boundedText(input.relationshipGoal),
    },
  };
}
