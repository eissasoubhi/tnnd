import { test, expect, chromium } from "playwright/test";
import { unzipSync, strFromU8 } from "fflate";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { execFileSync } from "node:child_process";
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
  maxRightSwipesPerDay: null,
  priority: ["swipe", "new-match", "active-chat"],
  pauseSwipeDuringActiveConversation: true,
  maxActiveChatSecondsPerConversationPerDay: null,
  timeZone: "UTC"
};
const requests = [];
const importedFixtureThreads = new Map();
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
  if (path === "/api/v1/auth/login" && req.method === "POST") {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    const authorized = payload.email === "e2e@example.test" &&
      payload.password === "fixture-password-12345" && payload.clientType === "extension";
    return authorized
      ? json(res, 200, session)
      : json(res, 401, { error: "invalid_credentials" });
  }
  if (path === "/api/v1/auth/session") return json(res, 200, { user: session.user });
  if (path === "/api/v1/profile") return json(res, 404, { error: "fixture_no_profile" });
  if (path === "/api/v1/tinder/import-settings" && req.method === "GET")
    return json(res, 200, { settings: {
      autoSyncOpened: true, autoCollectLoaded: true, scope: "all",
      ageMin: null, ageMax: null, requireMessages: false,
      includeMessages: true, includeProfile: false, includePhotos: false
    } });
  if (path === "/api/v1/conversations/by-external-thread" &&
      url.searchParams.get("externalThreadId") === "fixture-import-first") {
    const saved = importedFixtureThreads.get("fixture-import-first");
    return saved
      ? json(res, 200, { conversation: {
          id: saved.conversationId, externalThreadId: "fixture-import-first",
          status: "paused", managementState: "unmanaged", explicitlySelected: false
        }})
      : json(res, 404, { error: "conversation_not_found" });
  }
  if (path === "/api/v1/conversations/sync" && req.method === "POST") {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const input = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!input.readOnlyImport ||
        !["fixture-old-incoming","fixture-import-first"].includes(input.externalThreadId))
      return json(res, 400, {error:"unexpected_non_import_fixture_request"});
    const prior = importedFixtureThreads.get(input.externalThreadId);
    const conversationId = prior?.conversationId ?? (
      input.externalThreadId === "fixture-old-incoming"
        ? "fixture-conversation-id" : "fixture-new-import-id");
    importedFixtureThreads.set(input.externalThreadId, {
      conversationId, messages: input.messages, readOnlyImport: input.readOnlyImport,
      status: input.status ?? null
    });
    return json(res, 200, {
      conversationId, status: input.externalThreadId === "fixture-import-first" ? "paused":"active",
      acceptedMessageIds: input.messages.map(m=>m.externalMessageId),
      nextCursor: input.nextCursor ?? input.messages.at(-1)?.externalMessageId ?? "no-cursor",
      serverTime: new Date().toISOString()
    });
  }

  if (path === "/api/v1/conversations/by-external-thread" &&
      url.searchParams.get("externalThreadId") === "fixture-old-incoming")
    return json(res, 200, { conversation: {
      id: "fixture-conversation-id", externalThreadId: "fixture-old-incoming",
      status: "active", managementState: "ai-managed", explicitlySelected: true
    }});
  if (path === "/api/v1/conversations/fixture-conversation-id")
    return json(res, 200, { conversation: {
      id: "fixture-conversation-id",
      messages: [{ direction: "incoming", text: "Coucou" }],
      matchScreening: { action: "continue" }
    }});
  if (path === "/api/v1/conversations/observed-boundary" && req.method === "POST") {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const input = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (input.externalThreadId !== "fixture-old-incoming" ||
        input.messages?.at(-1)?.direction !== "incoming")
      return json(res, 400, { error: "invalid_conversation_boundary" });
    // Deliberately NO CORS response headers. Tinder-page fetch used to fail,
    // but the host-authorized MV3 worker can call the same local API.
    return json(res, 200, { applied: false, boundary: {
      kind: "continue", platform: null, confidence: 0.99, evidence: "ongoing"
    }});
  }

  if (path === "/api/v1/automation/smart-swipe") return json(res, 200, { settings });
  if (path === "/api/v1/automation/smart-swipe/attempts/summary") return json(res, 200, {
    ...ledger, dayKey: new Date().toISOString().slice(0, 10)
  });
  if (path === "/api/v1/automation/smart-swipe/attempts/reconciliation") return json(res, 200, {
    dayKey: url.searchParams.get("dayKey"), attempts: ledger.attemptsToday,
    uiObserved: ledger.uiObservedToday, reviewedUnknown: 0,
    // The signed-in API always supplies this distinct resolved status.
    // Missing fields are intentionally rejected by the extension.
    notClicked: 0, unresolvedAcrossDays: ledger.unresolvedAttempts
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
const fakeOldUnanswered = `<!doctype html><html><head><title>Fictional old incoming message</title>
<style>body{font:14px sans-serif}.chat{width:640px}textarea{width:480px;height:40px}.msg{width:240px;padding:12px}.msg--received{background:#eee}.chat-bubble-send{background:#dfbecb}</style></head><body>
<div class="chat"><ol aria-label="Messages">
<li><div role="article"><div class="msg chat-bubble-send"><span class="text">Salut</span></div></div></li>
<li><div role="article"><div class="msg msg--received"><span class="text">Coucou</span></div></div></li>
</ol><form><textarea aria-label="Type a message" placeholder="Type a message"></textarea>
<button type="submit" aria-label="Send message">Send</button></form></div></body></html>`;

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
      // Real Tinder rejects the bare Messages route. A fictional 200 here
      // previously concealed the broken one-tab orchestrator redirect.
      if (url.pathname === "/app/messages")
        return route.fulfill({ status: 404, contentType: "text/html", body: "Tinder 404: Messages requires native SPA navigation" });
      if (url.pathname === "/app/messages/fixture-old-incoming" ||
          url.pathname === "/app/messages/fixture-import-first")
        return route.fulfill({ status: 200, contentType: "text/html", body: fakeOldUnanswered });
      return route.fulfill({ status: 200, contentType: "text/html",
        body: url.pathname === "/app/matches" ? fakeMatches : fakeTinder });
    }
    // Fictional TNND Web served on both loopback origins for tab-scoped
    // sessionStorage navigation QA. No real auth, token or user data.
    if ((url.hostname === "localhost" || url.hostname === "127.0.0.1") &&
        url.protocol === "http:" && url.port === "5173")
      return route.fulfill({ status: 200, contentType: "text/html",
        body: "<!doctype html><html><body><main>Fictional TNND Web</main></body></html>" });
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

  test("compact Chat Journal button opens one read-only extension tab with live 50-event filtering", async () => {
    const key = "tnnd.globalExistingRunner.v2";
    const worker = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker");
    const before = (await storage())[key];
    const now = new Date().toISOString();
    const launcher = await context.newPage();
    let journal;
    try {
      await worker.evaluate(({ key, now }) => chrome.storage.local.set({ [key]: {
        enabled: true, mode: "watcher", phase: "skipped",
        phaseDetail: "Analyse non confirmée après 30 s : aucune réponse validée",
        currentLabel: "Qamar", pendingReplies: 2, lastActionAt: now,
        activity: [
          { at: now, phase: "loading", detail: "Opening Qamar", conversation: "Qamar" },
          { at: now, phase: "skipped", detail: "Analyse non confirmée après 30 s", conversation: "Qamar" }
        ]
      } }), { key, now });
      await launcher.goto(`chrome-extension://${extensionId}/launcher.html`);
      await launcher.locator("#tabChat").click();
      await expect(launcher.locator("#openChatJournal")).toBeVisible();
      [journal] = await Promise.all([
        context.waitForEvent("page"),
        launcher.locator("#openChatJournal").click()
      ]);
      await journal.waitForLoadState();
      await expect(journal).toHaveURL(`chrome-extension://${extensionId}/chat-journal.html`);
      await expect(journal.locator("#currentConversation")).toHaveText("Qamar");
      await expect(journal.locator("#pendingCount")).toHaveText("2");
      await expect(journal.locator("#journalList .entry")).toHaveCount(2);
      await expect(journal.locator("#diagnosis")).toBeVisible();
      await journal.locator('[data-filter="problems"]').click();
      await expect(journal.locator("#journalList .entry")).toHaveCount(1);
      await expect(journal.locator("#journalList")).toContainText("Analyse non confirmée");
      await worker.evaluate(({ key, now }) => chrome.storage.local.set({ [key]: {
        enabled: true, mode: "watcher", phase: "sent", phaseDetail: "Tinder send action completed",
        currentLabel: "Qamar", pendingReplies: 1, lastActionAt: now,
        activity: [
          { at: now, phase: "loading", detail: "Opening Qamar", conversation: "Qamar" },
          { at: now, phase: "skipped", detail: "Analyse non confirmée après 30 s", conversation: "Qamar" },
          { at: now, phase: "sent", detail: "Tinder send action completed", conversation: "Qamar" }
        ]
      } }), { key, now });
      await journal.locator('[data-filter="sent"]').click();
      await expect(journal.locator("#journalList .entry")).toHaveCount(1);
      await expect(journal.locator("#journalList")).toContainText("Tinder send action completed");
      await expect(journal.locator("#pendingCount")).toHaveText("1");
      // Export must use a fresh storage snapshot, not the visible "Envois"
      // filter. Verify a real Blob download on unpacked Chrome MV3.
      const [download] = await Promise.all([
        journal.waitForEvent("download"),
        journal.locator("#downloadChatJournal").click()
      ]);
      expect(download.suggestedFilename()).toMatch(/^tnnd-chat-journal-.*\.json$/);
      const exported = JSON.parse(await readFile(await download.path(), "utf8"));
      expect(exported).toMatchObject({
        format: "tnnd-chat-journal", schemaVersion: 1,
        extensionVersion: await journal.evaluate(() => chrome.runtime.getManifest().version),
        state: { enabled: true, mode: "watcher", currentConversation: "Qamar",
          pendingReplies: 1 }
      });
      expect(exported.events).toHaveLength(3);
      expect(exported.events.map(event => event.phase)).toEqual(["loading", "skipped", "sent"]);
      expect(JSON.stringify(exported)).not.toContain("fixture-only-token");
      await expect(journal.locator("#downloadFeedback")).toContainText("3 événements");
      expect((await context.pages()).filter(page => page.url().startsWith("https://tinder.com"))).toHaveLength(1);
    } finally {
      await journal?.close();
      await launcher.close();
      await worker.evaluate(({ key, before }) =>
        before === undefined ? chrome.storage.local.remove(key) :
          chrome.storage.local.set({ [key]: before }), { key, before });
    }
  });

  test("explicit backlog scan recognizes an OLD incoming Tinder message without waiting for a new event", async () => {
    try {
      await tinder.goto("https://tinder.com/app/messages/fixture-old-incoming");
      const reply = await popup.evaluate(async () => {
        const tabs = await chrome.tabs.query({
          url: ["https://tinder.com/*", "https://www.tinder.com/*"]
        });
        return chrome.tabs.sendMessage(tabs[0].id, {
          type: "TNND_EXISTING_SCAN_OPENED_THREAD", ref: "fixture-old-incoming"
        });
      });
      expect(reply).toMatchObject({
        ok: true, status: "unanswered",
        composerFound: true, incoming: 1, outgoing: 1, unknown: 0
      });
      // Read-only scan does not itself click Send, invent backend permission,
      // or open another Tinder tab, even though the message is old.
      expect((await context.pages()).filter(page => page.url().startsWith("https://tinder.com"))).toHaveLength(1);
    } finally {
      await tinder.goto("https://tinder.com/app/recs");
    }
  });

  test("SPA old-message scanner delivers its actual scan event after Tinder history.pushState", async () => {
    const key = "tnnd.globalExistingRunner.v2";
    const worker = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker");
    const before = (await storage())[key];
    try {
      // The document starts at a DIFFERENT thread. Tinder's React router
      // changes only history/location; Chrome MessageSender.url can remain the
      // document's initial route, which previously dropped every event.
      await tinder.goto("https://tinder.com/app/messages/fixture-old-incoming");
      const tabId = await popup.evaluate(async () =>
        (await chrome.tabs.query({ url: "https://tinder.com/*" }))[0].id);
      const newRef = "fixture-after-spa";
      await tinder.evaluate(newRef => {
        history.pushState({}, "", "/app/messages/" + newRef);
      }, newRef);
      const now = new Date().toISOString();
      await worker.evaluate(({key, tabId, newRef, userId, now}) =>
        chrome.storage.local.set({ [key]: {
          enabled: true, mode: "watcher", userId, tabId, startedAt: now,
          lastRef: newRef, awaitingChatRef: newRef, awaitingChatSince: now,
          currentLabel: "Fictional old inbox", phase: "waiting",
          phaseDetail: "Opened fictional thread", activity: []
        }}), {key, tabId, newRef, userId, now});
      const probe = await popup.evaluate(async ref => {
        const tab = (await chrome.tabs.query({ url: "https://tinder.com/*" }))[0];
        return chrome.tabs.sendMessage(tab.id, {
          type: "TNND_EXISTING_SCAN_OPENED_THREAD", ref
        });
      }, newRef);
      expect(probe).toMatchObject({ ok: true, status: "unanswered", incoming: 1 });
      await expect.poll(async () => {
        const state = (await storage())[key];
        return state?.activity?.map(event => event.detail) || [];
      }, { timeout: 12_000 }).toContain(
        "Moteur Chat : scan effectivement démarré ; lecture des paramètres d'automatisation."
      );
      // The old message can be examined, but the test must NOT send to real
      // Tinder or pretend the backend gave consent to auto-reply.
      expect((await context.pages()).filter(page =>
        page.url().startsWith("https://tinder.com"))).toHaveLength(1);
    } finally {
      await worker.evaluate(({key,before}) => before === undefined
        ? chrome.storage.local.remove(key) : chrome.storage.local.set({[key]:before}), {key,before});
      await tinder.goto("https://tinder.com/app/recs");
    }
  });

  test("old incoming Tinder message reaches semantic API through MV3 worker despite absent Tinder CORS", async () => {
    const stateKey = "tnnd.globalExistingRunner.v2";
    const worker = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker");
    const stored = await storage();
    const beforeState = stored[stateKey];
    const beforeConfig = stored["tnnd.config"];
    const firstRequest = requests.length;
    try {
      await tinder.goto("https://tinder.com/app/messages/fixture-old-incoming");
      const tabId = await popup.evaluate(async () =>
        (await chrome.tabs.query({url:"https://tinder.com/*"}))[0].id);
      const now = new Date().toISOString();
      await worker.evaluate(({stateKey,tabId,userId,now}) =>
        chrome.storage.local.set({
          [stateKey]: {
            enabled:true,mode:"watcher",userId,tabId,startedAt:now,
            lastRef:"fixture-old-incoming",awaitingChatRef:"fixture-old-incoming",
            awaitingChatSince:now,phase:"waiting",currentLabel:"Fictional incoming",
            activity:[]
          },
          "tnnd.config": { automation: {
            enabled:true,maxFirstMessagesPerDay:5,
            replyDelayMinSeconds:120,replyDelayMaxSeconds:120
          }}
        }), {stateKey,tabId,userId,now});
      const inspect = await popup.evaluate(async () => {
        const tab = (await chrome.tabs.query({url:"https://tinder.com/*"}))[0];
        return chrome.tabs.sendMessage(tab.id, {
          type:"TNND_EXISTING_SCAN_OPENED_THREAD",ref:"fixture-old-incoming"
        });
      });
      expect(inspect).toMatchObject({ok:true,status:"unanswered",incoming:1});
      await expect.poll(() => requests.slice(firstRequest)
        .filter(item => item.path === "/api/v1/conversations/observed-boundary" &&
          item.method === "POST" && item.authorization).length,
        {timeout:15_000,intervals:[100,200,500]}).toBeGreaterThan(0);
      const activity = (await storage())[stateKey]?.activity ?? [];
      expect(activity.map(event => event.detail).join(" ")).not.toContain("Vérification sémantique impossible");
      expect((await context.pages()).filter(page => page.url().startsWith("https://tinder.com"))).toHaveLength(1);
      // Classification is not permission to send now. The fixture never
      // confirms any real Tinder send and automation remains isolated.
    } finally {
      await worker.evaluate(({stateKey,beforeState,beforeConfig}) => {
        const delta = {};
        if (beforeState !== undefined) delta[stateKey] = beforeState;
        if (beforeConfig !== undefined) delta["tnnd.config"] = beforeConfig;
        return chrome.storage.local.set(delta).then(() => chrome.storage.local.remove([
          ...(beforeState === undefined ? [stateKey] : []),
          ...(beforeConfig === undefined ? ["tnnd.config"] : [])
        ]));
      }, {stateKey,beforeState,beforeConfig});
      await tinder.goto("https://tinder.com/app/recs");
    }
  });

  test("Chat syncs existing Tinder messages before AI; missing Web conversations stay unselected and paused", async () => {
    const key = "tnnd.globalExistingRunner.v2";
    const worker = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker");
    const before = (await storage())[key];
    const now = new Date().toISOString();
    try {
      await tinder.goto("https://tinder.com/app/messages/fixture-import-first");
      const tabId = await popup.evaluate(async () =>
        (await chrome.tabs.query({url:"https://tinder.com/*"}))[0].id);
      await worker.evaluate(({key,tabId,userId,now}) => chrome.storage.local.set({
        [key]: { enabled:true,mode:"watcher",userId,tabId,startedAt:now,
          lastRef:"fixture-import-first",awaitingChatRef:"fixture-import-first",
          awaitingChatSince:now,phase:"waiting",activity:[],currentLabel:"Fixture" }
      }),{key,tabId,userId,now});
      const probe = await popup.evaluate(async () => {
        const tab = (await chrome.tabs.query({url:"https://tinder.com/*"}))[0];
        return chrome.tabs.sendMessage(tab.id,{
          type:"TNND_EXISTING_SCAN_OPENED_THREAD",ref:"fixture-import-first"
        });
      });
      expect(probe).toMatchObject({ok:true,status:"unanswered",incoming:1});
      await expect.poll(() => importedFixtureThreads.get("fixture-import-first")?.messages?.length,
        {timeout:15_000,intervals:[100,200,500]}).toBe(2);
      const imported = importedFixtureThreads.get("fixture-import-first");
      expect(imported).toMatchObject({readOnlyImport:true,status:"paused"});
      expect(imported.messages.map(m=>m.direction)).toEqual(["outgoing","incoming"]);
      // New imports do NOT auto-enable management and can never send without
      // a separate explicit user opt-in in TNND Web.
      await expect.poll(async () => ((await storage())[key]?.activity || [])
        .map(e=>e.detail).join(" "),{timeout:12_000}).toContain("Gestion IA non activée");
      expect(requests.filter(r=>r.path==="/api/v1/conversations/observed-boundary" &&
        r.method==="POST").length).toBeGreaterThanOrEqual(0);
      expect((await context.pages()).filter(p=>p.url().startsWith("https://tinder.com"))).toHaveLength(1);
    } finally {
      await worker.evaluate(({key,before})=>before===undefined
        ? chrome.storage.local.remove(key) : chrome.storage.local.set({[key]:before}),
        {key,before});
      await tinder.goto("https://tinder.com/app/recs");
      importedFixtureThreads.delete("fixture-import-first");
    }
  });

  test("Chat imports stale managed Tinder transcript before semantic classification even across SPA navigation", async () => {
    const key = "tnnd.globalExistingRunner.v2";
    const worker = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker");
    const before = (await storage())[key];
    const firstRequest = requests.length;
    const now = new Date().toISOString();
    try {
      await tinder.goto("https://tinder.com/app/recs");
      // Chrome retains its initial MessageSender.url; the live route differs.
      await tinder.evaluate(()=>history.pushState({},"","/app/messages/fixture-old-incoming"));
      const tabId = await popup.evaluate(async () =>
        (await chrome.tabs.query({url:"https://tinder.com/*"}))[0].id);
      await worker.evaluate(({key,tabId,userId,now}) => chrome.storage.local.set({
        [key]: {enabled:true,mode:"watcher",userId,tabId,startedAt:now,
          lastRef:"fixture-old-incoming",awaitingChatRef:"fixture-old-incoming",
          awaitingChatSince:now,phase:"waiting",activity:[]}
      }),{key,tabId,userId,now});
      // Use real fictional chat DOM. A pathname change alone retains discovery
      // fixture markup, so navigate the content to the explicit chat fixture.
      await tinder.goto("https://tinder.com/app/messages/fixture-old-incoming");
      const probe = await popup.evaluate(async () => {
        const tab=(await chrome.tabs.query({url:"https://tinder.com/*"}))[0];
        return chrome.tabs.sendMessage(tab.id,{
          type:"TNND_EXISTING_SCAN_OPENED_THREAD",ref:"fixture-old-incoming"
        });
      });
      expect(probe).toMatchObject({ok:true,status:"unanswered",incoming:1});
      await expect.poll(() => requests.slice(firstRequest).filter(r =>
        r.path==="/api/v1/conversations/observed-boundary" &&
        r.method==="POST" && r.authorization).length,
        {timeout:15_000,intervals:[100,200,500]}).toBeGreaterThan(0);
      expect(importedFixtureThreads.get("fixture-old-incoming")?.messages?.map(m=>m.text))
        .toEqual(["Salut","Coucou"]);
      const phases=(await storage())[key]?.activity?.map(e=>e.detail).join(" ") ?? "";
      expect(phases).not.toContain("Chat intent uncertain or not synchronized");
    } finally {
      await worker.evaluate(({key,before})=>before===undefined
        ? chrome.storage.local.remove(key) : chrome.storage.local.set({[key]:before}),
        {key,before});
      await tinder.goto("https://tinder.com/app/recs");
      importedFixtureThreads.delete("fixture-old-incoming");
    }
  });

  test("extension logout from Chrome storage requires its own safe sign-in page without cluttering popup", async () => {
    const worker = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker");
    const launcher = await context.newPage();
    try {
      await worker.evaluate(() => chrome.storage.local.remove("tnnd.backendSession"));
      await launcher.goto(`chrome-extension://${extensionId}/launcher.html`);
      await expect(launcher.locator("button")).toHaveCount(7);
       await expect(launcher.locator(".mode-button")).toHaveCount(3);
      await launcher.locator("#toggleAutomation").click();
      await expect(launcher.locator("#engineStatus")).toContainText("Arrêté");
      await expect(launcher.locator("#feedback")).toContainText("L'extension Chrome n'est pas connectée");
      await expect(launcher.locator("#webSettingsLink"))
        .toHaveAttribute("href", `chrome-extension://${extensionId}/connect.html`);
      const beforeClaims = requests.filter(item => item.path.endsWith("/attempts/claim")).length;
      const [connection] = await Promise.all([
        context.waitForEvent("page"),
        launcher.locator("#webSettingsLink").click()
      ]);
      try {
        await connection.waitForLoadState("load");
        await expect(connection.locator("#loginForm")).toBeVisible();
        await connection.locator("#email").fill("e2e@example.test");
        await connection.locator("#password").fill("not-the-right-password");
        await connection.locator("#login").click();
        await expect(connection.locator("#status")).toContainText("Connexion refusée");
        expect((await storage())["tnnd.backendSession"]).toBeUndefined();
        await connection.locator("#password").fill("fixture-password-12345");
        await connection.locator("#login").click();
        await expect(connection.locator("#status")).toContainText("Extension connectée");
        await expect(connection.locator("#password")).toHaveValue("");
        expect((await storage())["tnnd.backendSession"].user.id).toBe(userId);
      } finally {
        await connection.close();
      }
      await launcher.reload();
      await expect(launcher.locator("#toggleAutomation")).toHaveText("Démarrer Auto");
      await expect(launcher.locator("#webSettingsLink")).toHaveAttribute(
        "href", "http://127.0.0.1:5173/#workspace-settings-section");
      expect(requests.filter(item => item.path.endsWith("/attempts/claim")).length)
        .toBe(beforeClaims);
      expect(await tinder.evaluate(() => window.fixtureLikeClicks || 0)).toBe(0);
    } finally {
      await launcher.close();
      await worker.evaluate(value => chrome.storage.local.set({ "tnnd.backendSession": value }), session);
    }
  });

  test("default popup has one primary Stop and three manual buttons while preserving Web-priority engine", async () => {
    const simple = await context.newPage();
    try {
      await simple.goto(`chrome-extension://${extensionId}/launcher.html`);
      expect(await simple.evaluate(() => chrome.runtime.getManifest().action.default_popup))
        .toBe("launcher.html");
      await expect(simple.locator("button")).toHaveCount(7);
       await expect(simple.locator(".mode-button")).toHaveCount(3);
      const installedInfo = JSON.parse(await readFile(resolve("dist/BUILD-INFO.json"), "utf8"));
      const currentCommit = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
      const installedVersion = JSON.parse(await readFile(resolve("public/manifest.json"), "utf8")).version;
      expect(installedInfo.version).toBe(installedVersion);
      expect(installedInfo.commit).toBe(currentCommit);
      await expect(simple.locator("footer #version")).toHaveText(
        "v" + installedVersion + " (" + currentCommit.slice(0, 8) + ")");
      expect(await simple.evaluate(() => chrome.runtime.getManifest().version)).toBe(installedVersion);
      await expect(simple.locator("#engineStatus")).toContainText("Arrêté");
      await expect(simple.locator("#reachedLimits")).toBeVisible();
      await expect(simple.locator("#reachedLimits h2")).toHaveText("Activité du jour");
      await expect(simple.locator("#reachedLimitsList li")).toHaveCount(2);
      await expect(simple.locator("#reachedLimitsList")).toContainText("0 / ∞");
      await expect(simple.locator("#reachedLimitsList")).toContainText("0 / ∞");
      await expect(simple.locator("#toggleAutomation")).toHaveText("Démarrer Auto");
      // Rejected Start must never turn the only control into a dead button.
      settings.enabled = false;
      await simple.locator("#toggleAutomation").click();
      await expect(simple.locator("#feedback")).toContainText("Démarrage refusé");
      await expect(simple.locator("#toggleAutomation")).toBeEnabled();
      await expect(simple.locator("#engineStatus")).toContainText("Arrêté");
      settings.enabled = true;
      // A backend outage is NOT a proven old-claim blocker. In this case
      // fail closed rather than switching into a possibly concurrent engine.
      failingPaths.add("/api/v1/automation/smart-swipe/attempts/reconciliation");
      await simple.locator("#toggleAutomation").click();
      await expect(simple.locator("#engineStatus")).toContainText("Arrêté");
      await expect(simple.locator("#feedback")).toContainText("Démarrage refusé");
      expect((await storage())["tnnd.globalExistingRunner.v2"]?.enabled).not.toBe(true);
      failingPaths.delete("/api/v1/automation/smart-swipe/attempts/reconciliation");
      // Read-only daily totals can be missing while the authenticated
      // reconciliation proof and atomic server Like claim remain available.
      failingPaths.add("/api/v1/automation/smart-swipe/attempts/summary");
      await simple.locator("#toggleAutomation").click();
      await expect(simple.locator("#engineStatus")).toContainText("Auto Swipe");
      await expect(simple.locator("#reachedLimitsList")).toContainText("— / ∞");
      expect((await storage())["tnnd.globalExistingRunner.v2"]?.enabled).not.toBe(true);
      await simple.locator("#toggleAutomation").click();
      await expect(simple.locator("#engineStatus")).toContainText("Arrêté");
      failingPaths.delete("/api/v1/automation/smart-swipe/attempts/summary");
      // One old uncertain attempt blocks Swipe, but does not take down the
      // independently permitted conversations watcher. It must NEVER retry
      // or erase the historical Like or arm both engines concurrently.
      ledger = { ...ledger, unresolvedAttempts: 1 };
      settings.priority = ["swipe", "active-chat", "new-match"];
      const beforeClaims = requests.filter(x =>
        x.path === "/api/v1/automation/smart-swipe/attempts/claim").length;
      await simple.locator("#toggleAutomation").click();
      await expect(simple.locator("#engineStatus")).toContainText("Conversations");
      await expect(simple.locator("#feedback")).toContainText("Swipe en attente");
      await expect(simple.locator("#toggleAutomation")).toHaveText("Arrêter");
      expect((await storage())[`tnnd.smartSwipeLiveArm.v1:${userId}`]?.armed).not.toBe(true);
      expect((await storage())["tnnd.globalExistingRunner.v2"]).toMatchObject({
        enabled: true, mode: "watcher", autoOpenersEnabled: false
      });
      expect(requests.filter(x =>
        x.path === "/api/v1/automation/smart-swipe/attempts/claim").length)
        .toBe(beforeClaims);
      expect(await tinder.evaluate(() => window.fixtureLikeClicks || 0)).toBe(0);
      await simple.reload();
      await expect(simple.locator("#engineStatus")).toContainText("Conversations");
      await expect(simple.locator("#feedback")).toContainText("Swipe en attente");
      await expect(simple.locator("#reachedLimitsList")).toContainText("0 / ∞");
      await simple.locator("#toggleAutomation").click();
      await expect(simple.locator("#engineStatus")).toContainText("Arrêté");
      expect((await storage())["tnnd.globalExistingRunner.v2"].enabled).toBe(false);
      expect(ledger.unresolvedAttempts).toBe(1); // no deletion, no false reconciliation
      ledger = { ...ledger, unresolvedAttempts: 0 };
      settings.priority = ["swipe", "new-match", "active-chat"];
      // On fictional Discovery, Web's first priority is Swipe.
      await simple.locator("#toggleAutomation").click();
      await expect(simple.locator("#engineStatus")).toContainText("Auto Swipe");
      await expect(simple.locator("#toggleAutomation")).toHaveText("Arrêter");
      expect((await storage())[`tnnd.smartSwipeLiveArm.v1:${userId}`].armed).toBe(true);
      expect(await tinder.evaluate(() => window.fixtureLikeClicks || 0)).toBe(0);
      // Daily Like counts are informational only, even past the old cap.
      ledger = { ...ledger, attemptsToday: 200, uiObservedToday: 199 };
      await simple.reload();
      await expect(simple.locator("#engineStatus")).toContainText("Auto Swipe");
      await expect(simple.locator("#reachedLimitsList")).toContainText("200 / ∞");
      await expect(simple.locator("#reachedLimitsList")).toContainText("0 / ∞"); // Session counter is informational, never a quota.
      await expect(simple.locator("#toggleAutomation")).toHaveText("Arrêter");
      await expect(simple.locator("#reachedLimitsNote")).toContainText("sans preuve d'acceptation Tinder");
      expect(await tinder.evaluate(() => window.fixtureLikeClicks || 0)).toBe(0);
      await simple.locator("#toggleAutomation").click();
      await expect(simple.locator("#engineStatus")).toContainText("Arrêté");
      ledger = { ...ledger, attemptsToday: 0, uiObservedToday: 0 };
      settings.priority = ["swipe", "new-match", "active-chat"];
      await expect(simple.locator("#engineStatus")).toContainText("Arrêté");
      expect((await storage())[`tnnd.smartSwipeLiveArm.v1:${userId}`].armed).toBe(false);
      expect((await storage())["tnnd.smartSwipeStopRequested.v1"]).toBe(true);
      // With new matches at highest priority, use the existing guarded
      // watcher (not a second independently armed popup).
      settings.priority = ["new-match", "active-chat", "swipe"];
      await tinder.goto("https://tinder.com/app/matches");
      await simple.locator("#toggleAutomation").click();
      await expect(simple.locator("#engineStatus")).toContainText("Nouveaux matchs");
      await expect(simple.locator("#reachedLimits")).toBeVisible();
      await expect(simple.locator("#reachedLimitsList li")).toHaveCount(2);
      expect((await storage())["tnnd.globalExistingRunner.v2"]).toMatchObject({
        enabled: true, mode: "watcher", autoOpenersEnabled: true
      });
      await simple.locator("#toggleAutomation").click();
      await expect(simple.locator("#engineStatus")).toContainText("Arrêté");
      expect((await storage())["tnnd.globalExistingRunner.v2"].enabled).toBe(false);
    } finally {
      settings.priority = ["swipe", "new-match", "active-chat"];
      await simple.close();
      await tinder.goto("https://tinder.com/app/recs");
    }
  });

  test("Messages sidebar navigation stays in the ONE Tinder tab without requesting 404 /app/messages", async () => {
    try {
      await tinder.goto("https://tinder.com/app/recs");
      await tinder.evaluate(() => {
        const nav = document.createElement("nav");
        nav.setAttribute("aria-label", "Tinder conversations");
        const button = document.createElement("button");
        button.textContent = "Messages";
        button.addEventListener("click", () => {
          const link = document.createElement("a");
          link.className = "messageListItem";
          link.href = "/app/messages/amira-fixture";
          link.textContent = "Amira (unsynced, old incoming)";
          nav.appendChild(link);
        });
        nav.appendChild(button);
        document.body.appendChild(nav);
      });
      const response = await popup.evaluate(async () => {
        const tabs = await chrome.tabs.query({
          url: ["https://tinder.com/*", "https://www.tinder.com/*"]
        });
        return chrome.tabs.sendMessage(tabs[0].id, {
          type: "TNND_WATCHER_SELECT_SIDEBAR", target: "messages", expectedRef: null
        });
      });
      expect(response).toMatchObject({ ok: true, sidebar: "messages" });
      const inventory = await popup.evaluate(async () => {
        const [tab] = await chrome.tabs.query({ url: ["https://tinder.com/*"] });
        return chrome.tabs.sendMessage(tab.id, { type: "TNND_WATCHER_READ_MESSAGES" });
      });
      expect(inventory).toMatchObject({ ok: true, refs: ["amira-fixture"] });
      expect(new URL(tinder.url()).pathname).toBe("/app/recs");
      expect((await context.pages()).filter(page => page.url().startsWith("https://tinder.com"))).toHaveLength(1);
    } finally {
      await tinder.goto("https://tinder.com/app/recs");
    }
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

  test("high recorded daily Like count does not block Swipe while session capacity remains", async () => {
    // Earlier serial tests have consumed a daily Swipe session. Keep the
    // session quota available so this test isolates the unlimited-Likes rule,
    // rather than accidentally exercising the intentional session-cap handoff.
    settings.sessionsPerDay = 2;
    apiAvailable = true;
    failingPaths.clear();
    // Every synthetic attempt must be classified before rearming. A 200/199
    // ledger with no reviewed UNKNOWN or verified no-click is incomplete and
    // correctly fails closed; that would not test the unlimited-Likes rule.
    ledger = { attemptsToday: 200, uiObservedToday: 200, unresolvedAttempts: 0 };
    settings.enabled = true;
    settings.priority = ["swipe", "new-match", "active-chat"];
    await tinder.goto("https://tinder.com/app/recs");
    const launcher = await context.newPage();
    try {
      await launcher.goto(`chrome-extension://${extensionId}/launcher.html`);
      await expect(launcher.locator("#reachedLimitsList")).toContainText("200 / ∞");
      await launcher.locator("#toggleAutomation").click();
      await expect(launcher.locator("#engineStatus")).toContainText("Auto Swipe");
      await launcher.reload();
      await expect(launcher.locator("#engineStatus")).toContainText("Auto Swipe");
      await expect(launcher.locator("#reachedLimitsList")).toContainText("200 / ∞");
      expect((await storage())["tnnd.globalExistingRunner.v2"]?.enabled).not.toBe(true);
      expect(await tinder.evaluate(() => window.fixtureLikeClicks || 0)).toBe(0);
      await launcher.locator("#toggleAutomation").click();
      await expect(launcher.locator("#engineStatus")).toContainText("Arrêté");
    } finally {
      await launcher.close();
      settings.sessionsPerDay = 1;
      ledger = { attemptsToday: 0, uiObservedToday: 0, unresolvedAttempts: 0 };
    }
  });

  test("unlimited daily Like tally displays actual counts; unavailable ledger still fails closed", async () => {
    ledger = { attemptsToday: 2, uiObservedToday: 0, unresolvedAttempts: 0 };
    await popup.locator("#refreshSmartSwipeRuntime").click();
    await expect(popup.locator("#smartSwipeRuntimeSummary")).toContainText("Right Like attempts today: 2 (no TNND daily cap)");
    apiAvailable = false;
    await popup.locator("#refreshSmartSwipeRuntime").click();
    await expect(popup.locator("#smartSwipeRuntimeSummary")).toContainText("Start disabled");
    await expect(popup.locator("#startSmartSwipeRuntime")).toBeDisabled();
    await popup.locator("#stopSmartSwipeRuntime").click();
    await expect(popup.locator("#smartSwipeControlFeedback")).toContainText("Stop confirmed");
    expect(await tinder.evaluate(() => window.fixtureLikeClicks || 0)).toBe(0);
  });
  test("launcher settings/review link reuses signed-in TNND Web tab and preserves sessionStorage", async () => {
    const web = await context.newPage();
    const launcher = await context.newPage();
    try {
      await web.goto("http://127.0.0.1:5173/");
      await web.evaluate(() => sessionStorage.setItem("tnnd:web:auth-session", "fictional-existing-session"));
      await launcher.goto(`chrome-extension://${extensionId}/launcher.html`);
      await expect(launcher.locator("#engineStatus")).toContainText("Arrêté");
      const before = context.pages().length;
      await launcher.locator("#webSettingsLink").click();
      await expect.poll(() => web.url()).toContain("http://127.0.0.1:5173/#workspace-settings-section");
      expect(context.pages().length).toBe(before);
      expect(await web.evaluate(() => sessionStorage.getItem("tnnd:web:auth-session")))
        .toBe("fictional-existing-session");

      // Navigating an existing localhost tab must retain localhost. Opening
      // a new 127.0.0.1 tab would appear logged out due to origin isolation.
      await web.goto("http://localhost:5173/");
      await web.evaluate(() => sessionStorage.setItem("tnnd:web:auth-session", "fictional-localhost-session"));
      await launcher.evaluate(() => {
        document.getElementById("webSettingsLink").href =
          "http://127.0.0.1:5173/#smart-swipe-activity";
      });
      await launcher.locator("#webSettingsLink").click();
      await expect.poll(() => web.url()).toContain("http://localhost:5173/#smart-swipe-activity");
      expect(context.pages().length).toBe(before);
      expect(await web.evaluate(() => sessionStorage.getItem("tnnd:web:auth-session")))
        .toBe("fictional-localhost-session");
    } finally {
      await launcher.close();
      await web.close();
    }
  });

  test("header export downloads the active Tinder DOM as a redacted ZIP without changing runner state", async () => {
    const worker = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker");
    const launcher = await context.newPage();
    try {
      await launcher.goto(`chrome-extension://${extensionId}/launcher.html`);
      await expect(launcher.locator("#exportTinderDiagnostic")).toBeEnabled();
      const before = await worker.evaluate(() => chrome.storage.local.get("tnnd.unifiedLauncher.master.v1"));
      // A popup is not an active browser tab. For this fixture page, activate
      // fictional Tinder and trigger the popup command from its loaded page.
      await tinder.bringToFront();
      const downloadWait = launcher.waitForEvent("download");
      await launcher.evaluate(() => {
        window.confirm = () => false; // Explicitly exclude the private screenshot.
        document.getElementById("exportTinderDiagnostic").click();
      });
      const download = await downloadWait;
      expect(download.suggestedFilename()).toMatch(/^tnnd-tinder-page-.*\.zip$/);
      const data = unzipSync(new Uint8Array(await readFile(await download.path())));
      for (const filename of ["metadata.json","page.json","selectors.json","resources.json","config-summary.json","dom-redacted.html"])
        expect(data[filename], filename).toBeDefined();
      expect(data["screenshot-visible.png"]).toBeUndefined();
      const meta = JSON.parse(strFromU8(data["metadata.json"]));
      expect(meta.kind).toBe("tnnd-tinder-page-diagnostic");
      expect(meta.screenshotIncluded).toBe(false);
      const dom = strFromU8(data["dom-redacted.html"]);
      expect(dom).toContain("[text]");
      expect(dom).not.toContain("fixture-only-token");
      expect(await worker.evaluate(() => chrome.storage.local.get("tnnd.unifiedLauncher.master.v1")))
        .toEqual(before);
      await expect(launcher.locator("#diagnosticFeedback")).toContainText("ZIP exporté");
    } finally {
      await launcher.close();
    }
  });


});
