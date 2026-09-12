import { clearSession, listSessions, login, logout as logoutSession, persistSession, readSession, register, revokeSession, type AccountSession } from "./auth-client";

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
      <button id="register-submit" type="button">Create account</button>
      <button id="logout-submit" type="button">Sign out</button>
    </div>
  </form>
  <p class="subtle" id="auth-message" role="status">Sign in or create an account to sync TNND data with the backend.</p>
  <div id="session-manager" hidden>
    <div class="panel-heading">
      <div>
        <p class="eyebrow">Connected devices</p>
        <h3>Active sessions</h3>
      </div>
      <button id="sessions-refresh" type="button">Refresh</button>
    </div>
    <div id="sessions-list" class="preferences-grid"></div>
  </div>
`;
grid.prepend(panel);

const form = panel.querySelector<HTMLFormElement>("#login-form");
const email = panel.querySelector<HTMLInputElement>("#login-email");
const password = panel.querySelector<HTMLInputElement>("#login-password");
const submit = panel.querySelector<HTMLButtonElement>("#login-submit");
const registerButton = panel.querySelector<HTMLButtonElement>("#register-submit");
const logout = panel.querySelector<HTMLButtonElement>("#logout-submit");
const status = panel.querySelector<HTMLElement>("#auth-status");
const message = panel.querySelector<HTMLElement>("#auth-message");
const sessionManager = panel.querySelector<HTMLElement>("#session-manager");
const sessionsList = panel.querySelector<HTMLElement>("#sessions-list");
const sessionsRefresh = panel.querySelector<HTMLButtonElement>("#sessions-refresh");

function notifySessionChanged(): void {
  window.dispatchEvent(new CustomEvent("tnnd:auth-session-changed", { detail: { session: readSession() } }));
}

function formatSessionLabel(session: AccountSession): string {
  if (!session.deviceLabel) return "Unknown device";
  if (session.deviceLabel.startsWith("extension:")) return `Extension · ${session.deviceLabel.slice("extension:".length)}`;
  if (session.deviceLabel.startsWith("web:")) return `Web · ${session.deviceLabel.slice("web:".length)}`;
  return session.deviceLabel === "extension" ? "Chrome extension" : session.deviceLabel === "web" ? "Web app" : session.deviceLabel;
}

async function refreshSessions(): Promise<void> {
  const session = readSession();
  if (!session || !sessionsList) return;
  sessionsList.textContent = "Loading sessions…";
  try {
    const sessions = await listSessions(session);
    sessionsList.replaceChildren();
    for (const item of sessions) {
      const row = document.createElement("div");
      row.className = "card";
      const lastSeen = new Date(item.lastSeenAt).toLocaleString();
      row.innerHTML = `<strong>${formatSessionLabel(item)}${item.current ? " · current" : ""}</strong><span class="subtle">Last seen ${lastSeen}</span>`;
      if (!item.current) {
        const revoke = document.createElement("button");
        revoke.type = "button";
        revoke.textContent = "Revoke";
        revoke.addEventListener("click", async () => {
          revoke.disabled = true;
          try {
            await revokeSession(session, item.id);
            await refreshSessions();
          } catch (error) {
            if (message) message.textContent = error instanceof Error ? error.message : "Unable to revoke session.";
            revoke.disabled = false;
          }
        });
        row.append(revoke);
      }
      sessionsList.append(row);
    }
  } catch (error) {
    sessionsList.textContent = error instanceof Error ? error.message : "Unable to load sessions.";
  }
}

function refresh(): void {
  const session = readSession();
  if (status) status.textContent = session ? session.user.email : "Signed out";
  if (logout) logout.disabled = !session;
  if (submit) submit.disabled = Boolean(session);
  if (registerButton) registerButton.disabled = Boolean(session);
  if (email) email.disabled = Boolean(session);
  if (password) password.disabled = Boolean(session);
  if (sessionManager) sessionManager.hidden = !session;
  if (session) void refreshSessions();
  else sessionsList?.replaceChildren();
}

async function signIn(): Promise<void> {
  if (!email || !password || !submit) return;
  submit.disabled = true;
  if (registerButton) registerButton.disabled = true;
  if (message) message.textContent = "Signing in…";
  try {
    const session = await login({ email: email.value, password: password.value });
    persistSession(session);
    password.value = "";
    if (message) message.textContent = "Signed in. Profile data will now sync with the backend.";
    notifySessionChanged();
  } catch (error) {
    if (message) message.textContent = error instanceof Error ? error.message : "Unable to sign in.";
  } finally {
    refresh();
  }
}

form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  await signIn();
});

registerButton?.addEventListener("click", async () => {
  if (!email || !password || !registerButton) return;
  if (!form?.reportValidity()) return;
  registerButton.disabled = true;
  if (submit) submit.disabled = true;
  if (message) message.textContent = "Creating your TNND account…";
  try {
    await register({ email: email.value, password: password.value });
    if (message) message.textContent = "Account created. Signing in…";
    await signIn();
  } catch (error) {
    if (message) message.textContent = error instanceof Error ? error.message : "Unable to create account.";
  } finally {
    refresh();
  }
});

sessionsRefresh?.addEventListener("click", () => void refreshSessions());

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
    notifySessionChanged();
  }
});

refresh();
