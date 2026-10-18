import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { findUpgradeLikeOffer } from "../src/tinder-swipe-upgrade-like-offer.ts";

const visibleRect = { width: 350, height: 90 };
const invisibleRect = { width: 0, height: 0 };
globalThis.getComputedStyle = el => ({
  display: el.mockStyle?.display ?? "block",
  visibility: el.mockStyle?.visibility ?? "visible",
  pointerEvents: el.mockStyle?.pointerEvents ?? "auto",
  opacity: String(el.mockStyle?.opacity ?? "1")
});
function element(text, opts={}) {
  return {
    textContent: text, hidden: opts.hidden ?? false, disabled: opts.disabled ?? false,
    isConnected: true,
    mockStyle: opts.style ?? {},
    closest: () => opts.ariaHidden ? {} : null,
    getBoundingClientRect: () => opts.invisible ? invisibleRect : visibleRect,
    getAttribute: name => name === "aria-disabled" ? (opts.ariaDisabled ? "true" : null) : null,
    click: () => { throw new Error("fixture click should never be called"); }
  };
}
function fixture({ title="Upgrade Your Like!", noThanks="No Thanks",
  sendSuperLike="Send Super Like", dialogCount=1, buttonsExtra=[], modalHidden=false }={}) {
  const heading = element(title);
  const dismiss = element(noThanks);
  const superLike = element(sendSuperLike);
  let clicks = 0, supers = 0;
  dismiss.click = () => { clicks += 1; };
  superLike.click = () => { supers += 1; };
  const dialog = {
    ...element("", {invisible:modalHidden}),
    querySelectorAll: selector => selector.startsWith("h1,")
      ? [heading] : [dismiss, superLike, ...buttonsExtra]
  };
  const doc = {
    querySelectorAll: () => Array.from({length:dialogCount},()=>dialog)
  };
  return { doc, heading, dismiss, superLike, getClicks:()=>clicks, getSupers:()=>supers };
}

const good = fixture();
const offer = findUpgradeLikeOffer(good.doc);
assert.equal(offer.status, "recognized");
assert.equal(offer.dismissButton, good.dismiss);
assert.equal(good.getClicks(), 0, "read-only discovery may not click");
assert.equal(good.getSupers(), 0, "Super Like must never be clicked");
assert.equal(fixture({title:"Someone is popular"}).doc &&
  findUpgradeLikeOffer(fixture({title:"Someone is popular"}).doc).status, "ambiguous");
assert.equal(findUpgradeLikeOffer(fixture({dialogCount:0}).doc).status, "none");
assert.equal(findUpgradeLikeOffer(fixture({dialogCount:2}).doc).status, "ambiguous");
assert.equal(findUpgradeLikeOffer(fixture({dialogCount:1,modalHidden:true}).doc).status, "none");
assert.equal(findUpgradeLikeOffer(fixture({noThanks:"Send Super Like"}).doc).status, "ambiguous");
assert.equal(findUpgradeLikeOffer(fixture({noThanks:"No, buy premium"}).doc).status, "ambiguous");
assert.equal(findUpgradeLikeOffer(fixture({sendSuperLike:"Get Premium"}).doc).status, "ambiguous");
assert.equal(findUpgradeLikeOffer(fixture({buttonsExtra:[element("No Thanks")]}).doc).status, "ambiguous");
for (const opts of [{disabled:true},{ariaDisabled:true},{hidden:true},{invisible:true},
                    {ariaHidden:true},{style:{display:"none"}},{style:{visibility:"hidden"}}]) {
  const caseWithHidden = fixture();
  Object.assign(caseWithHidden.dismiss, element("No Thanks", opts));
  assert.equal(findUpgradeLikeOffer(caseWithHidden.doc).status,"ambiguous",JSON.stringify(opts));
}
const runner = readFileSync(new URL("../src/tinder-swipe-live-action.ts", import.meta.url),"utf8");
assert.equal((runner.match(/\bbutton\.click\(\)/g)??[]).length,1,
  "reserved runner may initiate only one Like");
assert.equal((runner.match(/\brechecked\.dismissButton\.click\(\)/g)??[]).length,1,
  "up-sell dismissal has one click site, guarded by dismissedUpgradeOfferAt");
assert.ok(runner.includes('if (dismissedUpgradeOfferAt !== null)'),
  "must never click No Thanks twice even if modal lingers");
assert.ok(runner.includes("rechecked.dismissButton !== offer.dismissButton") &&
  runner.includes("userRecentlyActive()"),
  "must re-verify same button and respect manual takeover");
assert.ok(!runner.includes("superLike.click("), "never use Super Like");
assert.ok(runner.includes("classifySwipeCardTransition("),
  "post-dismissal evidence must be classified without server receipt assumption");
console.log("Strict Upgrade Your Like offer detection, safe No Thanks and no repeat Like passed.");
