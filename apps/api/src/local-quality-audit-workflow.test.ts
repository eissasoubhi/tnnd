import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
const workflow = readFileSync(new URL("../../../.github/workflows/local-quality-audit.yml", import.meta.url), "utf8");

test("local audit is opt-in and never triggered from pull requests", () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /schedule:/);
  assert.doesNotMatch(workflow, /^\s+pull_request(?:_target)?:/m);
  assert.match(workflow, /TNND_LOCAL_AUDIT_ENABLED == 'true'/);
});
test("local audit requires a dedicated runner and private read-only credentials", () => {
  assert.match(workflow, /self-hosted, linux, x64, tnnd-audit-local/);
  assert.match(workflow, /secrets\.TNND_AUDIT_DATABASE_URL/);
  assert.match(workflow, /secrets\.TNND_AUDIT_USER_ID/);
  assert.match(workflow, /permissions:\s*\n\s*contents: read/);
});
test("no logs or GitHub artifacts contain the aggregated user report", () => {
  assert.match(workflow, /\> "\$report_tmp"/);
  assert.doesNotMatch(workflow, /upload-artifact/);
  assert.match(workflow, /mv "\$report_tmp" "\$report_file"/);
});
