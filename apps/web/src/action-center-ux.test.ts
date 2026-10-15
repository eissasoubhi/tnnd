import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
const root = dirname(fileURLToPath(import.meta.url));
const read = (file: string) => readFileSync(resolve(root,file),"utf8");
const center = read("action-center.ts");
const main = read("main.ts");

test("Action Center severity filters retain the authenticated server result", () => {
  assert.match(center,/renderedActionItems\.set\(container, items\)/);
  assert.match(center,/renderActionCenter\(container, renderedActionItems\.get\(container\) \?\? \[\]\)/);
  assert.doesNotMatch(center,/container\.dataset\.actionSeverityFilter = filter;\s*renderActionCenter\(container\)/);
});
test("sign-out clears action editor drafts and prevents unscoped local fallback from appearing", () => {
  assert.match(center,/export function resetActionCenterSession/);
  assert.match(center,/manualAnswerDrafts\.clear\(\)/);
  assert.match(center,/if \(readSession\(\)\) throw new Error\("human_actions_unavailable"\)/);
  assert.match(main,/resetActionCenterSession\(\)/);
  assert.match(main,/Sign in to review actions/);
});
test("unavailable or stale action data is not presented as verified zero", () => {
  assert.match(main,/isLatestSessionResponse\(requestId, actionCenterRequestSequence, session\.token, readSession\(\)\?\.token\)/);
  assert.match(main,/Action Center unavailable/);
  assert.match(main,/id="action-center-retry"/);
  assert.match(main,/humanActionMetric\.textContent = "—"/);
  assert.match(center,/No pending actions in the last verified check/);
});
