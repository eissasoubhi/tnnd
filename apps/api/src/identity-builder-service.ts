import { createHash } from "node:crypto";
import { getPool } from "./db-client.js";
import { analyzeIdentityWithGemini, type IdentityAnalysisResult } from "./identity-builder-provider.js";
import { normalizeIdentitySource, parseIdentityStructuredAnalysis, type IdentityStructuredAnalysis } from "./identity-builder-contract.js";
import { createDefaultUserProfile, profileSchemaVersion, validateProfileEnvelope, type TnndProfileEnvelope } from "./profile-schema.js";

export interface IdentityBuilderState {
  sourceText: string;
  sourceHash: string;
  analysis: IdentityStructuredAnalysis;
  reviewStatus: "draft" | "approved";
  analysisModel: string;
  analyzedAt: string;
  approvedAt: string | null;
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

async function loadProfile(userId: string): Promise<TnndProfileEnvelope> {
  const result = await getPool().query<{ profile_json: unknown }>(
    "SELECT profile_json FROM user_profiles WHERE user_id = $1 LIMIT 1",
    [userId]
  );
  const validated = validateProfileEnvelope(result.rows[0]?.profile_json);
  return validated.ok ? validated.profile : createDefaultUserProfile();
}

async function saveProfile(userId: string, profile: TnndProfileEnvelope): Promise<void> {
  await getPool().query(
    `INSERT INTO user_profiles (user_id, schema_version, profile_json)
     VALUES ($1, $2, $3::jsonb)
     ON CONFLICT (user_id) DO UPDATE SET
       schema_version = EXCLUDED.schema_version,
       profile_json = EXCLUDED.profile_json,
       updated_at = now()`,
    [userId, profileSchemaVersion, JSON.stringify(profile)]
  );
}

function stateFromProfile(profile: TnndProfileEnvelope): IdentityBuilderState | null {
  const raw = objectValue(profile.identityBuilder);
  if (!raw.sourceText || !raw.sourceHash || !raw.analysis) return null;
  try {
    return {
      sourceText: normalizeIdentitySource(raw.sourceText),
      sourceHash: String(raw.sourceHash),
      analysis: parseIdentityStructuredAnalysis(raw.analysis),
      reviewStatus: raw.reviewStatus === "approved" ? "approved" : "draft",
      analysisModel: typeof raw.analysisModel === "string" ? raw.analysisModel : "unknown",
      analyzedAt: typeof raw.analyzedAt === "string" ? raw.analyzedAt : new Date(0).toISOString(),
      approvedAt: typeof raw.approvedAt === "string" ? raw.approvedAt : null
    };
  } catch {
    return null;
  }
}

export async function getIdentityBuilderState(userId: string): Promise<IdentityBuilderState | null> {
  return stateFromProfile(await loadProfile(userId));
}

export async function analyzeIdentityOnce(
  userId: string,
  sourceValue: unknown,
  analyzer: (userId: string, source: unknown) => Promise<IdentityAnalysisResult> = analyzeIdentityWithGemini
): Promise<{ state: IdentityBuilderState; cached: boolean }> {
  const sourceText = normalizeIdentitySource(sourceValue);
  const sourceHash = createHash("sha256").update(sourceText).digest("hex");
  const profile = await loadProfile(userId);
  const existing = stateFromProfile(profile);
  if (existing?.sourceHash === sourceHash) return { state: existing, cached: true };

  const generated = await analyzer(userId, sourceText);
  const state: IdentityBuilderState = {
    sourceText,
    sourceHash,
    analysis: generated.analysis,
    reviewStatus: "draft",
    analysisModel: generated.model,
    analyzedAt: new Date().toISOString(),
    approvedAt: null
  };
  await saveProfile(userId, { ...profile, identityBuilder: state as unknown as Record<string, unknown> });
  return { state, cached: false };
}

export async function approveIdentity(
  userId: string,
  analysisValue?: unknown
): Promise<IdentityBuilderState> {
  const profile = await loadProfile(userId);
  const existing = stateFromProfile(profile);
  if (!existing) throw new Error("identity_builder_not_analyzed");
  const analysis = analysisValue === undefined ? existing.analysis : parseIdentityStructuredAnalysis(analysisValue);
  const approvedAt = new Date().toISOString();
  const state: IdentityBuilderState = { ...existing, analysis, reviewStatus: "approved", approvedAt };
  const currentIdentity = objectValue(profile.identity);
  const identity = {
    ...currentIdentity,
    summary: analysis.summary,
    stableFacts: analysis.stableFacts,
    interests: analysis.interests,
    lifestyle: analysis.lifestyle,
    preferences: analysis.preferences,
    personalityTraits: analysis.personalityTraits,
    conversationTopics: analysis.conversationTopics,
    avoidTopics: analysis.avoidTopics
  };
  await saveProfile(userId, {
    ...profile,
    identity,
    identityBuilder: state as unknown as Record<string, unknown>
  });
  return state;
}
