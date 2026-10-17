import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_TINDER_IMPORT_SETTINGS, validateTinderImportSettings, shouldImportThread } from "../../../src/tinder-import-settings.js";

test("Tinder imports and automatic sync are disabled by default without AI-send rights",()=>{
  assert.equal(DEFAULT_TINDER_IMPORT_SETTINGS.autoSyncOpened,false);
  assert.equal(DEFAULT_TINDER_IMPORT_SETTINGS.autoCollectLoaded,false);
  assert.equal(DEFAULT_TINDER_IMPORT_SETTINGS.scope,"all");
  assert.equal(DEFAULT_TINDER_IMPORT_SETTINGS.includeMessages,true);
});
test("invalid or partial values cannot silently enable collection",()=>{
  assert.throws(()=>validateTinderImportSettings({}),/invalid_import_toggle/);
  assert.throws(()=>validateTinderImportSettings({...DEFAULT_TINDER_IMPORT_SETTINGS,autoSyncOpened:"yes"}),/invalid_import_toggle/);
  assert.throws(()=>validateTinderImportSettings({...DEFAULT_TINDER_IMPORT_SETTINGS,scope:"auto-send"}),/invalid_import_scope/);
  assert.throws(()=>validateTinderImportSettings({...DEFAULT_TINDER_IMPORT_SETTINGS,ageMin:40,ageMax:20}),/invalid_import_age_range/);
  assert.throws(()=>validateTinderImportSettings({...DEFAULT_TINDER_IMPORT_SETTINGS,foo:1}),/unknown_import_setting/);
});
test("filtered imports require verified age and actual visible messages when selected",()=>{
  const x={...DEFAULT_TINDER_IMPORT_SETTINGS,scope:"filtered" as const,ageMin:25,ageMax:35,requireMessages:true};
  assert.equal(shouldImportThread(x,{age:null,messageCount:3}).reason,"missing_age");
  assert.equal(shouldImportThread(x,{age:24,messageCount:3}).reason,"age_outside_range");
  assert.equal(shouldImportThread(x,{age:28,messageCount:0}).reason,"no_messages");
  assert.equal(shouldImportThread(x,{age:28,messageCount:3}).eligible,true);
  assert.equal(shouldImportThread({...x,scope:"all"},{age:null,messageCount:0}).eligible,true);
});
