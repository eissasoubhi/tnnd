import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
const base = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(base,"first-run-guide.ts"),"utf8");
test("first-run tutorial provides one meaningful action per step without silent mutations", () => {
  assert.equal((source.match(/expected:/g) ?? []).length, 5);
  assert.match(source, /Import visible chat \(read-only\)/);
  assert.match(source, /No message is sent to Tinder/);
  assert.match(source, /localStorage\.setItem\(key, "yes"\)/);
  assert.match(source, /Finish tutorial/);
  assert.doesNotMatch(source, /fetch\(/);
});
