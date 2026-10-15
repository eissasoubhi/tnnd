import assert from "node:assert/strict";
import test from "node:test";
import { parseVisibleMatchHeading, parseVerifiedChatName, safeTinderPhotoUrl } from "../src/tinder-chat-identity.ts";
import { buildReadOnlyProfileSource } from "../src/tinder-match-profile-capture.ts";

test("visible Tinder header shows first name and age, never a thread id", () => {
  assert.deepEqual(parseVisibleMatchHeading("Srim 30"), { firstName: "Srim", age: 30 });
  assert.deepEqual(parseVisibleMatchHeading("Zahera"), { firstName: "Zahera" });
  assert.deepEqual(parseVisibleMatchHeading("Half moon"), { firstName: "Half moon" });
  assert.deepEqual(parseVisibleMatchHeading("Srim 14"), { firstName: "Srim" });
  assert.deepEqual(parseVisibleMatchHeading(""), {});
  assert.deepEqual(parseVisibleMatchHeading("Conversation 8b2e8347\nText"), {});
});

test("a profile avatar must be a bounded Tinder HTTPS URL", () => {
  const photo = "https://images-ssl.gotinder.com/abc.jpg";
  assert.equal(safeTinderPhotoUrl(photo), photo);
  assert.equal(safeTinderPhotoUrl("javascript:alert(1)"), undefined);
  assert.equal(safeTinderPhotoUrl("https://gotinder.com.evil.test/photo.png"), undefined);
  assert.equal(safeTinderPhotoUrl("http://images-ssl.gotinder.com/abc.jpg"), undefined);
  assert.equal(safeTinderPhotoUrl("data:image/png;base64,a"), undefined);
  assert.equal(safeTinderPhotoUrl("https://someone:secret@images-ssl.gotinder.com/x"), undefined);
  const observed = buildReadOnlyProfileSource({ route: "/app/messages/thread-1", firstName: "Srim", age: 30, photoUrl: photo });
  assert.deepEqual(observed.visibleFields, {
    firstName: "Srim", age: 30, photoUrl: photo,
    bio: undefined, job: undefined, education: undefined, location: undefined,
    interests: undefined, relationshipGoal: undefined
  });
});

test("live chat headings are accepted only as names, never generic Tinder UI labels", () => {
  assert.deepEqual(parseVerifiedChatName("Zahera 26"), {firstName:"Zahera",age:26});
  assert.deepEqual(parseVerifiedChatName("Nouhaila"), {firstName:"Nouhaila"});
  assert.deepEqual(parseVerifiedChatName("Messages"),{});
  assert.deepEqual(parseVerifiedChatName("Conversation"),{});
  assert.deepEqual(parseVerifiedChatName("Profile"),{});
  assert.deepEqual(parseVerifiedChatName(""),{});
});
