import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import test from "node:test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(resolve(root, path), "utf8");
const css = read("public/neo-bento.css");

test("all extension views load the shared Neo Bento stylesheet after their local CSS", () => {
  for (const path of ["public/popup.html", "public/options.html", "public/preview.html"]) {
    const html = read(path);
    assert.match(html, /<\/style><link rel="stylesheet" href="neo-bento\.css"><\/head>/);
    assert.equal((html.match(/href="neo-bento\.css"/g) ?? []).length, 1, path);
  }
});

test("extension build copies the shared stylesheet into dist", () => {
  assert.ok(read("scripts/build.mjs").includes('"popup.html", "launcher.html", "connect.html", "neo-bento.css"'));
  assert.ok(read("public/launcher.html").includes('href="neo-bento.css"'));
});

test("extension Neo Bento has semantic tokens, dark mode, keyboard focus and reduced motion", () => {
  for (const token of ["--nb-bg", "--nb-surface", "--nb-text", "--nb-muted", "--nb-border", "--nb-primary", "--nb-on-primary", "--nb-focus", "--nb-mint", "--nb-lilac", "--nb-peach", "--nb-danger"]) {
    assert.ok(css.includes(token + ":"), "Missing token " + token);
  }
  assert.match(css, /:focus-visible/);
  assert.match(css, /@media \(prefers-color-scheme: dark\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /@media \(max-width: 650px\)/);
});

test("extension view behavior IDs are preserved", () => {
  const popup = read("public/popup.html");
  for (const id of ["webDiagnosticCard", "backendLogin", "backendLogout", "chatEditor", "saveChat", "exportDiagnostics", "openSettings", "openPreview"]) {
    assert.ok(popup.includes('id="' + id + '"'), "Missing popup behavior ID: " + id);
  }
  assert.ok(read("public/options.html").includes('id="settings-form"'));
  assert.ok(read("public/preview.html").includes('id="generateMatrix"'));
});

test("popup reaches its primary tasks in one jump and keeps advanced explanations optional",()=>{
  const popup=read("public/popup.html");
  assert.match(popup,/aria-label="Quick access to Tinder tasks"/);
  for(const id of ["globalExistingChatCard","globalNewMatchCard","chatEditor"]){
    assert.match(popup,new RegExp('href="#'+id+'"'));
    assert.match(popup,new RegExp('id="'+id+'"'));
  }
  assert.match(popup,/class="runner-help"/);
  assert.match(popup,/Find waiting replies first; watch for new incoming messages/);
  assert.match(popup,/min-height:44px/);
  assert.match(popup,/:focus-visible/);
  assert.doesNotMatch(popup,/automatically delivered all Tinder messages/);
});

test("popup keeps automation prerequisites readable without hiding runner controls", () => {
  const popup = read("public/popup.html");
  assert.match(popup, /Enable automatic replies in Settings first/);
  assert.match(popup, /<details class="runner-help"><summary>How existing chat automation works<\/summary>/);
  assert.match(popup, /id="startGlobalExisting"/);
  assert.match(popup, /id="stopGlobalExisting"/);
  assert.match(css, /\.runner-help summary \{/);
  assert.match(css, /#chatEditor > \.card \{/);
  assert.match(css, /\.runner-status-panel \{/);
  assert.match(css, /\.tnnd-advanced-tools > summary \{/);
});


test("popup keeps essential stop controls reachable and legacy starts optional", () => {
  const popup = read("public/popup.html");
  assert.match(popup, /<summary>Alternative: full existing-chat sweep<\/summary>/);
  assert.match(popup, /<summary>Alternative: future matches<\/summary>/);
  assert.match(popup, /<summary>How monitoring works<\/summary>/);
  assert.match(popup, /Watch conversations \+ matches \(no first messages\)/);
  for (const id of ["startReplyWatcher", "stopReplyWatcher", "startGlobalExisting", "stopGlobalExisting",
    "startExistingMatchBatch", "startNewMatchObservation", "stopNewMatchObservation", "globalExistingCadence"]) {
    assert.equal((popup.match(new RegExp('id="' + id + '"', "g")) ?? []).length, 1, id + " should remain wired once");
  }
  const legacy = popup.indexOf('<summary>Alternative: full existing-chat sweep</summary>');
  const sweepStart = popup.indexOf('id="startGlobalExisting"');
  const sweepStop = popup.indexOf('id="stopGlobalExisting"');
  assert.ok(legacy < sweepStart && sweepStart < sweepStop, "Legacy start is disclosed first; Stop remains visible");
  assert.doesNotMatch(popup, /\.quick-actions\{position:sticky/);
});

test("toolbar launcher keeps one primary Start/Stop plus three manual mode actions", () => {
  const manifest = JSON.parse(read("public/manifest.json"));
  const launcher = read("public/launcher.html");
  const controller = read("src/launcher.ts");
  assert.equal(manifest.action.default_popup, "launcher.html");
  assert.equal(launcher.split("<button ").length - 1, 4);
  for (const mode of ["swipe", "new-match", "active-chat"]) {
    assert.match(launcher, new RegExp('data-activity="' + mode + '"'));
  }
  assert.match(launcher, /aria-pressed="false"/);
  assert.match(launcher, /id="toggleAutomation"/);
  assert.match(launcher, /TNND Web/);
  assert.doesNotMatch(launcher, /id="startReplyWatcher"|id="startSmartSwipeRuntime"/);
  assert.match(controller, /TNND_UNIFIED_START/);
  assert.match(controller, /TNND_UNIFIED_STOP/);
  assert.ok(read("scripts/build.mjs").includes('["launcher", "src/launcher.ts"]'));
});

test("missing extension session still uses credential page, without credentials in the launcher", () => {
  const launcher = read("public/launcher.html");
  const connectPage = read("public/connect.html");
  const handler = read("src/launcher.ts");
  const auth = read("src/connect.ts");
  assert.equal(launcher.split("<button ").length - 1, 4);
  for (const mode of ["swipe", "new-match", "active-chat"]) {
    assert.match(launcher, new RegExp('data-activity="' + mode + '"'));
  }
  assert.match(launcher, /aria-pressed="false"/);
  assert.ok(connectPage.includes('id="loginForm"'));
  assert.ok(connectPage.includes('type="password"'));
  assert.ok(auth.includes('loginBackend(input)'));
  assert.ok(auth.includes("password.value = \"\""));
  assert.ok(handler.includes('chrome.runtime.getURL("connect.html")'));
  assert.ok(read("scripts/build.mjs").includes('["connect", "src/connect.ts"]'));
  assert.equal(JSON.parse(read("public/manifest.json")).action.default_popup, "launcher.html");
});
