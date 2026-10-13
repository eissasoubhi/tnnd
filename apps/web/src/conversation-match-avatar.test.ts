import assert from "node:assert/strict";
import test from "node:test";
import { normalizeConversationListItem, safeMatchPhotoUrl } from "./conversation-contract";

const photoUrl = "https://images-ssl.gotinder.com/photo.jpg";
test("only Tinder-hosted HTTPS avatars reach the conversation UI", () => {
  assert.equal(safeMatchPhotoUrl(photoUrl), photoUrl);
  assert.equal(safeMatchPhotoUrl("https://phishing.example/photo.png"), null);
  assert.equal(safeMatchPhotoUrl("javascript:alert(1)"), null);
  const conversation = normalizeConversationListItem({
    id: "thread-123", displayName: "Srim", matchAge: 30, matchPhotoUrl: photoUrl,
    status: "paused"
  });
  assert.equal(conversation.matchAge, 30);
  assert.equal(conversation.matchPhotoUrl, photoUrl);
});
