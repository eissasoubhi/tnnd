import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { getPool, closePool } from "./db-client.js";
import { defaultSmartSwipeSettings, putSmartSwipeSettings } from "./smart-auto-swipe-settings.js";
import { claimSmartSwipeAttempt, resolveSmartSwipeAttempt,
  reviewUncertainSmartSwipeAttempt, readSmartSwipeAttemptSummary,
  readSmartSwipeAttemptHistory, readSmartSwipeDayReconciliation,
  authorizeSmartSwipeRearm, REVIEW_UNKNOWN_ACKNOWLEDGEMENT } from "./smart-swipe-attempt-ledger.js";

// NEVER run against a real development/production database. Only GitHub CI
// exposes a short-lived localhost PostgreSQL service, and opt-in is mandatory.
function requireDisposableCiDatabase(): void {
  const url = new URL(process.env.DATABASE_URL ?? "");
  if (process.env.GITHUB_ACTIONS !== "true" ||
      process.env.TNND_TEST_DB_EPHEMERAL !== "yes" ||
      !["127.0.0.1", "localhost"].includes(url.hostname) ||
      url.port !== "5432" || url.pathname !== "/tnnd") {
    throw new Error("Refusing Smart Swipe DB integration test outside explicitly disposable GitHub CI");
  }
}

async function main(): Promise<void> {
  requireDisposableCiDatabase();
  const pool = getPool();
  const userId = randomUUID();
  const deviceId = randomUUID();
  const attemptId = randomUUID();
  try {
    await pool.query("INSERT INTO users(id,email,password_hash) VALUES($1,$2,$3)", [
      userId, "test+" + userId + "@invalid.example", "test-only"
    ]);
    await putSmartSwipeSettings(userId, {
      ...defaultSmartSwipeSettings(), enabled: true, timeZone: "Europe/Paris",
      maxRightSwipesPerDay: 2
    });
    const claim = await claimSmartSwipeAttempt(userId, attemptId, deviceId);
    assert.equal(claim.ok, true);
    assert.equal((await resolveSmartSwipeAttempt(userId, attemptId, deviceId,
      "uncertain", "card_transition_timeout")).ok, true);

    assert.equal((await claimSmartSwipeAttempt(userId, randomUUID(), deviceId)).reason, "unresolved");
    assert.equal((await reviewUncertainSmartSwipeAttempt(userId, attemptId,
      "any_non_authorized_value")).ok, false);
    assert.equal((await reviewUncertainSmartSwipeAttempt(userId, attemptId,
      REVIEW_UNKNOWN_ACKNOWLEDGEMENT)).reason, "attempt_too_recent");

    // Adjust only ephemeral test fixture timestamps, never live user data.
    await pool.query(
      "UPDATE user_smart_swipe_attempts SET created_at=now()-interval '2 minutes' " +
      "WHERE user_id=$1 AND attempt_id=$2", [userId, attemptId]
    );
    assert.equal((await reviewUncertainSmartSwipeAttempt(
      userId, attemptId, REVIEW_UNKNOWN_ACKNOWLEDGEMENT
    )).ok, true);
    const summary = await readSmartSwipeAttemptSummary(userId);
    assert.equal(summary.attemptsToday, 1);
    assert.equal(summary.unresolvedAttempts, 0);
    const history = await readSmartSwipeAttemptHistory(userId);
    assert.equal(history.attempts[0]?.status, "uncertain");
    assert.ok(history.attempts[0]?.reviewedAt);
    assert.equal(history.attempts[0]?.attemptId, attemptId);
    const proof = await readSmartSwipeDayReconciliation(userId, summary.dayKey);
    assert.deepEqual(proof, {
      dayKey: summary.dayKey, attempts: 1, uiObserved: 0,
      reviewedUnknown: 1, unresolvedAcrossDays: 0
    });

    // Review does NOT resume automation, not even for the same installation.
    assert.equal((await claimSmartSwipeAttempt(userId, randomUUID(), deviceId)).reason,
      "manual_review_requires_explicit_start");
    assert.equal((await claimSmartSwipeAttempt(userId, randomUUID(), randomUUID())).reason,
      "manual_review_requires_explicit_start");
    assert.equal((await authorizeSmartSwipeRearm(userId, randomUUID())).reason,
      "other_device_owns_account");
    assert.equal((await authorizeSmartSwipeRearm(userId, deviceId)).ok, true);
    const nextAttempt = randomUUID();
    assert.equal((await claimSmartSwipeAttempt(userId, nextAttempt, deviceId)).ok, true);
    assert.equal((await resolveSmartSwipeAttempt(userId, nextAttempt, deviceId,
      "ui_observed", "new_card_visually_observed")).ok, true);
    assert.equal((await claimSmartSwipeAttempt(userId, randomUUID(), deviceId)).reason, "daily_cap");
    const final = await readSmartSwipeAttemptSummary(userId);
    assert.equal(final.attemptsToday, 2);
    assert.equal(final.uiObservedToday, 1);
    assert.equal(final.unresolvedAttempts, 0);
    console.log("Smart Swipe disposable DB review/gate/quota integration passed.");
  } finally {
    await pool.query("DELETE FROM users WHERE id=$1", [userId]).catch(() => undefined);
    await closePool();
  }
}
void main().catch(error => {
  console.error("Smart Swipe disposable DB integration failed:", error instanceof Error
    ? error.message : "unknown error");
  process.exitCode = 1;
});
