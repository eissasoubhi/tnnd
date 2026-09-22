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
let refreshGeneration = 0;

async function refresh(): Promise<void> {
  const generation = ++refreshGeneration;
  const session = readSession();
  const signedIn = Boolean(session);
  if (model) model.disabled = !signedIn;
  if (apiKey) apiKey.disabled = !signedIn;
  if (save) save.disabled = !signedIn;
  if (test) test.disabled = !signedIn;
  if (!session) {
    if (status) status.textContent = "Sign in required";
    if (message) message.textContent = "Sign in to configure Gemini.";
    return;
  }

  if (status) status.textContent = "Loading…";
  if (message) message.textContent = "Loading Gemini configuration…";
  try {
    const settings = await createAiProviderClient(session.token).getSettings();
    if (generation !== refreshGeneration || readSession()?.token !== session.token) return;
    if (settings.model && model) model.value = settings.model;
    if (status) status.textContent = settings.configured
      ? `${settings.model ?? "Gemini"} · configured`
      : "Not configured";
    if (message) message.textContent = settings.configured
      ? "Gemini configuration is stored securely on the backend. Enter a new API key only to replace it."
      : "Add a Gemini model and API key to enable backend AI features.";
  } catch (error) {
    if (generation !== refreshGeneration || readSession()?.token !== session.token) return;
    if (status) status.textContent = "Unable to load";
    if (message) message.textContent = error instanceof Error ? error.message : "Unable to load Gemini configuration.";
  }
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

window.addEventListener("tnnd:auth-session-changed", () => { void refresh(); });
void refresh();
void import("./analytics-panel");
