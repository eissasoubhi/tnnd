import { getPool } from "./db-client.js";
import { getSmartSwipeSettings } from "./smart-auto-swipe-settings.js";

export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const EXECUTION_LEASE_SECONDS = 120;
export type SmartSwipeAttemptStatus = "reserved" | "ui_observed" | "uncertain";
// Whitelist ONLY non-identifying codes created by our executor. Never persist
// arbitrary strings, page/profile content, private identifiers or error messages.
export const SMART_SWIPE_OUTCOME_REASONS = [
  "new_card_visually_observed",
  "another_like_in_flight",
  "recent_user_interaction",
  "unsafe_discovery_state",
  "like_or_card_not_unique",
  "preflight_state_changed",
  "modal_or_navigation_after_click",
  "card_transition_timeout",
  "like_action_exception",
  "route_or_modal_changed",
  "insufficient_transition_evidence",
  "card_not_confirmed_changed",
  "action_result_unavailable",
  "pre_action_guard_blocked"
] as const;
export type SmartSwipeOutcomeReason = typeof SMART_SWIPE_OUTCOME_REASONS[number];
export function safeSwipeOutcomeReason(
  status: "ui_observed" | "uncertain", reason: unknown
): reason is SmartSwipeOutcomeReason {
  if (typeof reason !== "string" ||
      !SMART_SWIPE_OUTCOME_REASONS.some(allowed => allowed === reason)) return false;
  return status === "ui_observed"
    ? reason === "new_card_visually_observed"
    : reason !== "new_card_visually_observed";
}
export type ClaimResponse =
  | { ok: true; claimed: true; dayKey: string; attemptsToday: number }
  | { ok: false; claimed: false; reason: string; attemptsToday?: number };

export function accountDayKey(nowMs: number, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(new Date(nowMs));
  const part = (name: string) => parts.find(p => p.type === name)?.value ?? "";
  return [part("year"), part("month"), part("day")].join("-");
}

export function canClaimAttempt(
  count: number, cap: number, hasUnresolved: boolean, duplicateId: boolean
): "ready" | "duplicate" | "unresolved" | "daily_cap" | "invalid" {
  if (duplicateId) return "duplicate";
  if (!Number.isSafeInteger(count) || count < 0 ||
      !Number.isSafeInteger(cap) || cap < 1) return "invalid";
  if (hasUnresolved) return "unresolved";
  if (count >= cap) return "daily_cap";
  return "ready";
}

/** Claim and resolve require a user-bound API session, never page-side scripts.
 * A PostgreSQL row lock on the account serializes competing devices.
 */
