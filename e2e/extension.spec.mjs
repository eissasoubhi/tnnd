import { test, expect, chromium } from "playwright/test";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

// The fixture binds the production API port before Chrome starts. If a local
// TNND API already owns it, the suite fails closed instead of using that API.
const extensionPath = resolve("dist");
const userId = "e2e-user";
const session = {
  token: "fixture-only-token", expiresAt: "2099-01-01T00:00:00.000Z",
  user: { id: userId, email: "e2e@example.test" }
};
const settings = {
  enabled: true, sessionsPerDay: 1,
  sessionDurationMinSeconds: 300, sessionDurationMaxSeconds: 300,
  swipeDelayMinSeconds: 2, swipeDelayMaxSeconds: 2,
  maxRightSwipesPerDay: 2,
  priority: ["swipe", "new-match", "active-chat"],
  pauseSwipeDuringActiveConversation: true,
  maxActiveChatSecondsPerConversationPerDay: null,
  timeZone: "UTC"
};
const requests = [];
let ledger = { attemptsToday: 0, uiObservedToday: 0, unresolvedAttempts: 0 };
let apiAvailable = true;
const failingPaths = new Set();

function json(res, status, value) {
  res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  res.end(JSON.stringify(value));
}

const api = createServer(async (req, res) => {
  const url = new URL(req.url, "http://127.0.0.1:4000");
  const path = url.pathname;
  requests.push({ method: req.method, path, authorization: req.headers.authorization === "Bearer fixture-only-token" });
  if (!apiAvailable || failingPaths.has(path)) return json(res, 503, { error: "fixture_offline" });
  if (path === "/api/v1/auth/session") return json(res, 200, { user: session.user });
  if (path === "/api/v1/profile") return json(res, 404, { error: "fixture_no_profile" });
  if (path === "/api/v1/automation/smart-swipe") return json(res, 200, { settings });
  if (path === "/api/v1/automation/smart-swipe/attempts/summary") return json(res, 200, ledger);
  if (path === "/api/v1/automation/smart-swipe/attempts/reconciliation") return json(res, 200, {
    dayKey: url.searchParams.get("dayKey"), attempts: ledger.attemptsToday,
    uiObserved: ledger.uiObservedToday, reviewedUnknown: 0,
    unresolvedAcrossDays: ledger.unresolvedAttempts
  });
  if (path === "/api/v1/automation/smart-swipe/attempts/rearm") return json(res, 200, { ok: true });
  if (path === "/api/v1/automation/smart-swipe/attempts/claim") {
    // A deterministic refused claim exercises quota handling without invoking
    // a fake Tinder Like or assigning false confirmation to an attempted one.
    return json(res, 200, { ok: false, claimed: false, reason: "fixture_quota_reached" });
  }
  if (path === "/api/v1/conversations/management" || path === "/api/v1/conversations")
    return json(res, 200, { conversations: [] });
  return json(res, 404, { error: "unmocked_fixture_endpoint" });
});

const fakeTinder = `<!doctype html><html><head><title>Fictional Tinder fixture</title>
<style>button{width:64px;height:64px;margin:20px}</style></head><body>
<main><button class="gamepad-button Bgc($c-ds-background-gamepad-sparks-nope-default)" aria-label="Pass">Pass</button>
<button class="gamepad-button Bgc($c-ds-background-gamepad-sparks-super-like-default)" aria-label="Super Like">Super Like</button>
<button class="gamepad-button Bgc($c-ds-background-gamepad-sparks-like-default)" aria-label="Like" onclick="window.fixtureLikeClicks=(window.fixtureLikeClicks||0)+1">Like</button></main>
</body></html>`;
const fakeMatches = `<!doctype html><html><head><title>Fictional Matches fixture</title></head><body>
<nav aria-label="Matches"><a class="matchListItem" href="/app/messages/fixture-a">Fixture A</a>
<a class="matchListItem" href="/app/messages/fixture-b">Fixture B</a></nav>
</body></html>`;

