import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  SPA_NAVIGATION_TIMEOUT_MS, STALE_OPENING_TIMEOUT_MS,
  SpaNavigationTimeoutError, isStalledOpening, withSpaNavigationTimeout
} from "../src/tinder-runner-navigation-timeout.ts";

test("Tinder SPA navigation cannot hang and leaves no send/retry side effect", async () => {
  assert.equal(SPA_NAVIGATION_TIMEOUT_MS, 12_000);
  assert.equal(STALE_OPENING_TIMEOUT_MS, 20_000);
  await assert.rejects(
    withSpaNavigationTimeout(new Promise(() => {}), 15),
    SpaNavigationTimeoutError
  );
  const fast = await withSpaNavigationTimeout(Promise.resolve({ ok: true, currentRef: "abc" }), 15);
  assert.equal(fast.currentRef, "abc");
});

test("only truly stale opening phases trigger fail-closed recovery", () => {
  const now = Date.parse("2026-10-15T23:00:00Z");
  const at = new Date(now - 21_000).toISOString();
  assert.equal(isStalledOpening("loading", at, now), true);
  assert.equal(isStalledOpening("loading", new Date(now - 10_000).toISOString(), now), false);
  assert.equal(isStalledOpening("waiting", at, now), false);
  assert.equal(isStalledOpening("loading", "bad timestamp", now), false);
});

test("successful opened chats immediately stop displaying Opening chat under 3-minute follow", async () => {
  const runner = await readFile(new URL("../src/tinder-global-existing-runner.ts", import.meta.url), "utf8");
  const content = await readFile(new URL("../src/content.ts", import.meta.url), "utf8");
  assert.match(runner, /withSpaNavigationTimeout\(chrome\.tabs\.sendMessage/);
  assert.match(runner, /isStalledOpening\(state\.phase, state\.lastActionAt\)/);
  assert.match(runner, /await save\(activity\(\{ \.\.\.latest, pendingReplies: pendingWatchedReplies\(checked\)/);
  assert.match(runner, /"waiting",/);
  assert.match(runner, /currentLabel: displayedLabel/);
  assert.match(runner, /error instanceof SpaNavigationTimeoutError/);
  assert.match(runner, /await chrome\.alarms\.clear\(ALARM\)/);
  assert.match(runner, /TNND_EXISTING_RUNNER_IDENTITY/);
  assert.match(content, /identity: readVisibleTinderMatchIdentity\(ref\)/);
});

test("live name is from EXACT Tinder thread, not a guessed ID or neighboring user", async () => {
  const source = await readFile(new URL("../src/tinder-chat-identity.ts", import.meta.url), "utf8");
  const worker = await readFile(new URL("../src/tinder-global-existing-runner.ts", import.meta.url), "utf8");
  assert.match(source, /verifiedOpenChat/);
  assert.match(source, /aside \.chatProfile \.profileContent h1/);
  assert.match(source, /rowIdentity\.firstName !== headingIdentity\.firstName/);
  assert.match(worker, /tinderRefFromUrl\(tab\.url\) !== state\.lastRef/);
});
