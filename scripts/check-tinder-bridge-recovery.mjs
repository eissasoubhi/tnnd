import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { isMissingTinderReceiver, describeTinderBridgeError, TINDER_BRIDGE_MISSING } from "../src/tinder-tab-connection.ts";

test("recognize missing Tinder content script after unpacked extension reload", () => {
  for (const message of [
    "Could not establish connection. Receiving end does not exist.",
    "Receiving end does not exist.",
    "TNND cannot reach its content script on Tinder."
  ]) {
    assert.equal(isMissingTinderReceiver(new Error(message)), true);
    assert.equal(describeTinderBridgeError(new Error(message)), TINDER_BRIDGE_MISSING);
  }
  assert.equal(isMissingTinderReceiver(new Error("Tinder did not confirm message delivery")), false);
});

test("bridge handshake is read-only, versioned and registered on actual Tinder content page", async () => {
  const bridge = await readFile(new URL("../src/chat-bridge.ts",import.meta.url),"utf8");
  const connection = await readFile(new URL("../src/tinder-tab-connection.ts",import.meta.url),"utf8");
  const manifest = JSON.parse(await readFile(new URL("../public/manifest.json",import.meta.url),"utf8"));
  assert.match(connection,/type: "TNND_GET_THREAD_INFO"/);
  assert.match(connection,/response\.bridgeProtocol !== TINDER_BRIDGE_PROTOCOL/);
  assert.match(connection,/waitForTinderContentBridge/);
  assert.match(bridge,/bridgeProtocol: TINDER_BRIDGE_PROTOCOL/);
  assert.ok(manifest.content_scripts.some(rule => rule.matches.includes("https://tinder.com/*") &&
    rule.js.includes("assets/chat-bridge.js")));
});

test("global existing runner checks content connection before changing preferences", async () => {
  const runner = await readFile(new URL("../src/tinder-global-existing-runner.ts",import.meta.url),"utf8");
  assert.ok(runner.indexOf("await waitForTinderContentBridge(tab.id)") <
    runner.indexOf("if (enablePreviouslyDisabled)"));
  assert.match(runner,/isMissingTinderReceiver\(error\)/);
  assert.match(runner,/enabled: false, userId: null, pausedOnStop: true/);
  assert.match(runner,/chrome\.alarms\.clear\(ALARM\)/);
});

test("existing and future match preflight prevents sending when Tinder receiver is absent", async () => {
  const popup = await readFile(new URL("../src/popup.ts",import.meta.url),"utf8");
  const html = await readFile(new URL("../public/popup.html",import.meta.url),"utf8");
  const worker = await readFile(new URL("../src/tinder-global-new-match-runner.ts",import.meta.url),"utf8");
  assert.match(popup,/reconnectTinderTab/);
  assert.match(html,/id="reconnectTinderTab"/);
  assert.match(popup,/TNND_GLOBAL_EXISTING_STOP/);
  assert.match(popup,/TNND_NEW_MATCH_OBSERVATION_STOP/);
  assert.match(popup,/chrome\.tabs\.reload\(tab\.id\)/);
  assert.match(popup,/waitForTinderContentBridge\(tab\.id\)/);
  assert.match(popup,/await assertTinderContentBridge\(tab\.id\)/);
  assert.ok(worker.indexOf("const tabId = await ownedTab(ref, session.user.id);") <
    worker.indexOf("tnnd.newMatchDailyAttempts.v1\": { date: today, refs: [...freshUsed, ref] }"));
  assert.match(worker,/if \(isMissingTinderReceiver\(error\) && !sendRequested\)/);
  assert.match(worker,/stopNewMatchObservation\(current\)/);
  assert.match(worker,/sendRequested = true/);
  assert.match(worker,/if \(isMissingTinderReceiver\(error\)\) throw error/);
  assert.match(worker,/chrome\.storage\.local\.remove\(OWNED_TAB\)/);
  assert.doesNotMatch(worker,/chrome\.tabs\.remove\(/);
});
