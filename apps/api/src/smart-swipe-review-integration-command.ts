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

function expectClaimDenied(
  result: Awaited<ReturnType<typeof claimSmartSwipeAttempt>>, reason: string
): void {
  assert.equal(result.ok, false);
  if (result.ok) throw new Error("Unexpected successful claim");
  assert.equal(result.reason, reason);
}

async function main(): Promise<void> {
  requireDisposableCiDatabase();
  const pool = getPool();
  const userId = randomUUID();
  const noClickUserId = randomUUID();
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

    expectClaimDenied(await claimSmartSwipeAttempt(userId, randomUUID(), deviceId), "unresolved");
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
    expectClaimDenied(await claimSmartSwipeAttempt(userId, randomUUID(), deviceId),
      "manual_review_requires_explicit_start");
    expectClaimDenied(await claimSmartSwipeAttempt(userId, randomUUID(), randomUUID()),
      "manual_review_requires_explicit_start");
    assert.equal((await authorizeSmartSwipeRearm(userId, randomUUID())).reason,
      "other_device_owns_account");
    assert.equal((await authorizeSmartSwipeRearm(userId, deviceId)).ok, true);
    const nextAttempt = randomUUID();
    assert.equal((await claimSmartSwipeAttempt(userId, nextAttempt, deviceId)).ok, true);
    assert.equal((await resolveSmartSwipeAttempt(userId, nextAttempt, deviceId,
      "ui_observed", "new_card_visually_observed")).ok, true);
    expectClaimDenied(await claimSmartSwipeAttempt(userId, randomUUID(), deviceId), "daily_cap");
    const final = await readSmartSwipeAttemptSummary(userId);
    assert.equal(final.attemptsToday, 2);
    assert.equal(final.uiObservedToday, 1);
    assert.equal(final.unresolvedAttempts, 0);
    // A provably blocked pre-click action is preserved in history but must
    // NOT freeze future attempts. Unknown-after-click still requires review.
    await pool.query("INSERT INTO users(id,email,password_hash) VALUES($1,$2,$3)", [
      noClickUserId, "test+" + noClickUserId + "@invalid.example", "test-only"
    ]);
    await putSmartSwipeSettings(noClickUserId, {
      ...defaultSmartSwipeSettings(), enabled: true, timeZone: "Europe/Paris",
      maxRightSwipesPerDay: 2
    });
    const noClickAttempt = randomUUID();
    assert.equal((await claimSmartSwipeAttempt(noClickUserId, noClickAttempt, deviceId)).ok, true);
    assert.equal((await resolveSmartSwipeAttempt(noClickUserId, noClickAttempt, deviceId,
      "not_clicked", "card_transition_timeout")).reason, "invalid_input",
      "post-click timeouts must not be reclassified as no Like");
    assert.equal((await resolveSmartSwipeAttempt(noClickUserId, noClickAttempt, deviceId,
      "not_clicked", null)).reason, "invalid_input", "proof is mandatory");
    assert.equal((await resolveSmartSwipeAttempt(noClickUserId, noClickAttempt, deviceId,
      "not_clicked", "preflight_state_changed")).ok, true);
    const noClickSummary = await readSmartSwipeAttemptSummary(noClickUserId);
    assert.equal(noClickSummary.attemptsToday, 1, "not_clicked consumes the original daily slot");
    assert.equal(noClickSummary.unresolvedAttempts, 0, "verified no-click cannot block Swipe");
    assert.equal(noClickSummary.uiObservedToday, 0, "not_clicked is not a Tinder receipt");
    const noClickHistory = await readSmartSwipeAttemptHistory(noClickUserId);
    assert.equal(noClickHistory.attempts[0]?.status, "not_clicked");
    assert.equal(noClickHistory.attempts[0]?.outcomeReason, "preflight_state_changed");
    assert.equal((await claimSmartSwipeAttempt(noClickUserId, randomUUID(), deviceId)).ok, true,
      "a subsequent distinct claim is permitted without deleting historical attempts");
    console.log("Smart Swipe disposable DB review/gate/quota + pre-click no-action integration passed.");
  } finally {
    await pool.query("DELETE FROM users WHERE id=$1", [noClickUserId]).catch(() => undefined);
    await pool.query("DELETE FROM users WHERE id=$1", [userId]).catch(() => undefined);
    await closePool();
  }
}
void main().catch(error => {
  console.error("Smart Swipe disposable DB integration failed:", error instanceof Error
    ? error.message : "unknown error");
  process.exitCode = 1;
});
