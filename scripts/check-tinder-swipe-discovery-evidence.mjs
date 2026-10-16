import assert from "node:assert/strict";
import { classifySwipeControl, summarizeSwipeControls } from "../src/tinder-swipe-discovery-evidence.ts";

const like = ["button", "gamepad-button", "Bgc($c-ds-background-gamepad-sparks-like-default)"];
const pass = ["gamepad-button", "Bgc($c-ds-background-gamepad-sparks-nope-default)"];
const superLike = ["gamepad-button", "Bgc($c-ds-background-gamepad-sparks-super-like-default)"];
const rewind = ["gamepad-button", "Bgc($c-ds-background-gamepad-sparks-rewind-default)"];
const fact = (classes, disabled = false) => ({ classes, visible: true, disabled });

assert.equal(classifySwipeControl(like), "like");
assert.equal(classifySwipeControl(superLike), "super-like");
assert.equal(classifySwipeControl(["gamepad-button", "dislike"]), "unknown");
assert.equal(classifySwipeControl([...like, ...superLike]), "unknown");

const step07 = summarizeSwipeControls("/app/recs", [
  fact(like), fact(pass), fact(superLike), fact(superLike), fact(rewind, true)
], false);
const step08 = summarizeSwipeControls("/app/recs", [
  fact(like), fact(pass), fact(superLike), fact(superLike), fact(rewind)
], false);
assert.equal(step07.status, "observed");
assert.equal(step07.rewindEnabled, false);
assert.equal(step08.status, "observed");
assert.equal(step08.rewindEnabled, true);
assert.equal(step07.likeControls, 1);
assert.equal(step08.likeControls, 1);
assert.equal(step08.actionConfirmed, false);
assert.equal(summarizeSwipeControls("/app/explore", [fact(like), fact(pass), fact(superLike)], false).status, "blocked");
assert.equal(summarizeSwipeControls("/app/recs", [fact(like), fact(pass), fact(superLike)], true).status, "blocked");
assert.equal(summarizeSwipeControls("/app/recs", [fact(like), fact(like), fact(pass), fact(superLike)], false).status, "ambiguous");
assert.equal(summarizeSwipeControls("/app/recs", [fact(superLike), fact(pass)], false).status, "not-found");
assert.equal(summarizeSwipeControls("/app/recs", [fact(like), fact(pass), fact(superLike)], false).actionConfirmed, false);
console.log("Read-only Tinder Discovery controls evidence tests passed.");