export async function claimSmartSwipeAttempt(
  userId: string, attemptId: string, deviceId: string
): Promise<ClaimResponse> {
  if (!UUID_PATTERN.test(attemptId) || !UUID_PATTERN.test(deviceId))
    return { ok: false, claimed: false, reason: "invalid_attempt_or_device" };
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const account = await client.query("SELECT id FROM users WHERE id = $1 FOR UPDATE", [userId]);
    if (!account.rows.length) { await client.query("ROLLBACK"); return { ok: false, claimed: false, reason: "account_missing" }; }
    // Read settings AFTER obtaining the account lock. A concurrent review
    // must not make a stale, pre-review settings check authorize a new Like.
    const settings = (await getSmartSwipeSettings(userId)).settings;
    if (!settings.enabled) {
      await client.query("ROLLBACK"); return { ok: false, claimed: false, reason: "swipe_disabled" };
    }
    const dayKey = accountDayKey(Date.now(), settings.timeZone);
    const gate = await client.query<{ authorized_device_id: string | null }>(
      "SELECT authorized_device_id FROM user_smart_swipe_rearm_gate WHERE user_id=$1 FOR UPDATE",
      [userId]
    );
    if (gate.rows.length && gate.rows[0].authorized_device_id !== deviceId) {
      await client.query("ROLLBACK");
      return { ok: false, claimed: false, reason: "manual_review_requires_explicit_start" };
    }
    const existing = await client.query(
      "SELECT user_id FROM user_smart_swipe_attempts WHERE attempt_id = $1", [attemptId]);
    if (existing.rows.length) {
      await client.query("ROLLBACK");
      return { ok: false, claimed: false, reason: "duplicate_attempt" };
    }
    const lease = await client.query<{ owner_device_id: string; expires_at: Date }>(
      "SELECT owner_device_id, expires_at FROM user_smart_swipe_execution_lease WHERE user_id = $1 FOR UPDATE", [userId]);
    const occupied = lease.rows[0];
    if (occupied && occupied.owner_device_id !== deviceId && occupied.expires_at.getTime() > Date.now()) {
      await client.query("ROLLBACK");
      return { ok: false, claimed: false, reason: "other_device_owns_account" };
    }
    const outstanding = await client.query(
      "SELECT 1 FROM user_smart_swipe_attempts WHERE user_id = $1 AND (status='reserved' OR (status='uncertain' AND reviewed_at IS NULL)) LIMIT 1", [userId]);
    const totals = await client.query<{ used: string }>(
      "SELECT count(*)::text AS used FROM user_smart_swipe_attempts WHERE user_id = $1 AND day_key = $2", [userId, dayKey]);
    const count = Number(totals.rows[0]?.used ?? "0");
    const decision = canClaimAttempt(count, settings.maxRightSwipesPerDay, outstanding.rows.length > 0, false);
    if (decision !== "ready") {
      await client.query("ROLLBACK");
      return { ok: false, claimed: false, reason: decision, attemptsToday: count };
    }
    await client.query(
      `INSERT INTO user_smart_swipe_execution_lease(user_id,owner_device_id,expires_at)
       VALUES($1,$2,now() + ($3::text || ' seconds')::interval)
       ON CONFLICT(user_id) DO UPDATE SET owner_device_id=EXCLUDED.owner_device_id,
          expires_at=EXCLUDED.expires_at,updated_at=now()`,
      [userId, deviceId, EXECUTION_LEASE_SECONDS]
    );
    await client.query(
      "INSERT INTO user_smart_swipe_attempts(attempt_id,user_id,day_key,status) VALUES($1,$2,$3,'reserved')",
      [attemptId, userId, dayKey]
    );
    await client.query("COMMIT");
    return { ok: true, claimed: true, dayKey, attemptsToday: count + 1 };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally { client.release(); }
}

/** A changed card is UI evidence, not Tinder's server-side receipt. */
export async function resolveSmartSwipeAttempt(
  userId: string, attemptId: string, deviceId: string,
  status: "ui_observed" | "uncertain",
  outcomeReason: SmartSwipeOutcomeReason | null = null
): Promise<{ ok: boolean; reason?: string }> {
  if (!UUID_PATTERN.test(attemptId) || !UUID_PATTERN.test(deviceId) ||
      !["ui_observed", "uncertain"].includes(status) ||
      (outcomeReason !== null && !safeSwipeOutcomeReason(status, outcomeReason)))
    return { ok: false, reason: "invalid_input" };
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT id FROM users WHERE id = $1 FOR UPDATE", [userId]);
    const owned = await client.query(
      "SELECT 1 FROM user_smart_swipe_execution_lease WHERE user_id=$1 AND owner_device_id=$2",
      [userId, deviceId]
    );
    if (!owned.rows.length) { await client.query("ROLLBACK"); return { ok: false, reason: "device_not_owner" }; }
    const result = await client.query(
      "UPDATE user_smart_swipe_attempts SET status=$4, resolved_at=now(), outcome_reason=$5 " +
      "WHERE user_id=$1 AND attempt_id=$2 AND status='reserved' " +
      "AND EXISTS (SELECT 1 FROM user_smart_swipe_execution_lease WHERE user_id=$1 AND owner_device_id=$3) RETURNING attempt_id",
      [userId, attemptId, deviceId, status, outcomeReason]
    );
    await client.query("COMMIT");
    return result.rows.length ? { ok: true } : { ok: false, reason: "attempt_not_reserved" };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally { client.release(); }
}

export async function readSmartSwipeAttemptSummary(userId: string): Promise<{
  dayKey: string; attemptsToday: number; uiObservedToday: number; unresolvedAttempts: number
}> {
  const settings = (await getSmartSwipeSettings(userId)).settings;
  const dayKey = accountDayKey(Date.now(), settings.timeZone);
  const result = await getPool().query<{ attempts_today: string; ui_today: string; unresolved: string }>(
    `SELECT count(*) FILTER (WHERE day_key = $2)::text AS attempts_today,
       count(*) FILTER (WHERE day_key = $2 AND status = 'ui_observed')::text AS ui_today,
       count(*) FILTER (WHERE status='reserved' OR (status='uncertain' AND reviewed_at IS NULL))::text AS unresolved
     FROM user_smart_swipe_attempts WHERE user_id = $1`,
    [userId, dayKey]
  );
  const row = result.rows[0];
  return {
    dayKey,
    attemptsToday: Number(row?.attempts_today ?? "0"),
    uiObservedToday: Number(row?.ui_today ?? "0"),
    unresolvedAttempts: Number(row?.unresolved ?? "0")
  };
}

