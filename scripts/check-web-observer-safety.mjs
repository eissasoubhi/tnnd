import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("conversation management badges pause their MutationObserver while mutating DOM", async () => {
  const source = await readFile(new URL("../apps/web/src/conversation-management-badges.ts", import.meta.url), "utf8");
  const renderStart = source.indexOf("function renderBadges(): void");
  const disconnect = source.indexOf("badgeObserver?.disconnect()", renderStart);
  const mutation = source.indexOf("row.querySelector(\"[data-management-inline]\")?.remove()", renderStart);
  const finallyBlock = source.indexOf("finally {", renderStart);
  const reconnect = source.indexOf("observeConversationDom();", finallyBlock);

  assert.ok(renderStart >= 0, "renderBadges must exist");
  assert.ok(disconnect > renderStart, "observer must disconnect inside renderBadges");
  assert.ok(mutation > disconnect, "observer must be disconnected before badge DOM mutations");
  assert.ok(finallyBlock > mutation, "renderBadges must reconnect in a finally block");
  assert.ok(reconnect > finallyBlock, "observer must reconnect after rendering");
});
