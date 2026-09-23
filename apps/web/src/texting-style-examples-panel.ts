import { parsePastedTextingStyleExamples, prepareTextingStyleExamples } from "./texting-style-examples";

export function mountTextingStyleExamplesPanel(root: ParentNode = document): void {
  const grid = root.querySelector<HTMLElement>(".grid");
  if (!grid || root.querySelector("#texting-style-examples")) return;

  const panel = document.createElement("article");
  panel.className = "panel panel-wide";
  panel.id = "texting-style-examples";
  panel.innerHTML = `
    <div class="panel-heading">
      <div>
        <p class="eyebrow">Texting identity</p>
        <h2>Learn style from your messages</h2>
      </div>
      <span class="pill" id="style-example-count">0 examples</span>
    </div>
    <p>Paste messages you wrote, separated by blank lines. TNND prepares them for style analysis without retaining the raw text by default.</p>
    <label>
      Your message examples
      <textarea id="style-examples-input" rows="8" placeholder="hey ça va\n\nmdr oui ça marche\n\nsee you later"></textarea>
    </label>
    <label>
      <input id="style-examples-retain" type="checkbox" />
      Keep my source examples after analysis
    </label>
    <button id="style-examples-prepare" type="button">Prepare examples</button>
    <p class="subtle" id="style-examples-status" role="status">Nothing is sent until you explicitly start analysis.</p>
  `;
  grid.append(panel);

  const input = panel.querySelector<HTMLTextAreaElement>("#style-examples-input");
  const retain = panel.querySelector<HTMLInputElement>("#style-examples-retain");
  const prepare = panel.querySelector<HTMLButtonElement>("#style-examples-prepare");
  const count = panel.querySelector<HTMLElement>("#style-example-count");
  const status = panel.querySelector<HTMLElement>("#style-examples-status");

  prepare?.addEventListener("click", () => {
    const parsed = parsePastedTextingStyleExamples(input?.value ?? "");
    const prepared = prepareTextingStyleExamples(parsed, retain?.checked === true);
    if (count) count.textContent = `${prepared.examples.length} example${prepared.examples.length === 1 ? "" : "s"}`;
    if (status) {
      status.textContent = prepared.examples.length === 0
        ? "Paste at least one non-empty message."
        : `${prepared.examples.length} example${prepared.examples.length === 1 ? "" : "s"} ready for analysis. Source retention ${prepared.sourceRetentionOptIn ? "enabled" : "disabled"}.`;
    }
  });
}

if (typeof document !== "undefined") mountTextingStyleExamplesPanel();
