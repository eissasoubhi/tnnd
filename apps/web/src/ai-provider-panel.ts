import { createAiProviderClient } from "./ai-provider-client";
import { readSession } from "./auth-client";

const grid = document.querySelector<HTMLElement>(".grid");
if (!grid) throw new Error("TNND dashboard grid was not found.");

const panel = document.createElement("article");
panel.className = "panel";
panel.innerHTML = `
  <div class="panel-heading">
    <div>
      <p class="eyebrow">AI provider</p>
      <h2>Gemini</h2>
    </div>
    <span class="pill" id="ai-provider-status">Sign in required</span>
  </div>
  <p>Configure Gemini for backend AI features. The API key is sent to TNND only when you save it and is never displayed again.</p>
  <form id="ai-provider-form" class="preferences-grid">
    <label>Model<input id="ai-provider-model" type="text" value="gemini-2.5-flash" autocomplete="off" required /></label>
    <label>API key<input id="ai-provider-key" type="password" autocomplete="new-password" required /></label>
    <div>
      <button id="ai-provider-save" type="submit">Save configuration</button>
      <button id="ai-provider-test" type="button">Test connection</button>
    </div>
  </form>
  <p class="subtle" id="ai-provider-message" role="status">Sign in to configure Gemini.</p>
`;
grid.prepend(panel);

const form = panel.querySelector<HTMLFormElement>("#ai-provider-form");
const model = panel.querySelector<HTMLInputElement>("#ai-provider-model");
const apiKey = panel.querySelector<HTMLInputElement>("#ai-provider-key");
const save = panel.querySelector<HTMLButtonElement>("#ai-provider-save");
const test = panel.querySelector<HTMLButtonElement>("#ai-provider-test");
const status = panel.querySelector<HTMLElement>("#ai-provider-status");
const message = panel.querySelector<HTMLElement>("#ai-provider-message");

function refresh(): void {
  const signedIn = Boolean(readSession());
  if (model) model.disabled = !signedIn;
  if (apiKey) apiKey.disabled = !signedIn;
  if (save) save.disabled = !signedIn;
  if (test) test.disabled = !signedIn;
  if (status && !signedIn) status.textContent = "Sign in required";
  if (message && !signedIn) message.textContent = "Sign in to configure Gemini.";
}

form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const session = readSession();
  if (!session || !model || !apiKey || !save) return;
  save.disabled = true;
  if (message) message.textContent = "Saving Gemini configuration…";
  try {
    const client = createAiProviderClient(session.token);
    const result = await client.saveSettings({ model: model.value.trim(), apiKey: apiKey.value });
    apiKey.value = "";
    if (status) status.textContent = `${result.model} · configured`;
    if (message) message.textContent = "Gemini configuration saved securely on the backend.";
  } catch (error) {
    if (message) message.textContent = error instanceof Error ? error.message : "Unable to save Gemini configuration.";
  } finally {
    save.disabled = false;
  }
});

test?.addEventListener("click", async () => {
  const session = readSession();
  if (!session || !test) return;
  test.disabled = true;
  if (message) message.textContent = "Testing Gemini connection…";
  try {
    const result = await createAiProviderClient(session.token).testConnection();
    if (status) status.textContent = result.connected ? `${result.model} · connected` : `${result.model} · unavailable`;
    if (message) message.textContent = result.connected ? "Gemini connection succeeded." : "Gemini connection test failed.";
  } catch (error) {
    if (status) status.textContent = "Connection failed";
    if (message) message.textContent = error instanceof Error ? error.message : "Unable to test Gemini connection.";
  } finally {
    test.disabled = false;
  }
});

window.addEventListener("tnnd:auth-session-changed", refresh);
refresh();
