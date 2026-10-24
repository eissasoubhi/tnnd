/**
 * Real Chrome extension popup -> MV3 service-worker contract smoke.
 * No actual Tinder access, credentials, API, messages, profiles or Likes.
 *
 * Unlike HTML screenshots and source regex tests, this opens the compiled
 * chrome-extension:// popup with the real service worker and CLICKS its buttons.
 * Test only fail-closed signed-out behavior. Positive signed-in Tinder behavior
 * must be validated separately in an authorized, controlled Chrome session.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const extensionRoot = resolve("dist");
const output = resolve("artifacts/extension-popup-integration");
const chromeBin = process.env.CHROME_BIN || "google-chrome";
const results = [];

async function waitForDebugPort(profile, child) {
  for (let i = 0; i < 150; i++) {
    if (child.exitCode !== null) throw new Error("Chrome process exited");
    try {
      const port = Number((await readFile(join(profile, "DevToolsActivePort"), "utf8")).split("\n")[0]);
      if (port > 0) return port;
    } catch { /* Chrome still starting */ }
    await sleep(100);
  }
  throw new Error("Chrome DevTools port unavailable");
}

async function waitForExtensionId(port) {
  let observed = [];
  for (let i = 0; i < 120; i++) {
    const targets = await (await fetch("http://127.0.0.1:" + port + "/json/list")).json();
    observed = targets.filter(t => String(t.url ?? "").startsWith("chrome-extension://"))
      .map(t => ({ type: t.type, pathname: new URL(t.url).pathname }));
    // Chrome also launches its OWN built-in extensions. Their service workers
    // are unrelated to TNND; the previous generic extension-present check
    // would silently treat them as evidence that TNND loaded correctly.
    const extension = targets.find(t => t.type === "service_worker" &&
      typeof t.url === "string" && t.url.startsWith("chrome-extension://") &&
      new URL(t.url).pathname === "/assets/background.js");
    if (extension) return new URL(extension.url).hostname;
    await sleep(100);
  }
  throw new Error("Unpacked extension target was never registered: " + JSON.stringify(observed));
}

async function openCDP(port) {
  const targets = await (await fetch("http://127.0.0.1:" + port + "/json/list")).json();
  const page = targets.find(t => t.type === "page" && t.webSocketDebuggerUrl);
  assert.ok(page, "No Chrome page target found");
  const socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  let seq = 0;
  const pending = new Map();
  const exceptions = [];
  socket.addEventListener("message", event => {
    const message = JSON.parse(event.data);
    if (message.method === "Runtime.exceptionThrown") {
      exceptions.push(message.params?.exceptionDetails?.exception?.description ??
        message.params?.exceptionDetails?.text ?? "unknown JavaScript exception");
    }
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    message.error
      ? request.reject(new Error(request.method + ": " + message.error.message))
      : request.resolve(message.result);
  });
  function send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++seq;
      pending.set(id, { resolve, reject, method });
      socket.send(JSON.stringify({ id, method, params }));
    });
  }
  async function evaluate(expression) {
    const response = await send("Runtime.evaluate", {
      expression, returnByValue: true, awaitPromise: true
    });
    if (response.exceptionDetails)
      throw new Error("Chrome popup JavaScript failed: " +
        (response.exceptionDetails.exception?.description ?? response.exceptionDetails.text));
    return response.result.value;
  }
  return { send, evaluate, exceptions, close: () => socket.close() };
}
async function waitFor(cdp, expression, attempts = 110) {
  let last;
  for (let i = 0; i < attempts; i++) {
    last = await cdp.evaluate(expression);
    if (last) return last;
    await sleep(110);
  }
  const details = await cdp.evaluate(`JSON.stringify({
    ready: document.readyState,
    href: location.protocol + "//" + location.host + location.pathname,
    title: document.title,
    hasWatcherButton: !!document.querySelector("#startReplyWatcher"),
    hasRuntime: typeof chrome !== "undefined" && typeof chrome.runtime?.sendMessage === "function",
    bodyPrefix: (document.body?.innerText ?? "").slice(0, 120)
  })`).catch(() => "popup_evaluation_unavailable");
  throw new Error("Timed out waiting for real popup condition: " + expression +
    " · actual browser: " + details);
}
async function check(cdp, label, expression, predicate = Boolean) {
  const result = await cdp.evaluate(expression);
  assert.ok(predicate(result), label + " failed (" + JSON.stringify(result) + ")");
  results.push({ label, passed: true });
  console.log("PASS " + label);
}
async function capture(cdp, name) {
  const response = await cdp.send("Page.captureScreenshot", {
    format: "png", captureBeyondViewport: true
  });
  await writeFile(join(output, name + ".png"), Buffer.from(response.data, "base64"));
}

