import { clearSession, login, persistSession, readSession } from "./auth-client";

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
  <p class="subtle" id="auth-message" role="status">Account sessions stay in session storage until server-side auth persistence is connected.</p>
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
    if (message) message.textContent = "Signed in. Server-side profile sync can now use this session contract.";
  } catch (error) {
    if (message) message.textContent = error instanceof Error ? error.message : "Unable to sign in.";
  } finally {
    refresh();
  }
});

logout?.addEventListener("click", () => {
  clearSession();
  if (password) password.value = "";
  if (message) message.textContent = "Signed out locally.";
  refresh();
});

refresh();
