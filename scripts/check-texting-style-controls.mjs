import fs from "node:fs";

const controls = fs.readFileSync(new URL("../src/texting-options.ts", import.meta.url), "utf8");
const prompt = fs.readFileSync(new URL("../src/prompt.ts", import.meta.url), "utf8");
const types = fs.readFileSync(new URL("../src/types.ts", import.meta.url), "utf8");

const requiredControls = [
  ["formality", "textFormality"],
  ["capitalization", "textCapitalization"],
  ["punctuation", "textPunctuation"],
  ["abbreviations", "textAbbreviations"],
  ["slang", "textSlang"],
  ["fragmentedMessages", "textFragments"],
  ["perfectGrammar", "textPerfectGrammar"],
  ["questionFrequency", "textQuestions"],
  ["doubleTexting", "textDouble"]
];

for (const [field, elementId] of requiredControls) {
  if (!types.includes(`${field}:`) || !controls.includes(elementId) || !controls.includes(`${field}:`)) {
    throw new Error(`Structured texting control is not wired end-to-end: ${field}`);
  }
}

const requiredPromptSignals = [
  "formality=${style.formality}",
  "capitalization=${style.capitalization}",
  "punctuation=${style.punctuation}",
  "abbreviations=${style.abbreviations}",
  "slang=${style.slang}",
  "fragmented messages=${style.fragmentedMessages",
  "perfect grammar=${style.perfectGrammar",
  "question frequency=${style.questionFrequency}",
  "double texting=${style.doubleTexting}"
];

for (const signal of requiredPromptSignals) {
  if (!prompt.includes(signal)) throw new Error(`Texting style is not applied to generation: ${signal}`);
}

if (!prompt.includes("real texting, not polished assistant prose")) {
  throw new Error("Natural-texting guidance is missing from the generation prompt");
}

console.log("Structured texting style controls are wired to generation.");