async function run() {
  await readFile(join(extensionRoot, "popup.html"));
  await readFile(join(extensionRoot, "assets", "popup.js"));
  await mkdir(output, { recursive: true });
  const profile = await mkdtemp(join(tmpdir(), "tnnd-extension-popup-contract-"));
  const chrome = spawn(chromeBin, [
    ...(process.env.TNND_QA_HEADED === "1" ? [] : ["--headless=new"]),
    "--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu",
    "--no-first-run", "--no-default-browser-check", "--remote-allow-origins=*",
    "--remote-debugging-port=0", "--user-data-dir=" + profile,
    "--disable-extensions-except=" + extensionRoot,
    "--load-extension=" + extensionRoot, "about:blank"
  ], { stdio: "ignore" });
  let cdp;
  let error = null;
  try {
    const port = await waitForDebugPort(profile, chrome);
    const extensionId = await waitForExtensionId(port);
    assert.match(extensionId, /^[a-p]{32}$/, "Extension ID should be a Chrome extension ID");
    cdp = await openCDP(port);
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width: 380, height: 850, deviceScaleFactor: 1, mobile: false
    });
    await cdp.send("Page.navigate", {
      url: "chrome-extension://" + extensionId + "/popup.html"
    });
    await waitFor(cdp, 'document.readyState === "complete" && document.querySelector("#startReplyWatcher") && typeof chrome?.runtime?.sendMessage === "function"');
    await check(cdp, "Compiled popup has real extension runtime and both control groups",
      '!!document.querySelector("#stopSmartSwipeRuntime") && !!document.querySelector("#stopReplyWatcher") && chrome.runtime.id.length === 32');

    // Set only a synthetic on/off preference in the dedicated throwaway Chrome
    // profile. No TNND session or Tinder tab is created by this test.
    await cdp.evaluate('chrome.storage.local.set({"tnnd.config":{"automation":{"enabled":true}}})');
    await waitFor(cdp, 'document.querySelector("#startReplyWatcher").disabled === false');
    const stateBefore = await cdp.evaluate(
      'chrome.runtime.sendMessage({type:"TNND_GLOBAL_EXISTING_STATE"})');
    assert.equal(stateBefore?.ok, true, "Real MV3 watcher status listener did not answer");
    assert.equal(stateBefore.state?.enabled, false);
    results.push({ label: "Real MV3 worker reports watcher stopped", passed: true });

    await cdp.evaluate('document.querySelector("#startReplyWatcher").click()');
    await waitFor(cdp,
      'document.querySelector("#replyWatcherControlFeedback")?.textContent?.includes("Cannot start watcher:")',
      150);
    await check(cdp, "Actual Watcher Start click exposes durable refusal, not a silent no-op",
      'document.querySelector("#replyWatcherControlFeedback")?.textContent',
      value => typeof value === "string" &&
        (/Connect your TNND account|TNND account|Automatic replies|Stop Smart Swipe/.test(value)));
    await cdp.evaluate('document.querySelector("#refreshGlobalExistingStatus").click()');
    await sleep(650);
    await check(cdp, "Status refresh does NOT hide rejected Watcher Start",
      'document.querySelector("#replyWatcherControlFeedback")?.textContent?.includes("Cannot start watcher:")');
    await check(cdp, "Failed Watcher Start leaves Stop disabled and Start available",
      'document.querySelector("#stopReplyWatcher")?.disabled === true && document.querySelector("#startReplyWatcher")?.disabled === false');
    const afterWatcher = await cdp.evaluate(
      'chrome.runtime.sendMessage({type:"TNND_GLOBAL_EXISTING_STATE"})');
    assert.equal(afterWatcher?.state?.enabled, false, "A rejected Start must never arm a watcher");
    results.push({ label: "Worker remained disarmed after rejected Watcher Start", passed: true });

    // Stop Smart Swipe is a safety-only command even when the user is signed out.
    // The acceptance is read from the real worker (no fake message handler).
    const armBefore = await cdp.evaluate(
      'chrome.storage.local.get("tnnd.smartSwipeStopRequested.v1")');
    assert.equal(armBefore["tnnd.smartSwipeStopRequested.v1"], undefined);
    await cdp.evaluate('document.querySelector("#stopSmartSwipeRuntime").click()');
    await waitFor(cdp, 'document.querySelector("#smartSwipeControlFeedback")?.textContent?.includes("Stop confirmed")', 120);
    const latch = await cdp.evaluate(
      'chrome.storage.local.get("tnnd.smartSwipeStopRequested.v1")');
    assert.equal(latch["tnnd.smartSwipeStopRequested.v1"], true,
      "Real Stop did not write the durable emergency latch");
    results.push({ label: "Smart Swipe Stop button reaches real MV3 latch", passed: true });
    await cdp.evaluate('document.querySelector("#stopSmartSwipeRuntime").click()');
    await waitFor(cdp, 'document.querySelector("#smartSwipeControlFeedback")?.textContent?.includes("Stop confirmed")');
    const secondLatch = await cdp.evaluate(
      'chrome.storage.local.get("tnnd.smartSwipeStopRequested.v1")');
    assert.equal(secondLatch["tnnd.smartSwipeStopRequested.v1"], true);
    results.push({ label: "Repeated Smart Swipe Stop is idempotent", passed: true });

    await capture(cdp, "controls-fail-closed");

    // The current toolbar entry is launcher.html, not the legacy popup.
    // Exercise the three *real* launcher buttons through the MV3 worker while
    // intentionally signed out: no Tinder visit, Like, or chat send.
    await cdp.send("Page.navigate", {
      url: "chrome-extension://" + extensionId + "/launcher.html"
    });
    await waitFor(cdp,
      'document.readyState === "complete" && document.querySelectorAll(".mode-button").length === 3 && document.querySelector("#toggleAutomation")');
    await waitFor(cdp, 'document.querySelector("#toggleAutomation").disabled === false');
    await check(cdp, "Launcher has Swipe, Matches, Chat under primary control",
      'Array.from(document.querySelectorAll(".mode-button")).map(x => x.dataset.activity).join(",")',
      v => v === "swipe,new-match,active-chat");
    await check(cdp, "Swipe is displayed by default, without starting an engine",
      'document.querySelector("#tabSwipe")?.getAttribute("aria-selected") === "true" && Array.from(document.querySelectorAll(".mode-button")).slice(1).every(x => x.getAttribute("aria-selected") === "false")');
    for (const mode of ["swipe", "new-match", "active-chat"]) {
      await cdp.evaluate('document.querySelector("#feedback").textContent=""');
      await cdp.evaluate('Array.from(document.querySelectorAll(".mode-button")).find(x=>x.dataset.activity===' + JSON.stringify(mode) + ').click()');
      await cdp.evaluate('Array.from(document.querySelectorAll(".mode-action")).find(x=>x.dataset.activity===' + JSON.stringify(mode) + ').click()');
      await waitFor(cdp, 'document.querySelector("#feedback")?.textContent?.includes("connectée")');
      await check(cdp, "Signed-out manual " + mode + " shows actionable connection guidance",
        'document.querySelector("#webSettingsLink")?.getAttribute("href")',
        url => typeof url === "string" && url.endsWith("/connect.html"));
      await check(cdp, "Worker denies signed-out manual " + mode + " without arming any engine",
        'chrome.runtime.sendMessage({type:"TNND_UNIFIED_STATUS"})',
        state => state?.ok === true && state.running === false);
    }
    await capture(cdp, "launcher-manual-modes-fail-closed");
    await writeFile(join(output, "report.json"), JSON.stringify({
      kind: "tnnd-real-extension-popup-to-worker-contract",
      syntheticOnly: true,
      noTinderAccountUsed: true, noTinderInteraction: true,
      passed: true, results,
      limitations: [
        "Verifies real compiled popup and MV3 worker communication in signed-out Chrome.",
        "Does NOT test a successful Watcher or Swipe Start with a Tinder account.",
        "Does NOT establish Tinder server Like acceptance or automated chat delivery.",
        "Signed-in regression QA must separately validate Start -> activity -> Stop -> reload."
      ]
    }, null, 2) + "\n");
    console.log("Popup-to-MV3 browser contract passed (" + results.length + " checks)");
  } catch (caught) {
    error = caught;
    if (cdp) {
      try { await capture(cdp, "failure"); } catch { /* a crash may prevent screenshots */ }
    }
    await writeFile(join(output, "report.json"), JSON.stringify({
      kind: "tnnd-real-extension-popup-to-worker-contract",
      syntheticOnly: true, passed: false,
      error: caught instanceof Error ? caught.message : "unknown_error",
      results
    }, null, 2) + "\n");
  } finally {
    cdp?.close();
    chrome.kill("SIGTERM");
    await rm(profile, { recursive: true, force: true, maxRetries: 4, retryDelay: 150 });
  }
  if (error) throw error;
}
await run();
