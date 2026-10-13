import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { validTinderChatLink } from "../src/tinder-spa-conversation-navigation.ts";

test("safe Tinder SPA switch only selects the exact thread in same-origin Messages sidebar", () => {
 assert.equal(validTinderChatLink("https://tinder.com/app/messages/srim","srim","https://tinder.com"),true);
 assert.equal(validTinderChatLink("/app/messages/srim","srim","https://tinder.com"),true);
 assert.equal(validTinderChatLink("/app/messages/srim-other","srim","https://tinder.com"),false);
 assert.equal(validTinderChatLink("https://other.example/app/messages/srim","srim","https://tinder.com"),false);
 assert.equal(validTinderChatLink("/app/messages/srim","srim/next","https://tinder.com"),false);
 assert.equal(validTinderChatLink("/app/messages/srim","", "https://tinder.com"),false);
});

test("runner must click real Tinder links instead of full page tab navigation", async () => {
 const content = await readFile(new URL("../src/content.ts",import.meta.url),"utf8");
 const runner = await readFile(new URL("../src/tinder-global-existing-runner.ts",import.meta.url),"utf8");
 const links = await readFile(new URL("../src/tinder-spa-conversation-navigation.ts",import.meta.url),"utf8");
 assert.match(links, /a\.messageListItem\[href\*=/);
 assert.match(links, /getClientRects\(\)\.length > 0/);
 assert.match(content,/TNND_EXISTING_SPA_NAVIGATE/);
 assert.match(content,/selectVisibleTinderChatLink\(document, ref, location\.origin\)/);
 assert.match(content,/anchor\.click\(\)/);
 assert.match(content,/currentConversationRef\(\) !== expectedRef/);
 assert.match(content,/currentConversationRef\(\) === ref && adapter\.diagnose\(\)\.composerFound/);
 assert.match(content,/window\.setTimeout\(scheduleScan, 1300\)/);
 assert.match(content,/spaNavigationSettlesAt/);
 assert.match(runner,/cursorRef: nextRef/);
 assert.match(runner,/chrome\.tabs\.sendMessage\(tabId/);
 assert.match(runner,/TNND_EXISTING_SPA_NAVIGATE/);
 assert.doesNotMatch(runner,/chrome\.tabs\.update\(tabId, \{ url:/);
 assert.match(runner,/thread_not_in_visible_sidebar/);
 assert.match(runner,/spa_navigation_not_confirmed|spa_navigation_unconfirmed/);
});

test("separate adjustable conversation dwell never overrides reply delay or pending sends", async () => {
 const runner = await readFile(new URL("../src/tinder-global-existing-runner.ts",import.meta.url),"utf8");
 const popup = await readFile(new URL("../src/popup.ts",import.meta.url),"utf8");
 const html = await readFile(new URL("../public/popup.html",import.meta.url),"utf8");
 const content = await readFile(new URL("../src/content.ts",import.meta.url),"utf8");
 assert.match(runner,/ALLOWED_CADENCES = \[10, 15, 30, 60, 120\]/);
 assert.match(runner,/DEFAULT_CADENCE = 15/);
 assert.match(runner,/Date\.now\(\) - Date\.parse\(state\.lastVisitAt\) < dwellSeconds \* 1000/);
 assert.match(runner,/replyInProgress && Number\.isFinite\(elapsed\)/);
 assert.match(runner,/periodInMinutes: 0\.5/);
 assert.match(runner,/TNND_EXISTING_RUNNER_TICK/);
 assert.match(content,/spaNavigationBusy \|\| busy/);
 assert.match(content,/TNND_EXISTING_RUNNER_TICK/);
 assert.match(popup,/TNND_GLOBAL_EXISTING_SET_CADENCE/);
 assert.match(html,/globalExistingCadence/);
 assert.match(html,/Independent of AI reply delay/);
});
