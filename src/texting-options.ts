import type { TextingStyleProfile } from "./types";

const FALLBACK: TextingStyleProfile = {
  formality: "very-casual",
  capitalization: "mostly-lowercase",
  punctuation: "low",
  abbreviations: "medium",
  slang: "natural",
  fragmentedMessages: true,
  perfectGrammar: false,
  questionFrequency: "medium",
  doubleTexting: "sometimes"
};

export interface TextingStyleControls {
  read(): TextingStyleProfile;
  apply(value?: TextingStyleProfile): void;
}

export function mountTextingStyleControls(): TextingStyleControls {
  const section = document.createElement("section");
  section.innerHTML = `
    <h2>Texting identity</h2>
    <div class="grid three">
      <label>Formality<select id="textFormality"><option value="very-casual">Very casual</option><option value="casual">Casual</option><option value="neutral">Neutral</option></select></label>
      <label>Capitalization<select id="textCapitalization"><option value="mostly-lowercase">Mostly lowercase</option><option value="normal">Normal</option></select></label>
      <label>Punctuation<select id="textPunctuation"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label>
      <label>Abbreviations<select id="textAbbreviations"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label>
      <label>Slang<select id="textSlang"><option value="none">None</option><option value="natural">Natural</option><option value="high">High</option></select></label>
      <label>Question frequency<select id="textQuestions"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label>
      <label>Double texting<select id="textDouble"><option value="rarely">Rarely</option><option value="sometimes">Sometimes</option><option value="often">Often</option></select></label>
      <label class="check"><input id="textFragments" type="checkbox"> Allow message fragments</label>
      <label class="check"><input id="textPerfectGrammar" type="checkbox"> Prefer perfect grammar</label>
    </div>
    <p class="hint">Controls how human and informal generated messages feel. Low punctuation, natural abbreviations and imperfect grammar can be intentional.</p>
  `;

  const languageSection = Array.from(document.querySelectorAll("section")).find((node) => node.querySelector("#langFr"));
  languageSection?.before(section);

  const select = (id: string) => document.getElementById(id) as HTMLSelectElement;
  const checkbox = (id: string) => document.getElementById(id) as HTMLInputElement;
  const fields = {
    formality: select("textFormality"), capitalization: select("textCapitalization"), punctuation: select("textPunctuation"),
    abbreviations: select("textAbbreviations"), slang: select("textSlang"), questionFrequency: select("textQuestions"),
    doubleTexting: select("textDouble"), fragmentedMessages: checkbox("textFragments"), perfectGrammar: checkbox("textPerfectGrammar")
  };

  return {
    read: () => ({
      formality: fields.formality.value as TextingStyleProfile["formality"],
      capitalization: fields.capitalization.value as TextingStyleProfile["capitalization"],
      punctuation: fields.punctuation.value as TextingStyleProfile["punctuation"],
      abbreviations: fields.abbreviations.value as TextingStyleProfile["abbreviations"],
      slang: fields.slang.value as TextingStyleProfile["slang"],
      fragmentedMessages: fields.fragmentedMessages.checked,
      perfectGrammar: fields.perfectGrammar.checked,
      questionFrequency: fields.questionFrequency.value as TextingStyleProfile["questionFrequency"],
      doubleTexting: fields.doubleTexting.value as TextingStyleProfile["doubleTexting"]
    }),
    apply: (value) => {
      const current = { ...FALLBACK, ...(value ?? {}) };
      fields.formality.value = current.formality;
      fields.capitalization.value = current.capitalization;
      fields.punctuation.value = current.punctuation;
      fields.abbreviations.value = current.abbreviations;
      fields.slang.value = current.slang;
      fields.fragmentedMessages.checked = current.fragmentedMessages;
      fields.perfectGrammar.checked = current.perfectGrammar;
      fields.questionFrequency.value = current.questionFrequency;
      fields.doubleTexting.value = current.doubleTexting;
    }
  };
}
