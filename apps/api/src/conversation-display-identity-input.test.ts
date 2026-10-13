import assert from "node:assert/strict";
import test from "node:test";
import { parseUserConversationIdentity } from "./conversation-display-identity-input.js";
test("stores a user-confirmed name/age without inventing Tinder profile data", () => {
 assert.deepEqual(parseUserConversationIdentity({label:"  Sara  ",age:27}),{label:"Sara",age:27});
 assert.deepEqual(parseUserConversationIdentity({label:"",age:""}),{label:null,age:null});
});
test("rejects invalid or underage profile ages and oversized labels", () => {
 for(const value of [{label:"Sara",age:15},{label:"Sara",age:121},{label:"x".repeat(81),age:null},{label:42,age:30}]) {
  assert.throws(()=>parseUserConversationIdentity(value),/invalid_conversation_identity/);
 }
});
