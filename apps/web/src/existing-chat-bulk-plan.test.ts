import assert from "node:assert/strict";
import test from "node:test";
import { planExistingChatTakeover } from "./existing-chat-bulk-plan";
import type { ConversationManagementRecord } from "./conversation-management-client";
import type { ConversationListItem } from "./conversation-contract";

const management = (id: string, managementState: ConversationManagementRecord["managementState"]="unmanaged", blocked=false): ConversationManagementRecord => ({
  conversationId:id, externalThreadId:id, managementState, explicitlySelected:false,
  syncHealth:{state:"synced"}, updatedAt:"2026-10-13T12:00:00Z",
  ...(blocked ? {humanActionBlock:{blocked:true,pendingCount:1,highestSeverity:"urgent"}} : {})
});
const summary = (id:string, status:ConversationListItem["status"]="paused"): ConversationListItem => ({
  id, displayName:id, status, lastMessageAt:"2026-10-13T12:00:00Z", pendingHumanActions:0
});

test("explicit bulk mode only targets existing conversations with verified synced history", () => {
  const records=[management("eligible"),management("manual","manual"),management("blocked","unmanaged",true),management("archived","archived"),management("disabled"),management("unsynced"),management("ready","ai-managed")];
  records[5]!.syncHealth={state:"never-synced"};
  records[6]!.explicitlySelected=true;
  const list=[summary("eligible"),summary("manual"),summary("blocked"),summary("archived"),summary("disabled","disabled"),summary("unsynced"),summary("ready","active")];
  const plan=planExistingChatTakeover(records,list);
  assert.deepEqual(plan.eligible,["eligible"]);
  assert.deepEqual(plan.resume,["eligible"]);
  assert.deepEqual(plan.skipped,{manual:1,archived:1,blocked:1,unsynced:1,disabled:1});
});

test("never enroll conversations with no actual messages or pending human-action blockers", () => {
  const noHistory=summary("zero"); noHistory.lastMessageAt=null;
  const blocked=summary("action-required","action-required");
  const plan=planExistingChatTakeover([management("zero"),management("action-required")],[noHistory,blocked]);
  assert.deepEqual(plan.eligible,[]);
  assert.deepEqual(plan.resume,[]);
  assert.equal(plan.skipped.unsynced,1);
  assert.equal(plan.skipped.blocked,1);
});