let context, profile, extensionId, tinder, popup;
async function launch() {
  context = await chromium.launchPersistentContext(profile, {
    channel: "chromium", headless: true,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
      "--disable-background-networking", "--no-first-run"
    ]
  });
  await context.route("**/*", route => {
    const url = new URL(route.request().url());
    if (url.protocol === "chrome-extension:") return route.continue();
    if ((url.hostname === "tinder.com" || url.hostname === "www.tinder.com") &&
      url.protocol === "https:") {
      return route.fulfill({ status: 200, contentType: "text/html",
        body: url.pathname === "/app/matches" ? fakeMatches : fakeTinder });
    }
    if (url.origin === "http://127.0.0.1:4000") return route.continue();
    return route.abort("blockedbyclient");
  });
  const worker = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker");
  extensionId = new URL(worker.url()).hostname;
}
async function storage() {
  const worker = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker");
  return worker.evaluate(() => chrome.storage.local.get(null));
}
async function seed() {
  const worker = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker");
  await worker.evaluate(value => chrome.storage.local.set(value), {
    "tnnd.backendSession": session,
    "tnnd.config": { automation: { enabled: true, maxFirstMessagesPerDay: 5 } }
  });
}
async function openPopup() {
  popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await expect(popup.locator("#refreshSmartSwipeRuntime")).toBeEnabled();
  return popup;
}
async function command(type, extra = {}) {
  return popup.evaluate(({ type, extra }) => chrome.runtime.sendMessage({ type, ...extra }), { type, extra });
}