/** Bounded, account-scoped operational history. No profile or device data is exposed. */
export async function readSmartSwipeAttemptHistory(userId: string): Promise<{
  attempts: Array<{ attemptId: string; dayKey: string; status: SmartSwipeAttemptStatus;
    createdAt: string; resolvedAt: string | null; outcomeReason: SmartSwipeOutcomeReason | null;
    reviewedAt: string | null }>;
}> {
  const result = await getPool().query<{
    attempt_id: string; day_key: string; status: SmartSwipeAttemptStatus;
    created_at: Date; resolved_at: Date | null;
    outcome_reason: SmartSwipeOutcomeReason | null; reviewed_at: Date | null;
  }>(
    `SELECT attempt_id, day_key, status, created_at, resolved_at, outcome_reason, reviewed_at
     FROM user_smart_swipe_attempts
     WHERE user_id = $1 ORDER BY created_at DESC, attempt_id DESC LIMIT 30`,
    [userId]
  );
  return { attempts: result.rows.map(row => ({
    attemptId: row.attempt_id,
    dayKey: row.day_key, status: row.status,
    createdAt: row.created_at.toISOString(),
    resolvedAt: row.resolved_at?.toISOString() ?? null,
    outcomeReason: row.outcome_reason ?? null,
    reviewedAt: row.reviewed_at?.toISOString() ?? null
  })) };
}


/** Manual review is a durable acknowledgement of UNKNOWN outcome, never a Like
 * receipt. Under the same per-user lock, it closes the cross-device claim gate.
 * An explicit, later Start may reauthorize one installation.
 */
export const REVIEW_UNKNOWN_ACKNOWLEDGEMENT = "acknowledge_unknown_no_retry";
export async function reviewUncertainSmartSwipeAttempt(
  userId: string, attemptId: string, acknowledgement: unknown
): Promise<{ ok: boolean; reason?: string; reviewed?: boolean }> {
  if (!UUID_PATTERN.test(attemptId) || acknowledgement !== REVIEW_UNKNOWN_ACKNOWLEDGEMENT)
    return { ok: false, reason: "invalid_review_request" };
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const account = await client.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [userId]);
    if (!account.rows.length) {
      await client.query("ROLLBACK"); return { ok: false, reason: "account_missing" };
    }
    const result = await client.query<{ status: SmartSwipeAttemptStatus;
      reviewed_at: Date | null; created_at: Date }>(
      "SELECT status, reviewed_at, created_at FROM user_smart_swipe_attempts " +
      "WHERE user_id=$1 AND attempt_id=$2 FOR UPDATE", [userId, attemptId]
    );
    const row = result.rows[0];
    if (!row) { await client.query("ROLLBACK"); return { ok: false, reason: "attempt_not_found" }; }
    if (row.status !== "uncertain") {
      await client.query("ROLLBACK"); return { ok: false, reason: "only_uncertain_attempts_can_be_reviewed" };
    }
    if (row.reviewed_at) {
      await client.query("ROLLBACK"); return { ok: true, reviewed: true };
    }
    // Prevent an operator from acknowledging a potentially in-flight Like.
    if (Date.now() - row.created_at.getTime() < 60_000) {
      await client.query("ROLLBACK"); return { ok: false, reason: "attempt_too_recent" };
    }
    await client.query(
      "UPDATE user_smart_swipe_attempts SET reviewed_at=now(), review_kind=$3 " +
      "WHERE user_id=$1 AND attempt_id=$2 AND status='uncertain' AND reviewed_at IS NULL",
      [userId, attemptId, "acknowledged_unknown_no_retry"]
    );
    // Closing this gate prevents another already-armed installation from
    // automatically taking advantage of the review. A later trusted Start
    // must claim this device explicitly; reviewing never sends any Like.
    await client.query(
      `INSERT INTO user_smart_swipe_rearm_gate (user_id, reviewed_at, authorized_device_id, authorized_at)
       VALUES ($1, now(), NULL, NULL)
       ON CONFLICT (user_id) DO UPDATE SET reviewed_at=now(),
         authorized_device_id=NULL, authorized_at=NULL`,
      [userId]
    );
    await client.query("COMMIT");
    return { ok: true, reviewed: true };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally { client.release(); }
}

