import assert from "node:assert/strict";
import { activeTinderDiscoveryCardMarker } from "../src/tinder-swipe-card-marker.ts";
function card(marker, active=true) {
  return {
    getBoundingClientRect() { return {width:320,height:520}; },
    querySelector(selector) {
      assert.equal(selector,".keen-slider__slide");
      return {querySelector(sel) {
        assert.equal(sel,'[style*="url("]');
        return {getAttribute(attr) {
          assert.equal(attr,"style");
          return marker;
        }};
      }};
    }
  };
}
function page(cards) {
  return {querySelectorAll(selector) {
    assert.equal(selector,'.recsCardboard__cards > [data-keyboard-gamepad][aria-hidden="false"]:not([inert])');
    return cards;
  }};
}
const before=activeTinderDiscoveryCardMarker(page([card("background:url(private-photo-a)")]));
const after=activeTinderDiscoveryCardMarker(page([card("background:url(private-photo-b)")]));
assert.ok(before && after && before!==after);
assert.equal(activeTinderDiscoveryCardMarker(page([])),null);
assert.equal(activeTinderDiscoveryCardMarker(page([card("background:url(a)"),card("background:url(b)")])),null);
assert.equal(activeTinderDiscoveryCardMarker(page([card("width:50px")])),null);
assert.equal(activeTinderDiscoveryCardMarker(page([{
  ...card("background:url(a)"),getBoundingClientRect(){return {width:0,height:0}}
}])),null);
console.log("Active Discovery card marker ignores sidebar match avatars and ambiguous cards.");
