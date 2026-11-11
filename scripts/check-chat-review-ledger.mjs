import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  normalizeReviewedTurns, visibleContextFingerprint, wasReviewedWithoutSend
} from "../src/tinder-chat-review-ledger.ts";

test("no-send review is cached only while the visible conversational context is unchanged", () => {
  const original = "Them: Salut\nMe: Ça va ?\nThem: Oui";
  const review = { contextHash: visibleContextFingerprint(original),
    outcome: "acknowledgement", at: Date.now() };
  assert.equal(wasReviewedWithoutSend(review, original), true);
  assert.equal(wasReviewedWithoutSend(review, "Me: Ancien contexte\n"+original), false);
  assert.equal(wasReviewedWithoutSend(review, original+"\nThem: Nouvelle question"), false);
  assert.equal(wasReviewedWithoutSend(undefined, original), false);
});

test("review ledger stores no transcript, ignores invalid or forged data, and stays bounded", () => {
  const now = Date.now();
  const valid = {contextHash: "a1b2c3", outcome: "rest", at: now};
  const normalized = normalizeReviewedTurns({
    safe: valid, invalidOutcome: { ...valid, outcome: "send" },
    invalidHash: { ...valid, contextHash: "Message privé" },
    invalidDate: { ...valid, at: "yesterday" }
  });
  assert.deepEqual(normalized, { safe: valid });
  const many = Object.fromEntries(Array.from({length: 5020}, (_,i) =>
    ["review"+i, {...valid, contextHash:"h"+i}]));
  const bounded = normalizeReviewedTurns(many);
  assert.equal(Object.keys(bounded).length, 5000);
  assert.equal(Object.hasOwn(bounded,"review0"), false);
  assert.equal(Object.hasOwn(bounded,"review5019"), true);
});

test("scanner gives a definitive outcome to legacy holds and does not claim sends for reviews", async () => {
  const [content,background] = await Promise.all([
    "src/content.ts", "src/background.ts"
  ].map(path => readFile(new URL("../"+path,import.meta.url),"utf8")));
  assert.match(content,/reportExistingRunner\("skipped",\s*"Message déjà marqué comme traité/);
  assert.match(content,/wasReviewedWithoutSend\(previousReview, snapshot\.context\)/);
  assert.match(content,/recordReviewWithoutSend\(state, snapshot\.latestIncomingKey/);
  assert.match(content,/recordReviewWithoutSend\(processed, finalSnapshot\.latestIncomingKey/);
  assert.match(content,/freshState\.processed\[finalSnapshot\.latestIncomingKey\] = Date\.now\(\)/);
  assert.match(background,/reviewed: normalizeReviewedTurns\(candidate\.reviewed\)/);
  assert.match(background,/state\.reviewed = normalizeReviewedTurns\(state\.reviewed\)/);
});
