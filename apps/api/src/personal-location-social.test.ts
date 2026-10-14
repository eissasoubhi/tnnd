import assert from "node:assert/strict";
import test from "node:test";
import { missingPersonalLocationDetail, personalLocationAnswerPolicy } from "./personal-location-policy.js";
import { detectSocialContact } from "./social-contact-detector.js";

test("do not confuse birthplace, residence, present city, and Tinder target city",()=>{
 const identity={originCity:"Casablanca",residenceCity:"Paris",currentCity:"Rabat"};
 const prompt=personalLocationAnswerPolicy(identity);
 assert.match(prompt,/Casablanca/);
 assert.match(prompt,/Paris/);
 assert.match(prompt,/Rabat/);
 assert.match(prompt,/Never swap these meanings/);
 assert.equal(missingPersonalLocationDetail("tu es où en ce moment ?",identity),null);
 assert.equal(missingPersonalLocationDetail("tu es où en ce moment ?",{originCity:"Casablanca",residenceCity:"Paris"}),"currentCity");
});
test("unknown specific Casa neighborhood must block, not invent a location",()=>{
 assert.equal(missingPersonalLocationDetail("Tu habites où à casa ?",{originCity:"Casablanca",residenceCity:"Paris"}),"originNeighborhood");
 assert.equal(missingPersonalLocationDetail("T'es dans quel quartier à casa ?",{originCity:"Casablanca"}),"originNeighborhood");
 assert.equal(missingPersonalLocationDetail("T'es dans quel quartier à casa ?",{originNeighborhood:"Sidi Maarouf"}),null);
 assert.equal(missingPersonalLocationDetail("Tu es de Casa ?",{originCity:"Casablanca"}),null);
 assert.equal(missingPersonalLocationDetail("Tu vis dans quelle ville ?",{}),"residenceCity");
});
test("recognizes isolated Instagram pseudo following another bubble without a false contact",()=>{
 const before=[{direction:"incoming" as const,text:"Ta Instagram ?"}];
 assert.deepEqual(detectSocialContact("Lolitta-ed",before),{platform:"instagram",value:"Lolitta-ed"});
 assert.equal(detectSocialContact("Oui casa",before),null);
 assert.equal(detectSocialContact("Lolitta-ed",[]),null,"isolated handle without a social request is ambiguous");
 assert.deepEqual(detectSocialContact("mon insta: lolitta_ed",[]),{platform:"instagram",value:"lolitta_ed"});
 assert.equal(detectSocialContact("oui casa et toi",before),null);
 assert.equal(detectSocialContact("https://example.com",before),null);
});
test("no social handoff inferred from ordinary short answers",()=>{
 assert.equal(detectSocialContact("Casablanca",[{direction:"outgoing",text:"tu es d'où ?"}]),null);
 assert.equal(detectSocialContact("Oui",[{direction:"outgoing",text:"Tu as insta ?"}]),null);
 assert.deepEqual(detectSocialContact("+33612345678",[{direction:"outgoing",text:"Ton numéro de téléphone ?"}]),{platform:"phone",value:"+33612345678"});
});
