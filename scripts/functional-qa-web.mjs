/**
 * Browser interaction QA with synthetic fixtures, no real Tinder/account data.
 * Runs the production Web bundle in Chrome and clicks safe + mocked mutating
 * controls. Can also run while the unpacked TNND extension is installed.
 *
 * Build Web with VITE_TNND_API_BASE_URL=/ before launching this script.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const root = resolve("apps/web/dist");
const extensionRoot = resolve("dist");
const output = resolve("artifacts/web-interaction-qa");
const chrome = process.env.CHROME_BIN || "google-chrome";
const conversationId = "11111111-2222-4333-8444-555555555555";
const now = "2026-10-13T08:00:00.000Z";
const requests = [];
let storedProfile = {
  kind: "tnnd-user-profile", schemaVersion: 1,
  datingIntent: { defaultGoal: "open-to-see", defaultDisclosureStrategy: "progressive" },
  textingStyle: {}, matchProfileCapture: { temporaryRetentionDays: 7 }
};
let currentStatus = "paused";
let temporaryInstruction = null;
const conversation = () => ({
  id: conversationId,
  displayName: "Fixture conversation",
  externalThreadId: "/app/messages/fixture-only",
  currentTopic: null,
  topicState: { secondaryTopics: [], recentTopics: [] },
  status: currentStatus,
  temporaryInstruction,
  messages: [
    { id: "synthetic-1", direction: "incoming", text: "Hi! How are you?", sentAt: now },
    { id: "synthetic-2", direction: "outgoing", text: "Doing well, thanks!", sentAt: now }
  ]
});
const conversationSummary = () => ({
  id: conversationId, displayName: "Fixture conversation",
  status: currentStatus, currentTopic: null, lastMessageAt: now, updatedAt: now, pendingHumanActions: 0
});
const management = () => ({
  conversationId, externalThreadId: "/app/messages/fixture-only",
  managementState: "unmanaged", explicitlySelected: false,
  syncHealth: { state: "synced", lastSyncedAt: now }, updatedAt: now
});

function json(res, status, payload) {
  res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  res.end(JSON.stringify(payload));
}
async function serve(req, res) {
  const pathname = new URL(req.url || "/", "http://127.0.0.1:5173").pathname;
  if (pathname.startsWith("/api/v1/")) {
    requests.push({ method: req.method, path: pathname });
    const pieces = [];
    for await (const chunk of req) pieces.push(chunk);
    let body = {};
    try { body = JSON.parse(Buffer.concat(pieces).toString("utf8") || "{}"); } catch { /* bad fixture request */ }
    if (pathname === "/api/v1/auth/login" && req.method === "POST") {
      return json(res, 200, {
        token: "fixture-token", expiresAt: "2099-01-01T00:00:00.000Z",
        user: { id: "fixture-user", email: "fixture@example.test" }
      });
    }
    if (pathname === "/api/v1/auth/sessions") return json(res, 200, { sessions: [] });
    if (pathname === "/api/v1/profile") {
      if (req.method === "PUT") storedProfile = body.profile;
      return json(res, 200, { profile: storedProfile, updatedAt: now });
    }
    if (pathname === "/api/v1/conversations") return json(res, 200, { conversations: [conversationSummary()] });
    if (pathname === "/api/v1/conversations/management") return json(res, 200, { conversations: [management()] });
    if (pathname === "/api/v1/conversations/" + conversationId) {
      if (req.method === "PATCH") currentStatus = body.status ?? currentStatus;
      return json(res, 200, { conversation: conversation() });
    }
    if (pathname === "/api/v1/conversations/" + conversationId + "/instruction") {
      temporaryInstruction = req.method === "DELETE" ? null : { text: body.text, scope: body.scope, remainingReplies: body.remainingReplies };
      return json(res, 200, { instruction: temporaryInstruction, ok: true });
    }
    if (pathname === "/api/v1/conversations/" + conversationId + "/overrides") {
      return json(res, 200, { overrides: { version: 1 } });
    }
    if (pathname === "/api/v1/conversations/" + conversationId + "/generate") {
      return json(res, 200, { generation: {
        conversationId, text: "Fixture reply: nice to hear from you!",
        model: "fixture-model", provenance: {
          overriddenFields: [], hasPersistentInstruction: false, hasTemporaryInstruction: false
        }
      } });
    }
    if (pathname === "/api/v1/ai/provider-settings") return json(res, 200, { configured: true, model: "fixture-model" });
    if (pathname === "/api/v1/ai/provider-settings/test") return json(res, 200, { connected: true, model: "fixture-model" });
    if (pathname === "/api/v1/human-actions") return json(res, 200, { actions: [] });
    if (pathname === "/api/v1/personal-memories") return json(res, 200, { memories: [] });
    if (pathname === "/api/v1/profile/topic-coverage") return json(res, 200, { topics: [] });
    return json(res, 404, { error: "fixture_not_implemented" });
  }
  try {
    const requested = pathname === "/" ? "/index.html" : pathname;
    const file = resolve(root, "." + requested);
    if (relative(root, file).startsWith("..")) return res.writeHead(403).end();
    const bytes = await readFile(file);
    const type = requested.endsWith(".html") ? "text/html; charset=utf-8"
      : requested.endsWith(".js") ? "application/javascript"
      : requested.endsWith(".css") ? "text/css" : "application/octet-stream";
    res.writeHead(200, { "content-type": type, "cache-control": "no-store" }).end(bytes);
  } catch { res.writeHead(404).end("not found"); }
}
async function debugPort(profile, child) {
  for (let i = 0; i < 150; i++) {
    if (child.exitCode !== null) throw new Error("Chrome exited");
    try {
      const text = await readFile(join(profile, "DevToolsActivePort"), "utf8");
      const port = Number(text.split("\n")[0]);
      if (port > 0) return port;
    } catch { /* not yet available */ }
    await sleep(100);
  }
  throw new Error("Chrome DevTools did not start");
}
async function openCDP(port, type = "page") {
  const targets = await (await fetch("http://127.0.0.1:" + port + "/json/list")).json();
  const target = targets.find(t => t.type === type && (type !== "service_worker" || t.url?.startsWith("chrome-extension://")));
  assert.ok(target?.webSocketDebuggerUrl, "Browser page target missing");
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((ok, bad) => { socket.addEventListener("open", ok, { once: true }); socket.addEventListener("error", bad, { once: true }); });
  let seq = 0;
  const pending = new Map();
  const runtimeExceptions = [];
  socket.addEventListener("message", ev => {
    const msg = JSON.parse(ev.data);
    if (msg.method === "Runtime.exceptionThrown") runtimeExceptions.push(msg.params?.exceptionDetails?.text ?? "runtime-exception");
    const p = pending.get(msg.id);
    if (!p) return;
    pending.delete(msg.id);
    msg.error ? p.reject(Error(p.name + ": " + msg.error.message)) : p.resolve(msg.result);
  });
  function send(name, params = {}) {
    const id = ++seq;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject, name });
      socket.send(JSON.stringify({ id, method: name, params }));
    });
  }
  async function evaluate(expression) {
    const result = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw Error(result.exceptionDetails.text + ": " + (result.exceptionDetails.exception?.description ?? ""));
    return result.result.value;
  }
  return { send, evaluate, runtimeExceptions, close: () => socket.close() };
}
const results = [];
async function step(cdp, name, expression, test) {
  const value = await cdp.evaluate(expression);
  assert.ok(test(value), name + " failed: " + JSON.stringify(value));
  results.push({ name, passed: true });
  console.log("PASS " + name);
}
async function waitFor(cdp, expression, limit = 100) {
  let last;
  for (let i = 0; i < limit; i++) {
    last = await cdp.evaluate(expression);
    if (last) return last;
    await sleep(110);
  }
  throw new Error("Timed out waiting for " + expression + " (last=" + JSON.stringify(last) + ")");
}
async function main() {
  await mkdir(output, { recursive: true });
  await readFile(join(root, "index.html"));
  const server = createServer((req, res) => void serve(req, res).catch(error => json(res, 500, { error: String(error) })));
  await new Promise((ok, reject) => server.listen(5173, "127.0.0.1", error => error ? reject(error) : ok()));
  const profile = await mkdtemp(join(tmpdir(), "tnnd-web-interaction-"));
  const child = spawn(chrome, [
    "--headless=new", "--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu",
    "--no-first-run", "--no-default-browser-check", "--remote-allow-origins=*",
    "--remote-debugging-port=0", "--user-data-dir=" + profile,
    "--disable-extensions-except=" + extensionRoot, "--load-extension=" + extensionRoot,
    "about:blank"
  ], { stdio: "ignore" });
  let cdp;
  try {
    const port = await debugPort(profile, child);
    cdp = await openCDP(port);
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    await cdp.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
    await cdp.send("Page.navigate", { url: "http://127.0.0.1:5173/" });
    await waitFor(cdp, 'document.readyState === "complete" && !!document.querySelector("#login-form")');

    await step(cdp, "Signed-out screen shows an actionable login form",
      '!!document.querySelector("#login-submit") && !document.querySelector("#login-submit").disabled',
      Boolean);

    await cdp.evaluate(`(() => {
      document.querySelector("#login-email").value = "fixture@example.test";
      document.querySelector("#login-password").value = "fixture-password-123";
      document.querySelector("#login-form").dispatchEvent(new Event("submit",{bubbles:true,cancelable:true}));
    })()`);
    await waitFor(cdp, 'document.querySelector("#auth-status")?.textContent === "Connected"');
    await waitFor(cdp, 'document.querySelector("#setup-guidance-panel") !== null', 150);
    await waitFor(cdp, 'document.querySelector("#conversation-panel-status")?.textContent?.includes("synced")', 150);

    await step(cdp, "Account sign-in and asynchronous workspace panels load",
      'document.querySelector("#auth-signed-in")?.hidden === false && document.querySelector("#login-form")?.hidden === true',
      Boolean);
    await step(cdp, "A synced fixture conversation opens with real messages",
      'document.querySelector("#conversation-detail")?.textContent?.includes("Hi! How are you?")',
      Boolean);
    await step(cdp, "Default paused state renders Resume action",
      '!!document.querySelector("[data-conversation-status-action=active]")',
      Boolean);

    const nav = await cdp.evaluate(`(async () => {
      const links = [...document.querySelectorAll(".workspace-nav a")];
      const result = [];
      for (const link of links) {
        link.click();
        await new Promise(ok=>setTimeout(ok,90));
        result.push({ hash: link.hash, active: link.getAttribute("aria-current")==="location" });
      }
      return result;
    })()`);
    assert.equal(nav.length, 7);
    assert.ok(nav.every(x => x.active), "Some workspace navigation clicks did not activate their section: " + JSON.stringify(nav));
    results.push({ name: "All seven navigation buttons change active section", passed: true });
    console.log("PASS All seven navigation buttons change active section");

    await cdp.evaluate(`(() => {
      const details = document.querySelector(".preference-section");
      if (details) details.open = true;
      document.querySelector('[data-goal-example="open"]')?.click();
    })()`);
    await step(cdp, "Goal example button fills the correct field",
      'document.querySelector("#dating-goal-details")?.value?.includes("meeting new people")',
      Boolean);
    await cdp.evaluate('document.querySelector("#preferences-save").click()');
    await waitFor(cdp, 'document.querySelector("#profile-message")?.textContent?.includes("Preferences saved")');
    assert.equal(requests.filter(x => x.path === "/api/v1/profile" && x.method === "PUT").length, 1);
    results.push({ name: "Save preferences calls the API exactly once", passed: true });

    await cdp.evaluate(`(() => {
      document.querySelector("#conversation-search").value = "not-a-match";
      document.querySelector("#conversation-search").dispatchEvent(new Event("input",{bubbles:true}));
    })()`);
    await step(cdp, "Conversation search filters the list without stale details",
      'document.querySelector("#conversation-filter-summary")?.textContent?.includes("0 shown") && document.querySelector("#conversation-detail")?.textContent?.includes("No conversation selected")',
      Boolean);
    await cdp.evaluate(`(() => {
      document.querySelector("#conversation-search").value = "";
      document.querySelector("#conversation-search").dispatchEvent(new Event("input",{bubbles:true}));
    })()`);
    await waitFor(cdp, 'document.querySelector("#conversation-detail")?.textContent?.includes("Hi! How are you?")');

    await cdp.evaluate('document.querySelector("[data-conversation-status-action=active]").click()');
    await waitFor(cdp, 'document.querySelector("[data-conversation-status-action=paused]") !== null');
    assert.ok(requests.some(x => x.path === "/api/v1/conversations/" + conversationId && x.method === "PATCH"));
    results.push({ name: "Resume conversation performs authenticated PATCH and updates controls", passed: true });

    await cdp.evaluate(`(() => {
      const msg = document.querySelector("[data-generation-message]");
      if (msg) { msg.value = "How is your day?"; msg.dispatchEvent(new Event("input",{bubbles:true})); }
      document.querySelector("[data-generation-button]")?.click();
    })()`);
    await waitFor(cdp, 'document.querySelector("[data-generation-status]")?.textContent?.includes("Draft ready")', 100);
    await step(cdp, "Gemini draft generation shows synthetic response and enables approval",
      'document.querySelector("[data-generation-preview]")?.textContent?.includes("Fixture reply") && !document.querySelector("[data-generation-approve]")?.disabled',
      Boolean);
    await cdp.evaluate('document.querySelector("[data-generation-approve]").click()');
    await step(cdp, "Approve draft changes local lifecycle without sending anything",
      'document.querySelector("[data-generation-status]")?.textContent?.includes("approved locally")',
      Boolean);
    assert.ok(!requests.some(x => /outgoing\/confirm/.test(x.path)), "Approval must not confirm/send");

    for (const width of [1440, 390]) {
      await cdp.send("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: false });
      await sleep(180);
      const metrics = await cdp.evaluate(`(() => ({
        width: innerWidth,
        overflow: Math.max(0, document.documentElement.scrollWidth - innerWidth),
        buttons: [...document.querySelectorAll("button")].filter(b=>b.getClientRects().length && !b.disabled).length,
        clipped: [...document.querySelectorAll("button")].filter(b=>b.getClientRects().length && !b.disabled && (b.getBoundingClientRect().left < -2 || b.getBoundingClientRect().right > innerWidth + 2)).length
      }))()`);
      assert.ok(metrics.overflow <= 2 && metrics.clipped === 0, width + "px screen horizontal overflow/clipped buttons: " + JSON.stringify(metrics));
      results.push({ name: "No horizontal overflow or clipped buttons at " + width + "px", passed: true, ...metrics });
      const png = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
      await writeFile(join(output, "signed-in-" + width + ".png"), Buffer.from(png.data, "base64"));
    }

    const targets = await cdp.send("Target.getTargets");
    const extensionRunning = targets.targetInfos.some(t => t.url?.startsWith("chrome-extension://"));
    assert.ok(extensionRunning, "The unpacked extension did not load in Chrome.");
    results.push({ name: "Unpacked extension present in browser", passed: extensionRunning });

    // This is a real Chrome extension runtime message to the registered
    // content script on the fixture Web tab, not a reimplementation of it.
    const worker = await openCDP(port, "service_worker");
    try {
      await worker.send("Runtime.enable");
      const audit = await worker.evaluate(`(async () => {
        const tabs = await chrome.tabs.query({});
        const tab = tabs.find(t => t.url?.startsWith("http://127.0.0.1:5173/"));
        if (!tab?.id) return {ok:false,error:"fixture_tab_not_found"};
        try {
          return await chrome.tabs.sendMessage(tab.id, {type:"TNND_RUN_WEB_UI_AUDIT"});
        } catch (error) {
          return {ok:false,error:String(error)};
        }
      })()`);
      assert.ok(audit?.ok && audit.report, "Extension-to-Web UI audit failed: " + JSON.stringify(audit));
      assert.equal(audit.report.sections, 7, "Expected all workspace sections");
      assert.equal(audit.report.navLinks, 7, "Extension did not click all nav links");
      const failing = audit.report.checks.filter(check => check.result === "failed");
      assert.deepEqual(failing, [], "Extension reported broken safe interactions");
      results.push({
        name: "Real extension messaging audits workspace buttons, navigation and disclosures",
        passed: true, inspectedButtons: audit.report.buttons.visible,
        navLinks: audit.report.navLinks, disclosures: audit.report.disclosures,
        issueCount: audit.report.issues.length
      });
      await writeFile(join(output, "extension-ui-audit.json"), JSON.stringify(audit.report, null, 2) + "\\n");
      console.log("PASS Extension UI audit: " + audit.report.buttons.visible + " buttons, " +
        audit.report.navLinks + " navigation links and " + audit.report.disclosures + " disclosures");
    } finally {
      worker.close();
    }

    await writeFile(join(output,"report.json"),JSON.stringify({
      kind:"tnnd-synthetic-browser-interaction-qa",generatedAt:new Date().toISOString(),
      syntheticOnly:true, extensionRunning, passed:results.every(x=>x.passed),
      results, apiRequestCount: requests.length,
      knownLimitations: ["Live Tinder DOM, real Gemini, payment and destructive-account flows are not exercised.", "Fixture API simulates success and cannot guarantee production service availability."]
    },null,2)+"\n");

    console.log("Functional browser QA passed: " + results.length + " checks");
  } finally {
    cdp?.close();
    child.kill("SIGTERM");
    server.close();
    await rm(profile, { recursive: true, force: true, maxRetries: 4, retryDelay: 150 });
  }
}
await main();
