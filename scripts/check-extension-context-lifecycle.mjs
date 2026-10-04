import assert from "node:assert/strict";
import {
  isExtensionContextInvalidated,
  sendRuntimeMessageSafely
} from "../src/extension-context.ts";

assert.equal(isExtensionContextInvalidated(new Error("Extension context invalidated.")), true);
assert.equal(isExtensionContextInvalidated(new Error("network failed")), false);

let invalidations = 0;
const invalidated = await sendRuntimeMessageSafely(
  { type: "TEST" },
  async () => { throw new Error("Extension context invalidated."); },
  () => { invalidations += 1; }
);
assert.equal(invalidated, null);
assert.equal(invalidations, 1);

const success = await sendRuntimeMessageSafely(
  { type: "TEST" },
  async () => ({ ok: true }),
  () => { invalidations += 1; }
);
assert.deepEqual(success, { ok: true });
assert.equal(invalidations, 1);

await assert.rejects(
  sendRuntimeMessageSafely(
    { type: "TEST" },
    async () => { throw new Error("ordinary runtime failure"); },
    () => { invalidations += 1; }
  ),
  /ordinary runtime failure/
);
assert.equal(invalidations, 1);

console.log("Extension context invalidation lifecycle check passed.");
