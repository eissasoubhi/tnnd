import { getPool } from "./db-client.js";
import { getSmartSwipeSettings } from "./smart-auto-swipe-settings.js";

export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const EXECUTION_LEASE_SECONDS = 120;
export type SmartSwipeAttemptStatus = "reserved" | "ui_observed" | "uncertain";
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
  const settingsResponse = await getSmartSwipeSettings(userId);
  const settings = settingsResponse.settings;
  if (!settings.enabled) return { ok: false, claimed: false, reason: "swipe_disabled" };
  const dayKey = accountDayKey(Date.now(), settings.timeZone);
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const account = await client.query("SELECT id FROM users WHERE id = $1 FOR UPDATE", [userId]);
    if (!account.rows.length) { await client.query("ROLLBACK"); return { ok: false, claimed: false, reason: "account_missing" }; }
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
      "SELECT 1 FROM user_smart_swipe_attempts WHERE user_id = $1 AND status IN ('reserved','uncertain') LIMIT 1", [userId]);
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
  status: "ui_observed" | "uncertain"
): Promise<{ ok: boolean; reason?: string }> {
  if (!UUID_PATTERN.test(attemptId) || !UUID_PATTERN.test(deviceId) ||
      !["ui_observed", "uncertain"].includes(status)) return { ok: false, reason: "invalid_input" };
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
      "UPDATE user_smart_swipe_attempts SET status=$4, resolved_at=now() " +
      "WHERE user_id=$1 AND attempt_id=$2 AND status='reserved' " +
      "AND EXISTS (SELECT 1 FROM user_smart_swipe_execution_lease WHERE user_id=$1 AND owner_device_id=$3) RETURNING attempt_id",
      [userId, attemptId, deviceId, status]
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
       count(*) FILTER (WHERE status IN ('reserved','uncertain'))::text AS unresolved
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
  attempts: Array<{ dayKey: string; status: SmartSwipeAttemptStatus;
    createdAt: string; resolvedAt: string | null }>;
}> {
  const result = await getPool().query<{
    day_key: string; status: SmartSwipeAttemptStatus;
    created_at: Date; resolved_at: Date | null;
  }>(
    `SELECT day_key, status, created_at, resolved_at
     FROM user_smart_swipe_attempts
     WHERE user_id = $1 ORDER BY created_at DESC, attempt_id DESC LIMIT 30`,
    [userId]
  );
  return { attempts: result.rows.map(row => ({
    dayKey: row.day_key, status: row.status,
    createdAt: row.created_at.toISOString(),
    resolvedAt: row.resolved_at?.toISOString() ?? null
  })) };
}
