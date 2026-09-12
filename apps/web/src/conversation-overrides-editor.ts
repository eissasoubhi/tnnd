import {
  buildConversationOverridesPayload,
  overrideDatingGoals,
  overrideDisclosureStrategies,
  overrideEmojiLevels,
  overrideMessageLengths,
  overrideStages,
  overrideTones,
  type ConversationOverrideDraft,
  type ConversationOverridesPayload
} from "./conversation-overrides-model";

export interface ConversationOverridesEditorCallbacks {
  onSave: (overrides: ConversationOverridesPayload) => Promise<void> | void;
  onClear?: () => Promise<void> | void;
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function optionList(values: readonly string[], selected?: string): string {
  return ["", ...values].map((value) => {
    const label = value || "Use global default";
    return `<option value="${escapeHtml(value)}"${selected === value ? " selected" : ""}>${escapeHtml(label)}</option>`;
  }).join("");
}

function initialDraft(overrides: ConversationOverridesPayload): ConversationOverrideDraft {
  return {
    datingGoal: overrides.datingGoal,
    datingGoalDetails: overrides.datingGoalDetails,
    disclosureStrategy: overrides.disclosureStrategy,
    tone: overrides.tone,
    directness: overrides.directness?.toString(),
    flirtLevel: overrides.flirtLevel?.toString(),
    humorLevel: overrides.humorLevel?.toString(),
    emojiLevel: overrides.emojiLevel,
    messageLength: overrides.messageLength,
    languageFr: overrides.languages?.fr?.toString(),
    languageDarija: overrides.languages?.darija?.toString(),
    languageEn: overrides.languages?.en?.toString(),
    stage: overrides.stage,
    specificGoal: overrides.specificGoal,
    persistentInstructions: overrides.persistentInstructions,
    preferredWords: overrides.preferredWords,
    avoidedWords: overrides.avoidedWords,
    automationEnabled: overrides.automationEnabled
  };
}

function inputValue(form: HTMLFormElement, name: string): string | undefined {
  const field = form.elements.namedItem(name);
  return field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement || field instanceof HTMLSelectElement
    ? field.value
    : undefined;
}

function readDraft(form: HTMLFormElement): ConversationOverrideDraft {
  const automation = form.elements.namedItem("automationEnabled");
  const automationEnabled = automation instanceof HTMLSelectElement
    ? automation.value === "" ? undefined : automation.value === "true"
    : undefined;
  return {
    datingGoal: inputValue(form, "datingGoal"),
    datingGoalDetails: inputValue(form, "datingGoalDetails"),
    disclosureStrategy: inputValue(form, "disclosureStrategy"),
    tone: inputValue(form, "tone"),
    directness: inputValue(form, "directness"),
    flirtLevel: inputValue(form, "flirtLevel"),
    humorLevel: inputValue(form, "humorLevel"),
    emojiLevel: inputValue(form, "emojiLevel"),
    messageLength: inputValue(form, "messageLength"),
    languageFr: inputValue(form, "languageFr"),
    languageDarija: inputValue(form, "languageDarija"),
    languageEn: inputValue(form, "languageEn"),
    stage: inputValue(form, "stage"),
    specificGoal: inputValue(form, "specificGoal"),
    persistentInstructions: inputValue(form, "persistentInstructions"),
    preferredWords: inputValue(form, "preferredWords"),
    avoidedWords: inputValue(form, "avoidedWords"),
    automationEnabled
  };
}

export function mountConversationOverridesEditor(
  container: HTMLElement,
  overrides: ConversationOverridesPayload,
  callbacks: ConversationOverridesEditorCallbacks
): () => void {
  const draft = initialDraft(overrides);
  container.innerHTML = `
    <form class="conversation-overrides-form" data-conversation-overrides-form>
      <div class="preferences-grid">
        <label>Dating goal<select name="datingGoal">${optionList(overrideDatingGoals, draft.datingGoal)}</select></label>
        <label>Disclosure<select name="disclosureStrategy">${optionList(overrideDisclosureStrategies, draft.disclosureStrategy)}</select></label>
        <label>Tone<select name="tone">${optionList(overrideTones, draft.tone)}</select></label>
        <label>Stage<select name="stage">${optionList(overrideStages, draft.stage)}</select></label>
        <label>Emoji<select name="emojiLevel">${optionList(overrideEmojiLevels, draft.emojiLevel)}</select></label>
        <label>Message length<select name="messageLength">${optionList(overrideMessageLengths, draft.messageLength)}</select></label>
        <label>Directness (0–100)<input name="directness" type="number" min="0" max="100" value="${escapeHtml(draft.directness)}" /></label>
        <label>Flirt (0–3)<input name="flirtLevel" type="number" min="0" max="3" step="1" value="${escapeHtml(draft.flirtLevel)}" /></label>
        <label>Humor (0–100)<input name="humorLevel" type="number" min="0" max="100" value="${escapeHtml(draft.humorLevel)}" /></label>
        <label>French weight<input name="languageFr" type="number" min="0" max="100" value="${escapeHtml(draft.languageFr)}" /></label>
        <label>Darija weight<input name="languageDarija" type="number" min="0" max="100" value="${escapeHtml(draft.languageDarija)}" /></label>
        <label>English weight<input name="languageEn" type="number" min="0" max="100" value="${escapeHtml(draft.languageEn)}" /></label>
        <label>Automation<select name="automationEnabled"><option value=""${draft.automationEnabled === undefined ? " selected" : ""}>Use global default</option><option value="true"${draft.automationEnabled === true ? " selected" : ""}>On</option><option value="false"${draft.automationEnabled === false ? " selected" : ""}>Off</option></select></label>
      </div>
      <label>Goal details<textarea name="datingGoalDetails" maxlength="500">${escapeHtml(draft.datingGoalDetails)}</textarea></label>
      <label>Specific goal<textarea name="specificGoal" maxlength="500">${escapeHtml(draft.specificGoal)}</textarea></label>
      <label>Persistent instructions<textarea name="persistentInstructions" maxlength="2000">${escapeHtml(draft.persistentInstructions)}</textarea></label>
      <label>Preferred wording<textarea name="preferredWords" maxlength="1000">${escapeHtml(draft.preferredWords)}</textarea></label>
      <label>Avoided wording<textarea name="avoidedWords" maxlength="1000">${escapeHtml(draft.avoidedWords)}</textarea></label>
      <div class="conversation-actions">
        <button type="submit">Save chat overrides</button>
        ${callbacks.onClear ? '<button type="button" data-clear-overrides>Clear overrides</button>' : ""}
      </div>
      <p class="subtle" role="status" data-overrides-status></p>
    </form>
  `;

  const form = container.querySelector<HTMLFormElement>("[data-conversation-overrides-form]");
  if (!form) throw new Error("Conversation overrides form was not mounted.");
  const status = form.querySelector<HTMLElement>("[data-overrides-status]");
  const clearButton = form.querySelector<HTMLButtonElement>("[data-clear-overrides]");

  const submit = async (event: SubmitEvent) => {
    event.preventDefault();
    try {
      const payload = buildConversationOverridesPayload(readDraft(form));
      if (status) status.textContent = "Saving…";
      await callbacks.onSave(payload);
      if (status) status.textContent = "Overrides saved.";
    } catch (error) {
      if (status) status.textContent = error instanceof Error ? error.message : "Unable to save overrides.";
    }
  };

  const clear = async () => {
    if (!callbacks.onClear) return;
    try {
      if (status) status.textContent = "Clearing…";
      await callbacks.onClear();
      if (status) status.textContent = "Overrides cleared.";
    } catch (error) {
      if (status) status.textContent = error instanceof Error ? error.message : "Unable to clear overrides.";
    }
  };

  form.addEventListener("submit", submit);
  clearButton?.addEventListener("click", clear);
  return () => {
    form.removeEventListener("submit", submit);
    clearButton?.removeEventListener("click", clear);
  };
}
