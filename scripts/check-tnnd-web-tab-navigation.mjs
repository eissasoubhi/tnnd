import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  DEFAULT_TNND_WEB_ORIGIN, isTnndWebOrigin, pickTnndWebTab,
  tnndWebSection, tnndWebTabUrl
} from "../src/tnnd-web-tab-navigation.ts";

test("TNND Web link only navigates permitted local page fragments", () => {
  assert.equal(DEFAULT_TNND_WEB_ORIGIN, "http://127.0.0.1:5173");
  for (const host of ["localhost", "127.0.0.1"]) {
    for (const part of ["#workspace-settings-section", "#smart-swipe-activity"]) {
      assert.equal(tnndWebSection("http://" + host + ":5173/" + part), part);
    }
    assert.equal(isTnndWebOrigin("http://" + host + ":5173/"), true);
  }
  for (const href of [
    "https://localhost:5173/#workspace-settings-section",
    "http://localhost:3000/#workspace-settings-section",
    "http://evil.example:5173/#workspace-settings-section",
    "http://localhost:5173/admin#workspace-settings-section",
    "http://localhost:5173/?token=x#workspace-settings-section",
    "http://localhost:5173/#login",
    "chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/connect.html",
    "javascript:alert(1)", "not a url"
  ]) assert.equal(tnndWebSection(href), null, href);
});

test("existing TNND Web tab is reused without changing origin or losing its tab ID", () => {
  const candidates = [
    { id: 8, url: "http://localhost:5173/", active: false, lastAccessed: 80, windowId: 3 },
    { id: 14, url: "http://127.0.0.1:5173/", active: true, lastAccessed: 70, windowId: 1 },
    { id: 20, url: "http://localhost:3000/", active: true, lastAccessed: 200 },
    { id: 21, url: "https://evil.example:5173/", active: true, lastAccessed: 300 }
  ];
  const selected = pickTnndWebTab(candidates);
  assert.equal(selected?.id, 14);
  assert.equal(tnndWebTabUrl(selected.url, "#workspace-settings-section"),
    "http://127.0.0.1:5173/#workspace-settings-section");
  assert.equal(pickTnndWebTab(candidates.filter(x => x.id !== 14))?.id, 8);
  assert.equal(tnndWebTabUrl("http://localhost:5173/", "#smart-swipe-activity"),
    "http://localhost:5173/#smart-swipe-activity");
  assert.equal(pickTnndWebTab([], false), null);
  assert.equal(pickTnndWebTab([{ id: 7, url: "http://localhost:5173/", incognito: true }]), null);
  assert.equal(pickTnndWebTab([{ id: 7, url: "http://localhost:5173/", incognito: true }], true)?.id, 7);
  assert.throws(() => tnndWebTabUrl("http://localhost:3000/", "#smart-swipe-activity"));
  assert.equal(isTnndWebOrigin("http://localhost:5173/path?anything"), true);
});

test("Chrome launcher intercepts only local Web links and never copies tokens between tabs", async () => {
  const [launcher, markup, auth] = await Promise.all([
    readFile(new URL("../src/launcher.ts", import.meta.url), "utf8"),
    readFile(new URL("../public/launcher.html", import.meta.url), "utf8"),
    readFile(new URL("../apps/web/src/auth-client.ts", import.meta.url), "utf8")
  ]);
  assert.match(auth, /sessionStorage\.setItem\("tnnd:web:auth-session"/);
  assert.match(markup, /id="webSettingsLink"/);
  assert.match(launcher, /webSettingsLink\.addEventListener\("click"/);
  assert.match(launcher, /pickTnndWebTab\(candidates/);
  assert.match(launcher, /chrome\.tabs\.update\(tab\.id/);
  // chrome.tabs.query uses extension match patterns: hosts cannot contain ports.
  // The trusted URL parser, not the query pattern, enforces port 5173.
  assert.match(launcher, /url: \["http:\/\/localhost\/\*", "http:\/\/127\.0\.0\.1\/\*"\]/);
  assert.match(launcher, /chrome\.windows\.update\(tab\.windowId/);
  assert.match(launcher, /chrome\.tabs\.create\(\{ url: DEFAULT_TNND_WEB_ORIGIN/);
  assert.match(launcher, /tnndWebSection\(webSettingsLink\.href\)/);
  assert.doesNotMatch(launcher, /sessionStorage\.(?:setItem|getItem)|tnnd:web:auth-session/);
  assert.doesNotMatch(launcher, /https:\/\/tinder\.com/);
});
