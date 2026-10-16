import assert from "node:assert/strict";
import test from "node:test";
import { detectSocialContact } from "./social-contact-detector.js";

test("contact detector can read own outgoing handle after the match asks, without deriving it from name", () => {
  const preceding = [{ direction: "incoming" as const, text: "Tu as Instagram ?" }];
  assert.deepEqual(detectSocialContact("@my_public_handle", preceding), { platform: "instagram", value: "my_public_handle" });
  assert.equal(detectSocialContact("Paris", preceding), null);
  assert.equal(detectSocialContact("OK", preceding), null);
});
test("explicit WhatsApp number works in incoming and outgoing messages", () => {
  assert.deepEqual(detectSocialContact("Mon WhatsApp: +33 6 12 34 56 78", []),
    { platform: "whatsapp", value: "+33612345678" });
  assert.deepEqual(detectSocialContact("+212 612 345 678", [{ direction: "incoming", text: "Ton WhatsApp ?" }]),
    { platform: "whatsapp", value: "+212612345678" });
});
test("don't mistake a generic mention of WhatsApp or a name for a shared contact", () => {
  assert.equal(detectSocialContact("On peut discuter sur WhatsApp ?", []), null);
  assert.equal(detectSocialContact("Casablanca", [{ direction: "incoming", text: "Ton insta ?" }]), null);
});
