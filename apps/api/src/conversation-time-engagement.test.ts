import assert from "node:assert/strict";
import test from "node:test";
import { frenchMovableHoliday, temporalConversationGuidance } from "../../../src/conversation-time-context.js";
import { engagementConversationGuidance } from "../../../src/conversation-engagement-guidance.js";

test("France and Casablanca reference clocks respect local IANA timezone and DST", () => {
  const instant = new Date("2026-07-14T20:30:00.000Z");
  const context = temporalConversationGuidance({ residenceCity: "Paris", currentCity: "Casa" }, "Rabat", "2026-07-14T18:30:00.000Z", instant);
  assert.match(context, /Europe\/Paris\): Tuesday 2026-07-14 22:30, night/);
  assert.match(context, /Africa\/Casablanca\): Tuesday 2026-07-14 21:30, evening/);
  assert.match(context, /Fête nationale/);
  assert.match(context, /2 h ago/);
  assert.match(context, /Match location from visible profile only/);
});

test("missing or ambiguous match location never invents the match's hour", () => {
  const instant = new Date("2026-10-16T20:00:00.000Z");
  const context = temporalConversationGuidance({ currentCity: "Unknown town" }, "Paris, Texas, USA", undefined, instant);
  assert.match(context, /Match timezone: unknown/);
  assert.match(context, /User current local timezone: not verified/);
  assert.doesNotMatch(context, /Match location from visible profile only/);
});

test("Morocco holidays use its local calendar date, not Paris time", () => {
  const context = temporalConversationGuidance(undefined, "Casablanca", null, new Date("2026-11-18T00:30:00.000Z"));
  assert.match(context, /2026-11-18/);
  assert.match(context, /Fête de l'Indépendance/);
  assert.match(context, /NOT a complete public-holiday calendar/);
});

test("three short answers prompt one gentle change of angle, not a pursuit", () => {
  const text = engagementConversationGuidance([
    { direction: "outgoing", text: "Tu aimes voyager ?" },
    { direction: "incoming", text: "Oui" },
    { direction: "outgoing", text: "Tu préfères quoi ?" },
    { direction: "incoming", text: "Bof" },
    { direction: "outgoing", text: "Tu fais quoi aujourd'hui ?" },
    { direction: "incoming", text: "Rien" }
  ]);
  assert.match(text, /low-pressure fresh angle/);
  assert.match(text, /NOT proof of disinterest/);
});

test("explicit questions and boundaries suppress weak-engagement prompts", () => {
  const base = [
    { direction: "incoming" as const, text: "Oui" },
    { direction: "incoming" as const, text: "Ok" }
  ];
  assert.equal(engagementConversationGuidance([...base, { direction: "incoming", text: "Toi ?" }]), "");
  assert.equal(engagementConversationGuidance([...base, { direction: "incoming", text: "Non merci" }]), "");
  assert.equal(engagementConversationGuidance([...base, { direction: "outgoing", text: "hello" }]), "");
});


test("France movable public holidays match government 2026 and 2027 dates", () => {
  assert.equal(frenchMovableHoliday("2026-04-06"), "Lundi de Pâques");
  assert.equal(frenchMovableHoliday("2026-05-14"), "Ascension");
  assert.equal(frenchMovableHoliday("2026-05-25"), "Lundi de Pentecôte");
  assert.equal(frenchMovableHoliday("2027-03-29"), "Lundi de Pâques");
  assert.equal(frenchMovableHoliday("2027-05-06"), "Ascension");
  assert.equal(frenchMovableHoliday("2027-05-17"), "Lundi de Pentecôte");
  assert.equal(frenchMovableHoliday("2026-04-07"), null);
  assert.equal(frenchMovableHoliday("1899-04-03"), null);
});

test("France local day computes spring public holidays without applying them to Morocco", () => {
  const instant = new Date("2026-05-13T22:30:00Z");
  const text = temporalConversationGuidance({ currentCity: "Casablanca" }, "Paris", undefined, instant);
  assert.match(text, /Europe\/Paris\): Thursday 2026-05-14 00:30/);
  assert.match(text, /verified statutory holiday: Ascension/);
  const maLine = text.split("\n").find(line => line.startsWith("Morocco (Casablanca reference)"));
  assert.ok(maLine && !maLine.includes("Ascension"));
  assert.match(text, /Islamic lunar festivals/);
});
