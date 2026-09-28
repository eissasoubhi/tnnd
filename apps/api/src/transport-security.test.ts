import assert from "node:assert/strict";
import test from "node:test";
import { isAllowedRequestTransport } from "./transport-security.js";

test("development requests are not forced through HTTPS", () => {
  assert.equal(
    isAllowedRequestTransport({ nodeEnv: "development", pathname: "/api/v1/profile" }),
    true
  );
});

test("production API requests require HTTPS", () => {
  assert.equal(
    isAllowedRequestTransport({ nodeEnv: "production", pathname: "/api/v1/profile" }),
    false
  );
  assert.equal(
    isAllowedRequestTransport({
      nodeEnv: "production",
      pathname: "/api/v1/profile",
      forwardedProto: "http"
    }),
    false
  );
});

test("production accepts TLS terminated locally or by a trusted proxy header", () => {
  assert.equal(
    isAllowedRequestTransport({
      nodeEnv: "production",
      pathname: "/api/v1/profile",
      encrypted: true
    }),
    true
  );
  assert.equal(
    isAllowedRequestTransport({
      nodeEnv: "production",
      pathname: "/api/v1/profile",
      forwardedProto: "https"
    }),
    true
  );
  assert.equal(
    isAllowedRequestTransport({
      nodeEnv: "production",
      pathname: "/api/v1/profile",
      forwardedProto: "https, http"
    }),
    true
  );
});

test("health probes stay available behind an internal HTTP hop", () => {
  assert.equal(
    isAllowedRequestTransport({ nodeEnv: "production", pathname: "/health" }),
    true
  );
});
