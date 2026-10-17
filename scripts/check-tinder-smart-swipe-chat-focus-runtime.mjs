import assert from "node:assert/strict";
import { isObservedFocusedChat } from "../src/tinder-chat-focus-eligibility.ts";
const now = Date.parse("2026-10-17T13:00:00Z");
const state = {
  enabled:true,mode:"watcher",activeConversationRef:"thread-1",
  activeConversationUntil:new Date(now+120000).toISOString(),phase:"sending"
};
assert.equal(isObservedFocusedChat(state,"thread-1",now),true);
assert.equal(isObservedFocusedChat({...state,phase:"generating"},"thread-1",now),true);
assert.equal(isObservedFocusedChat({...state,phase:"waiting"},"thread-1",now),false);
assert.equal(isObservedFocusedChat({...state,activeConversationUntil:new Date(now-1).toISOString()},"thread-1",now),false);
assert.equal(isObservedFocusedChat({...state,mode:"runner"},"thread-1",now),false);
assert.equal(isObservedFocusedChat(state,"thread-2",now),false);
console.log("Smart Swipe watcher active time eligibility checks passed.");