test.describe.serial("compiled MV3 extension in isolated Chrome", () => {
  test.beforeAll(async () => {
    await new Promise((done, fail) => api.once("error", fail).listen(4000, "127.0.0.1", done));
    profile = await mkdtemp(join(tmpdir(), "tnnd-e2e-chrome-"));
    await launch();
    await seed();
    tinder = await context.newPage();
    await tinder.goto("https://tinder.com/app/recs");
    await openPopup();
  });
  test.afterAll(async () => {
    await context?.close();
    await new Promise(resolve => api.close(resolve));
    if (profile) await rm(profile, { recursive: true, force: true });
  });
  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === testInfo.expectedStatus) return;
    await testInfo.attach("synthetic-api-requests", {
      body: JSON.stringify(requests, null, 2), contentType: "application/json"
    });
    for (const [name, page] of [["popup", popup], ["fictional-tinder", tinder]]) {
      if (!page || page.isClosed()) continue;
      try {
        await testInfo.attach(name, {
          body: await page.screenshot(), contentType: "image/png"
        });
      } catch { /* the page may already have closed during the failure */ }
    }
  });

  test("real service worker and content script observe only the fictional Discovery page", async () => {
    expect(context.serviceWorkers().some(worker => worker.url().endsWith("/assets/background.js"))).toBe(true);
    const snapshot = await command("TNND_SMART_SWIPE_RUNTIME_STATUS");
    expect(snapshot.ok, JSON.stringify(snapshot)).toBe(true);
    expect(snapshot).toMatchObject({ ok: true, enabled: true, controls: { status: "observed", likeControls: 1 } });
    expect(await tinder.evaluate(() => window.fixtureLikeClicks || 0)).toBe(0);
    expect(requests.some(item => item.path === "/api/v1/automation/smart-swipe" && item.authorization)).toBe(true);
  });

  test("Start, popup close, Stop and explicit resume persist in Chrome storage", async () => {
    await popup.locator("#startSmartSwipeRuntime").click();
    await expect(popup.locator("#smartSwipeControlFeedback")).toContainText("Start request accepted");
    expect((await storage())[`tnnd.smartSwipeLiveArm.v1:${userId}`].armed).toBe(true);
    await expect.poll(() => requests.filter(item => item.path ===
      "/api/v1/automation/smart-swipe/attempts/claim").length, { timeout: 10_000 }).toBeGreaterThan(0);
    expect((await storage())[`tnnd.smartSwipeDailyProgress.v1:${userId}`].startedSessions).toBe(1);
    expect(await tinder.evaluate(() => window.fixtureLikeClicks || 0)).toBe(0);
    await popup.close();
    await openPopup();
    await expect(popup.locator("#smartSwipeRuntimeSummary")).toContainText("Automation: armed");
    await popup.locator("#stopSmartSwipeRuntime").click();
    await expect(popup.locator("#smartSwipeControlFeedback")).toContainText("Stop confirmed");
    let saved = await storage();
    expect(saved[`tnnd.smartSwipeLiveArm.v1:${userId}`].armed).toBe(false);
    expect(saved["tnnd.smartSwipeStopRequested.v1"]).toBe(true);
    await popup.locator("#startSmartSwipeRuntime").click();
    await expect(popup.locator("#smartSwipeControlFeedback")).toContainText("Start request accepted");
    saved = await storage();
    expect(saved[`tnnd.smartSwipeLiveArm.v1:${userId}`].armed).toBe(true);
    expect(saved["tnnd.smartSwipeStopRequested.v1"]).toBe(false);
  });

  test("Swipe excludes Watch Conversations and Matches, including after Chrome restart", async () => {
    const watcher = await command("TNND_GLOBAL_WATCHER_START");
    expect(watcher.ok).toBe(false);
    expect(watcher.error).toMatch(/swip/i);
    const matches = await command("TNND_NEW_MATCH_OBSERVATION_START", { refs: ["fixture-a", "fixture-b"] });
    expect(matches.ok).toBe(false);
    expect(matches.error).toMatch(/swip/i);
    await context.close();
    await launch();
    tinder = await context.newPage();
    await tinder.goto("https://tinder.com/app/recs");
    await openPopup();
    expect((await storage())[`tnnd.smartSwipeLiveArm.v1:${userId}`].armed).toBe(true);
    expect((await storage())[`tnnd.smartSwipeDailyProgress.v1:${userId}`].startedSessions).toBe(1);
    const afterRestart = await command("TNND_GLOBAL_WATCHER_START");
    expect(afterRestart.ok).toBe(false);
    expect(afterRestart.error).toMatch(/swip/i);
    await popup.locator("#stopSmartSwipeRuntime").click();
    await expect(popup.locator("#smartSwipeControlFeedback")).toContainText("Stop confirmed");
  });

  test("Watch Conversations survives popup closure and restart; Swipe and Matches remain exclusive", async () => {
    await tinder.goto("https://tinder.com/app/matches");
    await popup.locator("#startReplyWatcher").click();
    await expect(popup.locator("#replyWatcherControlFeedback")).toContainText("Watcher started");
    let saved = await storage();
    expect(saved["tnnd.globalExistingRunner.v2"]).toMatchObject({ enabled: true, mode: "watcher", autoOpenersEnabled: false });
    expect(saved["tnnd.globalExistingRunner.v2"].watchedMatches).toMatchObject({
      baselineReady: true, existingRefs: ["fixture-a", "fixture-b"], newRefs: []
    });
    await tinder.evaluate(() => {
      const tile = document.createElement("a");
      tile.className = "matchListItem";
      tile.href = "/app/messages/fixture-new";
      tile.textContent = "Fixture New";
      document.querySelector("nav")?.prepend(tile);
    });
    await expect.poll(async () => (await storage())["tnnd.globalExistingRunner.v2"]
      .watchedMatches.observer.candidates.map(candidate => candidate.ref)).toEqual(["fixture-new"]);
    saved = await storage();
    expect(saved["tnnd.globalExistingRunner.v2"].watchedMatches).toMatchObject({
      existingRefs: ["fixture-a", "fixture-b"], newRefs: [], observer: { autoSendEnabled: false }
    });
    await popup.close();
    await openPopup();
    expect((await storage())["tnnd.globalExistingRunner.v2"].enabled).toBe(true);
    const matches = await command("TNND_NEW_MATCH_OBSERVATION_START", { refs: ["fixture-a", "fixture-b"] });
    expect(matches.ok).toBe(false);
    expect(matches.error).toMatch(/runner|watcher|chat/i);
    await tinder.goto("https://tinder.com/app/recs");
    const swipe = await command("TNND_SMART_SWIPE_SET_ARMED", { armed: true });
    expect(swipe).toMatchObject({ ok: false, reason: "stop_other_tinder_runners_first" });
    await context.close();
    await launch();
    tinder = await context.newPage();
    await tinder.goto("https://tinder.com/app/matches");
    await openPopup();
    saved = await storage();
    expect(saved["tnnd.globalExistingRunner.v2"].enabled).toBe(true);
    expect(saved["tnnd.globalExistingRunner.v2"].watchedMatches.existingRefs).toEqual(["fixture-a", "fixture-b"]);
    expect(saved["tnnd.globalExistingRunner.v2"].watchedMatches.newRefs).toEqual([]);
    await popup.locator("#stopReplyWatcher").click();
    await expect(popup.locator("#replyWatcherControlFeedback")).toContainText("Watcher stopped");
    expect((await storage())["tnnd.globalExistingRunner.v2"].enabled).toBe(false);
    await tinder.goto("https://tinder.com/app/recs");
    const startedMatches = await command("TNND_NEW_MATCH_OBSERVATION_START", { refs: ["fixture-a", "fixture-b"] });
    expect(startedMatches).toMatchObject({ ok: true, state: { enabled: true } });
    const blockedWatcher = await command("TNND_GLOBAL_WATCHER_START");
    expect(blockedWatcher.ok).toBe(false);
    expect(blockedWatcher.error).toMatch(/match/i);
    const stoppedMatches = await command("TNND_NEW_MATCH_OBSERVATION_STOP");
    expect(stoppedMatches).toMatchObject({ ok: true, state: { enabled: false } });
    const resumedSwipe = await command("TNND_SMART_SWIPE_SET_ARMED", { armed: true });
    expect(resumedSwipe).toMatchObject({ ok: true, armed: true });
    expect((await storage())[`tnnd.smartSwipeDailyProgress.v1:${userId}`].startedSessions).toBe(1);
    await popup.locator("#stopSmartSwipeRuntime").click();
    await expect(popup.locator("#smartSwipeControlFeedback")).toContainText("Stop confirmed");
    await tinder.goto("https://tinder.com/app/matches");
    const resumedWatcher = await command("TNND_GLOBAL_WATCHER_START");
    expect(resumedWatcher).toMatchObject({ ok: true, state: { enabled: true, mode: "watcher" } });
    expect((await command("TNND_GLOBAL_EXISTING_STOP")).state.enabled).toBe(false);
  });

  test("API failures refuse new Swipe and Watch Starts without changing ownership", async () => {
    await tinder.goto("https://tinder.com/app/recs");
    failingPaths.add("/api/v1/automation/smart-swipe/attempts/reconciliation");
    const refusedSwipe = await command("TNND_SMART_SWIPE_SET_ARMED", { armed: true });
    expect(refusedSwipe).toMatchObject({ ok: false, reason: "server_reconciliation_unavailable" });
    expect((await storage())[`tnnd.smartSwipeLiveArm.v1:${userId}`].armed).toBe(false);
    failingPaths.clear();
    const started = await command("TNND_SMART_SWIPE_SET_ARMED", { armed: true });
    expect(started).toMatchObject({ ok: true, armed: true });
    expect((await command("TNND_SMART_SWIPE_SET_ARMED", { armed: false })).armed).toBe(false);
    await tinder.goto("https://tinder.com/app/matches");
    failingPaths.add("/api/v1/conversations/management");
    const refusedWatcher = await command("TNND_GLOBAL_WATCHER_START");
    expect(refusedWatcher.ok).toBe(false);
    expect(refusedWatcher.error).toMatch(/conversations|API/i);
    expect((await storage())["tnnd.globalExistingRunner.v2"].enabled).toBe(false);
    failingPaths.clear();
    const startedWatcher = await command("TNND_GLOBAL_WATCHER_START");
    expect(startedWatcher).toMatchObject({ ok: true, state: { enabled: true, mode: "watcher" } });
    expect((await command("TNND_GLOBAL_EXISTING_STOP")).state.enabled).toBe(false);
    await tinder.goto("https://tinder.com/app/recs");
  });

  test("server quota and unavailable ledger fail closed without a Like", async () => {
    ledger = { attemptsToday: 2, uiObservedToday: 0, unresolvedAttempts: 0 };
    await popup.locator("#refreshSmartSwipeRuntime").click();
    await expect(popup.locator("#smartSwipeRuntimeSummary")).toContainText("Like attempt slots left: 0");
    apiAvailable = false;
    await popup.locator("#refreshSmartSwipeRuntime").click();
    await expect(popup.locator("#smartSwipeRuntimeSummary")).toContainText("Start disabled");
    await expect(popup.locator("#startSmartSwipeRuntime")).toBeDisabled();
    await popup.locator("#stopSmartSwipeRuntime").click();
    await expect(popup.locator("#smartSwipeControlFeedback")).toContainText("Stop confirmed");
    expect(await tinder.evaluate(() => window.fixtureLikeClicks || 0)).toBe(0);
  });
});
