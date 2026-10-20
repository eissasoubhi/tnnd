import { loginBackend, logoutBackend } from "./backend-session";
import { getBackendSession } from "./storage";

/** Account connection lives in a separate extension-origin page, never the
 * one-button toolbar popup. No website-to-extension token copying, URL bearer
 * tokens, Tinder message access or automatic activity starts.
 */
const loginForm = document.getElementById("loginForm") as HTMLFormElement;
const connected = document.getElementById("connected") as HTMLElement;
const account = document.getElementById("account") as HTMLElement;
const email = document.getElementById("email") as HTMLInputElement;
const password = document.getElementById("password") as HTMLInputElement;
const login = document.getElementById("login") as HTMLButtonElement;
const logout = document.getElementById("logout") as HTMLButtonElement;
const status = document.getElementById("status") as HTMLElement;
let busy = false;

function show(emailAddress: string | null, message: string): void {
  connected.hidden = !emailAddress;
  loginForm.hidden = Boolean(emailAddress);
  account.textContent = emailAddress ? "Compte connecté : " + emailAddress : "";
  status.textContent = message;
}
loginForm.addEventListener("submit", event => {
  event.preventDefault();
  if (busy) return;
  busy = true;
  login.disabled = true;
  const input = { email: email.value.trim(), password: password.value };
  status.textContent = "Connexion de l'extension au serveur TNND…";
  void (async () => {
    try {
      const session = await loginBackend(input);
      show(session.user.email, "Extension connectée. Rouvre le popup pour démarrer.");
    } catch (error) {
      const saved = await getBackendSession().catch(() => null);
      if (saved) {
        // loginBackend stores its session before optional profile sync. An
        // unavailable profile is not evidence that the login itself failed.
        show(saved.user.email,
          "Session connectée, mais synchronisation du profil indisponible. Vérifie TNND Web.");
      } else {
        show(null, "Connexion refusée ou serveur indisponible. Vérifie l'email, le mot de passe et l'API TNND.");
      }
    } finally {
      // Never retain the password in a long-lived extension page.
      password.value = "";
      input.password = "";
      busy = false;
      login.disabled = false;
    }
  })();
});
logout.addEventListener("click", () => {
  if (busy) return;
  busy = true;
  logout.disabled = true;
  void (async () => {
    try {
      await logoutBackend();
      show(null, "Extension déconnectée. Aucune tentative Tinder envoyée.");
    } catch {
      show(null, "Déconnexion locale effectuée ou à vérifier. Actualise cette page.");
    } finally {
      busy = false;
      logout.disabled = false;
    }
  })();
});
void getBackendSession().then(session =>
  show(session?.user.email ?? null, session ? "Session locale présente." : "Extension non connectée.")
).catch(() => show(null, "Impossible de lire la session Chrome."));
