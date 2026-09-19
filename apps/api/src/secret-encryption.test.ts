import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import { decryptSecret, encryptSecret } from "./secret-encryption.js";

const key = randomBytes(32).toString("base64");

test("secret encryption round-trips without exposing plaintext", () => {
  const plaintext = "provider-secret-value";
  const encrypted = encryptSecret(plaintext, key);
  assert.match(encrypted, /^v1\./);
  assert.equal(encrypted.includes(plaintext), false);
  assert.equal(decryptSecret(encrypted, key), plaintext);
});

test("secret encryption uses a fresh nonce", () => {
  assert.notEqual(encryptSecret("same-secret", key), encryptSecret("same-secret", key));
});

test("secret decryption rejects tampering", () => {
  const encrypted = encryptSecret("provider-secret-value", key);
  const parts = encrypted.split(".");
  parts[3] = `${parts[3]?.slice(0, -1)}A`;
  assert.throws(() => decryptSecret(parts.join("."), key), /secret_ciphertext_invalid/);
});

test("secret encryption requires an explicit 256-bit key", () => {
  assert.throws(() => encryptSecret("value", "not-a-valid-base64-key"), /secret_encryption_key_invalid/);
  assert.throws(() => encryptSecret("", key), /secret_plaintext_empty/);
});
