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
  assert.match(main, /import\("\.\/conversation-panel"\)/);
  assert.match(main, /import\("\.\/conversation-management-panel"\)/);
  assert.match(main, /import\("\.\/conversation-takeover-onboarding"\)/);
  assert.match(main, /import\("\.\/dating-goal-details-panel"\)/);

  const index = await readFile(new URL("../apps/web/index.html", import.meta.url), "utf8");
  const moduleScripts = [...index.matchAll(/<script type="module" src="([^"]+)"><\/script>/g)].map((match) => match[1]);
  assert.deepEqual(moduleScripts, ["/src/main.ts"]);

  const auth = await readFile(new URL("../apps/web/src/auth-panel.ts", import.meta.url), "utf8");
  assert.doesNotMatch(auth, /import "\.\/texting-style-learning-panel"/);
});
