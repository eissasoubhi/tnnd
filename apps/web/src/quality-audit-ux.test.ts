import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
const panel = readFileSync(new URL("./quality-audit-panel.ts", import.meta.url), "utf8");
const app = readFileSync(new URL("./main.ts", import.meta.url), "utf8");
const api = readFileSync(new URL("../../api/src/main.ts", import.meta.url), "utf8");

test("authenticated audit loads only in the Analytics workspace", () => {
  assert.match(app, /import\("\.\/quality-audit-panel"\)/);
  assert.match(panel, /#analytics-panel/);
  assert.match(panel, /readSession\(\)/);
  assert.match(panel, /\/api\/v1\/quality-audit/);
  assert.match(api, /authenticatedUser\(request\)/);
});
test("audit is informational, with retry and account switch protection", () => {
  assert.match(panel, /no settings were changed/);
  assert.match(panel, /button\.disabled = true/);
  assert.match(panel, /readSession\(\)\?\.token !== session\.token/);
  assert.match(panel, /tnnd:auth-session-changed/);
  assert.match(panel, /Audit unavailable/);
});
test("suggestions are HTML escaped before rendering", () => {
  assert.match(panel, /safeAuditHtml\(f\.evidence\)/);
  assert.match(panel, /safeAuditHtml\(f\.recommendation\)/);
  assert.match(panel, /safeAuditHtml\(f\.suggestedSetting\.key\)/);
});