/** Accurate per-account/per-day proof used ONLY for a user-initiated Start
 * to clear one matching local reservation. Historical attempt rows remain.
 */
export interface SmartSwipeDayReconciliation {
  dayKey: string;
  attempts: number;
  uiObserved: number;
  reviewedUnknown: number;
  unresolvedAcrossDays: number;
}
export function validSmartSwipeDayKey(value: unknown): value is string {
  return typeof value === "string" && /^\\d{4}-\\d{2}-\\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(value + "T00:00:00.000Z"));
}
export async function readSmartSwipeDayReconciliation(
  userId: string, dayKey: string
): Promise<SmartSwipeDayReconciliation> {
  if (!validSmartSwipeDayKey(dayKey)) throw new Error("invalid_day_key");
  const result = await getPool().query<{
    attempts: string; ui_observed: string; reviewed_unknown: string; unresolved: string
  }>(
    `SELECT count(*) FILTER (WHERE day_key=$2)::text AS attempts,
      count(*) FILTER (WHERE day_key=$2 AND status='ui_observed')::text AS ui_observed,
      count(*) FILTER (WHERE day_key=$2 AND status='uncertain'
        AND reviewed_at IS NOT NULL AND review_kind='acknowledged_unknown_no_retry')::text AS reviewed_unknown,
      count(*) FILTER (WHERE status='reserved' OR
        (status='uncertain' AND reviewed_at IS NULL))::text AS unresolved
     FROM user_smart_swipe_attempts WHERE user_id=$1`, [userId, dayKey]
  );
  const row = result.rows[0];
  return {
    dayKey,
    attempts: Number(row?.attempts ?? "0"),
    uiObserved: Number(row?.ui_observed ?? "0"),
    reviewedUnknown: Number(row?.reviewed_unknown ?? "0"),
    unresolvedAcrossDays: Number(row?.unresolved ?? "0")
  };
}

/** Only the account's authorized popup Start should call this route.
 * The lease and per-user SQL lock prevent cross-device review/start races.
 */
export async function authorizeSmartSwipeRearm(
  userId: string, deviceId: string
): Promise<{ ok: boolean; reason?: string }> {
  if (!UUID_PATTERN.test(deviceId)) return { ok: false, reason: "invalid_device_id" };
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const account = await client.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [userId]);
    if (!account.rows.length) {
      await client.query("ROLLBACK"); return { ok: false, reason: "account_missing" };
    }
    // Read after the account lock, consistent with the claim path.
    const settings = (await getSmartSwipeSettings(userId)).settings;
    if (!settings.enabled) {
      await client.query("ROLLBACK"); return { ok: false, reason: "swipe_disabled" };
    }
    const outstanding = await client.query(
      "SELECT 1 FROM user_smart_swipe_attempts WHERE user_id=$1 " +
      "AND (status='reserved' OR (status='uncertain' AND reviewed_at IS NULL)) LIMIT 1",
      [userId]
    );
    if (outstanding.rows.length) {
      await client.query("ROLLBACK"); return { ok: false, reason: "unresolved_attempt_requires_review" };
    }
    const occupied = await client.query<{ owner_device_id: string; expires_at: Date }>(
      "SELECT owner_device_id, expires_at FROM user_smart_swipe_execution_lease WHERE user_id=$1 FOR UPDATE",
      [userId]
    );
    if (occupied.rows[0] && occupied.rows[0].owner_device_id !== deviceId &&
        occupied.rows[0].expires_at.getTime() > Date.now()) {
      await client.query("ROLLBACK"); return { ok: false, reason: "other_device_owns_account" };
    }
    await client.query(
      "UPDATE user_smart_swipe_rearm_gate SET authorized_device_id=$2, authorized_at=now() " +
      "WHERE user_id=$1", [userId, deviceId]
    );
    await client.query("COMMIT");
    return { ok: true };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally { client.release(); }
}
