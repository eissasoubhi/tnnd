import assert from "node:assert/strict";
import { isObservedUnreadHint } from "../src/tinder-unread-queue.ts";

const observedUnreadClasses = [
  "messageListItem messageListItem--isNew",
  "messageListItem--isNew"
];

for (const className of observedUnreadClasses) {
  assert.equal(
    isObservedUnreadHint(className),
    true,
    `observed Tinder unread class should be recognized: ${className}`
  );
}

for (const className of ["messageListItem", "messageListItem--isRead", "isNew"]) {
  assert.equal(
    isObservedUnreadHint(className),
    false,
    `unobserved class must not be treated as the observed unread signal: ${className}`
  );
}

console.log("Observed Tinder unread regression fixture passed.");
