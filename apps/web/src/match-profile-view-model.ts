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

export type MatchProfileRecord = {
  id: string;
  capturedAt: string;
  updatedAt: string;
  conversationId: string | null;
  expiresAt: string | null;
  sourceCapture: {
    source: "tinder-visible-profile";
    captureMode: "read-only";
    route: string;
    visibleFields: MatchProfileVisibleFields;
  };
  normalizedProfile: {
    fields: MatchProfileVisibleFields;
    retention: {
      mode: "temporary" | "durable";
      reason: "pre-match-capture" | "conversation-linked";
      expiresAt: string | null;
    };
  };
};

export type MatchProfileViewModel = {
  title: string;
  sourceLabel: string;
  retentionLabel: string;
  freshnessLabel: string;
  fields: Array<{ label: string; value: string }>;
  sourceFields: Array<{ label: string; value: string }>;
};

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unknown" : date.toLocaleString();
}

function entries(fields: MatchProfileVisibleFields): Array<{ label: string; value: string }> {
  const values: Array<[string, string | number | string[] | undefined]> = [
    ["First name", fields.firstName],
    ["Age", fields.age],
    ["Bio", fields.bio],
    ["Job", fields.job],
    ["Education", fields.education],
    ["Location", fields.location],
    ["Interests", fields.interests],
    ["Relationship goal", fields.relationshipGoal]
  ];
  return values
    .filter(([, value]) => value !== undefined && value !== "" && (!Array.isArray(value) || value.length > 0))
    .map(([label, value]) => ({ label, value: Array.isArray(value) ? value.join(", ") : String(value) }));
}

export function buildMatchProfileViewModel(record: MatchProfileRecord, now = new Date()): MatchProfileViewModel {
  const normalized = record.normalizedProfile.fields;
  const source = record.sourceCapture.visibleFields;
  const retention = record.normalizedProfile.retention;
  const capturedAt = new Date(record.capturedAt);
  const ageMs = Number.isNaN(capturedAt.getTime()) ? null : Math.max(0, now.getTime() - capturedAt.getTime());
  const ageHours = ageMs === null ? null : Math.floor(ageMs / 3_600_000);

  return {
    title: normalized.firstName ? `${normalized.firstName}${normalized.age ? `, ${normalized.age}` : ""}` : "Captured Tinder profile",
    sourceLabel: "Visible Tinder profile · read-only capture",
    retentionLabel: retention.mode === "durable"
      ? "Durable · linked to conversation"
      : `Temporary · expires ${retention.expiresAt ? formatDate(retention.expiresAt) : "automatically"}`,
    freshnessLabel: ageHours === null ? "Capture time unknown" : ageHours < 1 ? "Captured less than 1 hour ago" : `Captured ${ageHours}h ago`,
    fields: entries(normalized),
    sourceFields: entries(source)
  };
}
