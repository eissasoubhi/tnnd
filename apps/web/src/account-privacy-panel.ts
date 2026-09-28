import { createAccountPrivacyClient } from "./account-privacy-client";
import { clearSession, readSession } from "./auth-client";

const grid = document.querySelector<HTMLElement>(".grid");
if (!grid) throw new Error("TNND dashboard grid was not found.");

const panel = document.createElement("article");
panel.className = "panel";
panel.innerHTML = `
  <div class="panel-heading">
    <div>
      <p class="eyebrow">Privacy</p>
      <h2>Your TNND data</h2>
    </div>
    <span class="pill" id="privacy-status">Sign in required</span>
  </div>
  <p>Download a portable account export or permanently delete your TNND account and server-side data.</p>
  <div class="preferences-grid">
    <div>
      <button id="account-export" type="button">Export account data</button>
    </div>
    <label>Current password
      <input id="account-delete-password" type="password" autocomplete="current-password" minlength="12" />
    </label>
    <div>
      <button id="account-delete" type="button">Delete account permanently</button>
    </div>
  </div>
  <p class="subtle" id="privacy-message" role="status">Sign in to manage account data.</p>
`;
grid.append(panel);

const status = panel.querySelector<HTMLElement>("#privacy-status");
const message = panel.querySelector<HTMLElement>("#privacy-message");
const exportButton = panel.querySelector<HTMLButtonElement>("#account-export");
const deleteButton = panel.querySelector<HTMLButtonElement>("#account-delete");
const password = panel.querySelector<HTMLInputElement>("#account-delete-password");

function refresh(): void {
  const signedIn = Boolean(readSession());
  if (status) status.textContent = signedIn ? "Signed in" : "Sign in required";
  if (exportButton) exportButton.disabled = !signedIn;
  if (deleteButton) deleteButton.disabled = !signedIn;
  if (password) {
    password.disabled = !signedIn;
    if (!signedIn) password.value = "";
  }
  if (message && !signedIn) message.textContent = "Sign in to manage account data.";
}

function downloadJson(value: unknown): void {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  const date = new Date().toISOString().slice(0, 10);
  anchor.href = url;
  anchor.download = `tnnd-account-export-${date}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function clearLocalAccountFallbacks(): void {
  localStorage.removeItem("tnnd:web:imported-profile");
  localStorage.removeItem("tnnd:web:human-actions");
}

exportButton?.addEventListener("click", async () => {
  const session = readSession();
  if (!session || !exportButton) return;
  exportButton.disabled = true;
  if (message) message.textContent = "Preparing account export…";
  try {
    const exported = await createAccountPrivacyClient(session.token).exportAccountData();
    downloadJson(exported);
    if (message) message.textContent = "Account export downloaded.";
  } catch (error) {
    if (message) message.textContent = error instanceof Error ? error.message : "Unable to export account data.";
  } finally {
    refresh();
  }
});

deleteButton?.addEventListener("click", async () => {
  const session = readSession();
  if (!session || !deleteButton || !password) return;
  const currentPassword = password.value;
  if (!currentPassword) {
    if (message) message.textContent = "Enter your current password before deleting the account.";
    password.focus();
    return;
  }
  if (!window.confirm("Permanently delete your TNND account and server-side data? This cannot be undone.")) return;

  deleteButton.disabled = true;
  if (exportButton) exportButton.disabled = true;
  if (message) message.textContent = "Deleting account…";
  try {
    await createAccountPrivacyClient(session.token).deleteAccount(currentPassword);
    password.value = "";
    clearSession();
    clearLocalAccountFallbacks();
    if (status) status.textContent = "Account deleted";
    if (message) message.textContent = "Your TNND account and server-side data were deleted.";
    window.dispatchEvent(new CustomEvent("tnnd:auth-session-changed", { detail: { session: null } }));
  } catch (error) {
    password.value = "";
    if (message) message.textContent = error instanceof Error ? error.message : "Unable to delete account.";
  } finally {
    refresh();
  }
});

window.addEventListener("tnnd:auth-session-changed", refresh);
refresh();
