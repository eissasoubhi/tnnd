import assert from "node:assert/strict";
import test from "node:test";

test("web local fallback limits remain bounded", async () => {
  const actionSource = await import("node:fs/promises").then((fs) => fs.readFile(new URL("../apps/web/src/action-center.ts", import.meta.url), "utf8"));
  assert.match(actionSource, /maxLocalStorageBytes = 512 \* 1024/);
  assert.match(actionSource, /maxLocalHumanActions = 500/);
  assert.match(actionSource, /slice\(-maxLocalHumanActions\)/);

  const mainSource = await import("node:fs/promises").then((fs) => fs.readFile(new URL("../apps/web/src/main.ts", import.meta.url), "utf8"));
  assert.match(mainSource, /maxLocalProfileBytes = 512 \* 1024/);
  assert.match(mainSource, /localStorage\.removeItem\(storageKey\)/);
});
