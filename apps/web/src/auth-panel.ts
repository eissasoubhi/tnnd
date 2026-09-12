import { clearSession, login, logout as logoutSession, persistSession, readSession } from "./auth-client";

const grid = document.querySelector<HTMLElement>(".grid");
if (!grid) throw new Error("TNND dashboard grid was not found.");

const panel = document.createElement("article");
panel.className = "panel";
panel.innerHTML = `
  <div class="panel-heading">
    <div>
      <p class="eyebrow">Authentication</p>
      <h2>TNND account</h2>
    </div>
    <span class="pill" id="auth-status">Signed out</span>
  </div>
  <form id="login-form" class="preferences-grid">
    <label>Email<input id="login-email" type="email" autocomplete="email" required /></label>
    <label>Password<input id="login-password" type="password" autocomplete="current-password" minlength="12" required /></label>
    <div>
      <button id="login-submit" type="submit">Sign in</button>
      <button id="logout-submit" type="button">Sign out</button>
    </div>
  </form>
  <p class="subtle" id="auth-message" role="status">Sign in to sync TNND account data with the backend.</p>
`;
grid.prepend(panel);

const form = panel.querySelector<HTMLFormElement>("#login-form");
const email = panel.querySelector<HTMLInputElement>("#login-email");
const password = panel.querySelector<HTMLInputElement>("#login-password");
const submit = panel.querySelector<HTMLButtonElement>("#login-submit");
const logout = panel.querySelector<HTMLButtonElement>("#logout-submit");
const status = panel.querySelector<HTMLElement>("#auth-status");
const message = panel.querySelector<HTMLElement>("#auth-message");

function refresh(): void {
  const session = readSession();
  if (status) status.textContent = session ? session.user.email : "Signed out";
  if (logout) logout.disabled = !session;
  if (submit) submit.disabled = Boolean(session);
  if (email) email.disabled = Boolean(session);
  if (password) password.disabled = Boolean(session);
}

form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!email || !password || !submit) return;
  submit.disabled = true;
  if (message) message.textContent = "Signing in…";
  try {
    const session = await login({ email: email.value, password: password.value });
    persistSession(session);
    password.value = "";
    if (message) message.textContent = "Signed in. This session can now authenticate profile and sync requests.";
  } catch (error) {
    if (message) message.textContent = error instanceof Error ? error.message : "Unable to sign in.";
  } finally {
    refresh();
  }
});

logout?.addEventListener("click", async () => {
  const session = readSession();
  if (!session) return;
  if (logout) logout.disabled = true;
  if (message) message.textContent = "Signing out…";
  try {
    await logoutSession(session);
    if (message) message.textContent = "Signed out.";
  } catch (error) {
    if (message) message.textContent = error instanceof Error ? `${error.message} Local session was cleared.` : "Local session was cleared.";
  } finally {
    clearSession();
    if (password) password.value = "";
    refresh();
  }
});

refresh();
