import assert from "node:assert/strict";
import test from "node:test";
import { outgoingContactEvidence, outgoingEvidenceFromHistory, type ContactHistoryBubble } from "./outgoing-contact-evidence.js";
import { validateContactBackfillOptions } from "./outgoing-contact-backfill.js";
import { parseBackfillArguments } from "./outgoing-contact-backfill-command.js";

const msg = (direction: ContactHistoryBubble["direction"], text: string, id: string): ContactHistoryBubble =>
  ({ direction, text, externalMessageId: id });
test("labeled outgoing Instagram handle is high-confidence; casual mentions are not", () => {
  assert.deepEqual(outgoingContactEvidence(msg("outgoing","Instagram: @my_name_12","1"), undefined),
    { platform: "instagram", sourceExternalMessageId: "1" });
  assert.equal(outgoingContactEvidence(msg("outgoing","Instagram c'est cool","2"), undefined), null);
  assert.equal(outgoingContactEvidence(msg("outgoing","Paris","3"), msg("incoming","Ton insta ?","0")), null);
});
test("distinctive handle after immediately preceding incoming question is accepted, other conversations are not", () => {
  assert.deepEqual(outgoingContactEvidence(msg("outgoing","@hello_12","2"), msg("incoming","C'est quoi ton Instagram ?","1")),
    { platform: "instagram", sourceExternalMessageId: "2" });
  assert.equal(outgoingContactEvidence(msg("outgoing","@hello_12","2"), msg("outgoing","Ton Insta ?","1")), null);
  assert.equal(outgoingContactEvidence(msg("outgoing","hello","2"), msg("incoming","Ton Insta ?","1")), null);
});
test("WhatsApp is detected without duplicating number in metadata", () => {
  const result = outgoingContactEvidence(msg("outgoing","Mon WhatsApp: +33 6 12 34 56 78","4"), undefined);
  assert.deepEqual(result, { platform: "whatsapp", sourceExternalMessageId: "4" });
  assert.ok(!JSON.stringify(result).includes("612345678"));
});
test("history scan is deterministic and ignores already recorded IDs", () => {
  const history = [
    msg("incoming","Ton Insta ?","1"),
    msg("outgoing","@my_name_12","2"),
    msg("incoming","On passe sur WhatsApp ?","3"),
    msg("outgoing","Oui on peut","4"),
    msg("outgoing","WhatsApp: +212 612 345 678","5")
  ];
  assert.deepEqual(outgoingEvidenceFromHistory(history).map(x=>x.sourceExternalMessageId),["2","5"]);
  assert.deepEqual(outgoingEvidenceFromHistory(history,new Set(["2"])).map(x=>x.sourceExternalMessageId),["5"]);
});
test("backfill defaults to dry run and validates exact user UUID, bounded batch and cursor", () => {
  const userId="11111111-1111-4111-8111-111111111111";
  const args = parseBackfillArguments(["--user-id="+userId,"--max-conversations=20"]);
  const options=validateContactBackfillOptions(args);
  assert.equal(options.apply,false);
  assert.equal(options.maxConversations,20);
  assert.equal(validateContactBackfillOptions(parseBackfillArguments(["--user-id="+userId,"--apply"])).apply,true);
  assert.throws(()=>parseBackfillArguments(["--apply"]),/user_id_required/);
  assert.throws(()=>parseBackfillArguments(["--user-id="+userId,"--drop-database"]),/unknown_backfill_argument/);
  assert.throws(()=>validateContactBackfillOptions({userId,maxConversations:999}),/invalid_contact_backfill_options/);
  assert.throws(()=>validateContactBackfillOptions({userId:"not-an-id",apply:true}),/invalid_contact_backfill_options/);
});
