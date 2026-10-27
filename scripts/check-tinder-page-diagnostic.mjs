import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { unzipSync, strFromU8 } from "fflate";
import {
  buildTinderPageDiagnosticArchive, screenshotDataUrlBytes
} from "../src/tinder-page-diagnostic-export.ts";

const mock = {
  generatedAt: "2026-10-27T16:00:00Z",
  page: { url: "https://tinder.com/app/messages/[thread]", viewport: { width: 1280, height: 800 }, document: { width: 1280, height: 6500 } },
  selectors: { view: "conversation", viewSignals: ["message-composer"] },
  resources: [{ name: "https://tinder.com/main.css", duration: 30 }],
  config: { automation: { enabled: false } },
  domHtml: '<!doctype html><html><body><div class="message-list">[text]</div></body></html>',
  domTruncated: false
};
test("one-click archive contains inspectable structural files without a screenshot by default", () => {
  const report = buildTinderPageDiagnosticArchive(mock, "0.2.35", null, new Date("2026-10-27T16:00:00Z"));
  assert.equal(report.filename, "tnnd-tinder-page-conversation-2026-10-27T16-00-00-000Z.zip");
  const files = unzipSync(report.zip);
  const names = Object.keys(files).sort();
  assert.deepEqual(names, ["config-summary.json","dom-redacted.html","metadata.json","page.json","resources.json","selectors.json"]);
  assert.equal(strFromU8(files["dom-redacted.html"]), mock.domHtml);
  const meta = JSON.parse(strFromU8(files["metadata.json"]));
  assert.equal(meta.screenshotIncluded, false);
  assert.match(meta.coverage, /mounted document/);
  assert.equal(meta.domTruncated, false);
});
test("opt-in screenshot is included only when explicitly provided", () => {
  const png = screenshotDataUrlBytes("data:image/png;base64,AQIDBA==");
  const report = buildTinderPageDiagnosticArchive(mock,"0.2.35",png);
  assert.deepEqual([...unzipSync(report.zip)["screenshot-visible.png"]], [1,2,3,4]);
  assert.throws(() => screenshotDataUrlBytes("data:text/plain;base64,Zm9v"), /Capture PNG invalide/);
});
test("untrusted view is not used as a filename component", () => {
  const report = buildTinderPageDiagnosticArchive({
    ...mock, selectors: { view: "../sensitive" }, domTruncated: true
  },"0.2.35");
  assert.match(report.filename, /page-unknown-/);
  assert.equal(JSON.parse(strFromU8(unzipSync(report.zip)["metadata.json"])).domTruncated,true);
});
test("launcher export is independent from automation and gated to Tinder", async () => {
  const [launcher, html, content] = await Promise.all([
    "src/launcher.ts","public/launcher.html","src/content.ts"
  ].map(p => readFile(new URL("../"+p,import.meta.url),"utf8")));
  assert.match(html, /id="exportTinderDiagnostic"/);
  assert.match(html, /aria-label="Exporter le diagnostic de la page Tinder"/);
  assert.match(launcher, /chrome\.tabs\.query\(\{ active: true, currentWindow: true \}\)/);
  assert.match(launcher, /TNND_GET_DIAGNOSTICS/);
  assert.match(launcher, /window\.confirm\(/);
  assert.match(launcher, /chrome\.tabs\.captureVisibleTab/);
  assert.doesNotMatch(launcher.slice(launcher.indexOf("async function exportActiveTinderPage")), /TNND_UNIFIED_START|TNND_UNIFIED_SELECT_MODE|TNND_UNIFIED_STOP/);
  assert.match(content, /const maxLength = 6_000_000/);
  assert.match(content, /name === "srcset"/);
  assert.match(content, /\[redacted-media-url\]/);
  assert.match(content, /\[thread\]/);
});
