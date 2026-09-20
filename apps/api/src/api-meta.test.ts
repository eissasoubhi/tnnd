import assert from "node:assert/strict";
import test from "node:test";
import { analyticsCapability } from "./analytics-route.js";
import { apiCapabilities, apiMeta, apiVersion } from "./api-meta.js";

test("API metadata advertises versioned platform capabilities", () => {
  assert.equal(apiVersion, "v1");
  assert.equal(apiCapabilities.includes(analyticsCapability), true);
  assert.equal(apiCapabilities.includes("ai-provider-settings"), true);
  assert.equal(apiCapabilities.includes("ai-provider-connection-test"), true);
  assert.deepEqual(apiMeta(), { apiVersion: "v1", capabilities: [...apiCapabilities] });
});

test("API metadata capabilities stay unique", () => {
  assert.equal(new Set(apiCapabilities).size, apiCapabilities.length);
});
