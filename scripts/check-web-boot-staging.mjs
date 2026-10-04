import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("signed-out boot loads only authentication eagerly", async () => {
  const main = await readFile(new URL("../apps/web/src/main.ts", import.meta.url), "utf8");
  assert.match(main, /import\("\.\/auth-panel"\)/);
  assert.match(main, /if \(optionalPanelsLoaded \|\| !readSession\(\)\) return/);
  assert.match(main, /import\("\.\/ai-provider-panel"\)/);
  assert.match(main, /import\("\.\/analytics-panel"\)/);
  assert.match(main, /import\("\.\/account-privacy-panel"\)/);
  assert.match(main, /import\("\.\/texting-style-learning-panel"\)/);

  const auth = await readFile(new URL("../apps/web/src/auth-panel.ts", import.meta.url), "utf8");
  assert.doesNotMatch(auth, /import "\.\/texting-style-learning-panel"/);
});
