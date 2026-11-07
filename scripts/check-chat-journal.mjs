import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
const read = path => readFile(new URL("../" + path, import.meta.url), "utf8");

test("Chat has one compact, accessible button opening a separate extension-only journal tab", async () => {
  const [html, launcher, page, build] = await Promise.all([
    "public/launcher.html", "src/launcher.ts",
    "public/chat-journal.html", "scripts/build.mjs"
  ].map(read));
  assert.match(html, /id="panelChat"/);
  assert.match(html, /id="openChatJournal"/);
  assert.match(html, /Journal ↗/);
  assert.match(html, /aria-label="Ouvrir le journal d'activité Chat dans un nouvel onglet"/);
  assert.match(launcher, /openChatJournal\.addEventListener\("click"/);
  assert.match(launcher, /chrome\.runtime\.getURL\("chat-journal\.html"\)/);
  assert.match(launcher, /chrome\.tabs\.create\(\{ url: chrome\.runtime\.getURL/);
  assert.match(page, /id="journalList"/);
  assert.match(page, /data-filter="problems"/);
  assert.match(page, /data-filter="sent"/);
  assert.match(page, /assets\/chat-journal\.js/);
  assert.match(build, /"chat-journal\.html"/);
  assert.match(build, /\["chat-journal", "src\/chat-journal\.ts"\]/);
});

test("journal retains 50 redacted operational events without sending or modifying messages", async () => {
  const [journal, watcher, page] = await Promise.all([
    "src/chat-journal.ts", "src/tinder-global-existing-runner.ts",
    "public/chat-journal.html"
  ].map(read));
  assert.match(watcher, /const LOG_LIMIT = 50/);
  assert.match(watcher, /\.slice\(-LOG_LIMIT\)/);
  assert.match(journal, /\.slice\(-50\)\.reverse\(\)/);
  assert.match(journal, /chrome\.storage\.local\.get\(KEY\)/);
  assert.match(journal, /chrome\.storage\.onChanged\.addListener/);
  assert.match(journal, /item\.append\(stamp, main\)/);
  assert.match(journal, /detail\.textContent = entry\.detail\.slice\(0, 240\)/);
  assert.doesNotMatch(journal, /innerHTML|chrome\.tabs\.sendMessage|TNND_UNIFIED_START|TNND_UNIFIED_STOP|fetch\(/);
  assert.match(page, /Le journal contient des états techniques et les noms affichés des conversations, mais pas le texte des messages/);
  assert.match(page, /id="diagnosis"/);
  assert.match(journal, /Analyse non confirmée après 30 s/);
});
