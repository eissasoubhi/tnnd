import assert from "node:assert/strict";
import test from "node:test";
import {
  conversationPragmaticsGuidance as guide,
  removeCannedFameuxOpening as clean
} from "../../../src/conversation-pragmatics.js";

const pair = (text: string) => [{ direction: "incoming" as const, text }];
const mixed = (...messages: Array<["incoming" | "outgoing", string]>) =>
  messages.map(([direction, text]) => ({ direction, text }));

test("an interview complaint stops questions, including disguised requests", () => {
  const advice = guide(mixed(
    ["outgoing", "tu étudies ?"],
    ["incoming", "oui"],
    ["outgoing", "tu travailles ?"],
    ["incoming", "parfois"],
    ["outgoing", "tu habites où ?"],
    ["incoming", "Hsit rasi b interview"]
  ));
  assert.match(advice, /explicitly feels interviewed/);
  assert.match(advice, /stop asking questions for the next turn/);
  assert.match(advice, /raconte un truc random sur toi/);
  assert.match(advice, /Several recent outgoing messages were questions/);
});

test("defensive feedback takes priority over teasing or another follow up", () => {
  const advice = guide(mixed(
    ["outgoing", "La fameuse histoire..."],
    ["incoming", "Pourquoi tu dis ça comme si j'inventais une excuse ?"]
  ));
  assert.match(advice, /feels judged or disbelieved/);
  assert.match(advice, /Own the clumsy implication/);
  assert.match(advice, /do not use either expression again/);
});

test("a disclosure about a friend getting married deserves empathy even with a laugh", () => {
  const advice = guide(pair("Depuis que ma meilleure amie s'est mariée je sors beaucoup moins hh"));
  assert.match(advice, /acknowledge their experience with warmth/);
  assert.match(advice, /not consent to a joke at their expense/);
  assert.match(advice, /a short empathetic statement alone is fine/);
});

test("explicit Latin-script Darija request overrides automatic language weights", () => {
  const auto = guide(pair("Dwi b arbia"), "", true);
  assert.match(auto, /explicitly asked to speak Arabic/);
  assert.match(auto, /natural Moroccan Darija in their script/);
  const fixed = guide(pair("Dwi b arbia"), "", false);
  assert.match(fixed, /manually locked language settings/);
  assert.doesNotMatch(fixed, /switch to natural Moroccan Darija/);
  assert.doesNotMatch(guide(pair("Je parle arabe chez moi")), /explicitly asked to speak Arabic/);
});

test("avoid the famous canned prefix without modifying the substantive reply", () => {
  assert.equal(clean("Ah le fameux resto..."), "Ah le resto...");
  assert.equal(clean("La fameuse histoire..."), "L\u0027histoire...");
  assert.equal(clean("Tu sais, le fameux resto"), "Tu sais, le fameux resto");
  assert.equal(clean("Très bon choix, j'aime bien ce coin."), "Très bon choix, j'aime bien ce coin.");
});

test("no sensitive inference from ordinary humor or older incoming messages", () => {
  const advice = guide(mixed(
    ["incoming", "j'ai l'impression de passer un entretien"],
    ["outgoing", "oui pardon"],
    ["incoming", "je cuisine souvent"]
  ));
  assert.doesNotMatch(advice, /explicitly feels interviewed/);
  assert.doesNotMatch(guide(pair("j'adore les rooftops")), /feels judged or disbelieved/);
});


test("two consecutive incoming bubbles are read as one turn for empathy", () => {
  const advice = guide(mixed(
    ["outgoing", "Tu sors en ville souvent ?"],
    ["incoming", "Depuis que mon amie s'est mariée, je sors beaucoup moins hh"],
    ["incoming", "Sinon les deux endroits que j'aime sont des petits cafés"]
  ));
  assert.match(advice, /acknowledge their experience with warmth/);
  assert.match(advice, /not consent to a joke at their expense/);
});

test("an older personal disclosure must not dominate after a new outgoing turn", () => {
  const advice = guide(mixed(
    ["incoming", "Depuis que mon amie s'est mariée, je sors moins"],
    ["outgoing", "Je comprends, c'est un changement"],
    ["incoming", "J'aime aussi la randonnée"]
  ));
  assert.doesNotMatch(advice, /acknowledge their experience with warmth/);
});
