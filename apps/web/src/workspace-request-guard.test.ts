import assert from "node:assert/strict";
import test from "node:test";
import { isLatestSessionResponse } from "./workspace-request-guard";

test("only the latest response for the active account can update the workspace", () => {
  assert.equal(isLatestSessionResponse(3,3,"A","A"),true);
  assert.equal(isLatestSessionResponse(2,3,"A","A"),false);
  assert.equal(isLatestSessionResponse(3,3,"A","B"),false);
  assert.equal(isLatestSessionResponse(3,3,"A",null),false);
  assert.equal(isLatestSessionResponse(3,3,"",""),false);
});
