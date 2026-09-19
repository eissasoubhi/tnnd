import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const algorithm = "aes-256-gcm";
const ivBytes = 12;
const tagBytes = 16;
const formatVersion = "v1";

function encryptionKey(encodedKey = process.env.TNND_SECRET_ENCRYPTION_KEY): Buffer {
  if (!encodedKey) throw new Error("secret_encryption_key_missing");
  const key = Buffer.from(encodedKey, "base64");
  if (key.length !== 32) throw new Error("secret_encryption_key_invalid");
  return key;
}

/** Encrypts user-owned provider secrets for durable server-side storage. */
export function encryptSecret(plaintext: string, encodedKey?: string): string {
  if (!plaintext) throw new Error("secret_plaintext_empty");
  const iv = randomBytes(ivBytes);
  const cipher = createCipheriv(algorithm, encryptionKey(encodedKey), iv, { authTagLength: tagBytes });
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [formatVersion, iv.toString("base64url"), tag.toString("base64url"), ciphertext.toString("base64url")].join(".");
}

/** Decrypts an authenticated ciphertext previously returned by encryptSecret. */
export function decryptSecret(payload: string, encodedKey?: string): string {
  const [version, ivPart, tagPart, ciphertextPart, ...extra] = payload.split(".");
  if (version !== formatVersion || !ivPart || !tagPart || !ciphertextPart || extra.length) {
    throw new Error("secret_ciphertext_invalid");
  }

  try {
    const iv = Buffer.from(ivPart, "base64url");
    const tag = Buffer.from(tagPart, "base64url");
    const ciphertext = Buffer.from(ciphertextPart, "base64url");
    if (iv.length !== ivBytes || tag.length !== tagBytes || ciphertext.length === 0) throw new Error("invalid_shape");
    const decipher = createDecipheriv(algorithm, encryptionKey(encodedKey), iv, { authTagLength: tagBytes });
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch (error) {
    if (error instanceof Error && (error.message === "secret_encryption_key_missing" || error.message === "secret_encryption_key_invalid")) throw error;
    throw new Error("secret_ciphertext_invalid");
  }
}
