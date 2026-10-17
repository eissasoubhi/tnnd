import { readSession } from "./auth-client";
import { DEFAULT_TINDER_IMPORT_SETTINGS, validateTinderImportSettings, type TinderImportSettings } from "../../../src/tinder-import-settings";

const API = ((import.meta.env.VITE_TNND_API_BASE_URL as string | undefined)?.replace(/\/$/,"")
  ?? "http://127.0.0.1:4000") + "/api/v1/tinder/import-settings";
const root = document.querySelector<HTMLElement>("#conversation-workspace");
const panel = document.createElement("article");
panel.className = "panel panel-wide workspace-feature";
panel.id = "tinder-import-settings-panel";
panel.innerHTML = `
  <div class="panel-heading">
    <div><p class="eyebrow">Data sync · read-only</p><h2>Tinder conversation import</h2></div>
    <span class="pill" id="tinder-import-state">Not loaded</span>
  </div>
  <p>Choose what TNND saves from Tinder. These settings never allow the AI to send messages or change manual chat ownership.</p>
  <form class="preferences-grid" id="tinder-import-form">
    <div class="dating-goal-editor">
      <h3>Automatic synchronization</h3>
      <label><input type="checkbox" id="import-auto-opened"> Auto-sync new messages in conversations I open on Tinder</label>
      <label><input type="checkbox" id="import-auto-collect"> Automatically collect conversation links while browsing Tinder Messages</label>
      <p class="subtle">Both read-only options are ON by default. Auto-sync imports observed chats when other Tinder runners are idle; it does not guarantee full historical coverage or guarantee full historical coverage.</p>
    </div>
    <div class="dating-goal-editor"><h3>Which conversations to import?</h3>
      <label for="import-scope">Import scope</label>
      <select id="import-scope"><option value="all">All observed conversations</option><option value="filtered">Only conversations meeting criteria</option></select>
      <div id="import-criteria" class="preferences-grid" hidden>
        <label>Minimum verified age (optional)<input id="import-age-min" type="number" min="18" max="120" placeholder="No minimum"></label>
        <label>Maximum verified age (optional)<input id="import-age-max" type="number" min="18" max="120" placeholder="No maximum"></label>
        <label><input id="import-require-messages" type="checkbox"> Only conversations with visible messages</label>
        <p class="subtle">When you set an age filter, matches whose age cannot be verified are skipped, not guessed.</p>
      </div>
    </div>
    <div class="dating-goal-editor"><h3>What to save</h3>
      <label><input type="checkbox" id="import-messages"> Visible chat messages</label>
      <label><input type="checkbox" id="import-profile"> Visible match profile (name, age, bio, interests, etc.)</label>
      <label><input type="checkbox" id="import-photos"> Verified Tinder photo URLs (where displayed)</label>
      <p class="subtle">Tinder may load older messages and extra photos only when their panels are opened. TNND reports partial coverage instead of claiming unseen content was saved. Images are stored as permitted source URLs, not downloaded image binaries.</p>
    </div>
    <div class="preferences-save-bar"><p id="tinder-import-feedback" role="status" aria-live="polite" class="subtle">Sign in to load settings.</p>
      <button type="submit" id="tinder-import-save">Save import settings</button>
    </div>
  </form>
`;
root?.append(panel);
const form = panel.querySelector<HTMLFormElement>("#tinder-import-form")!;
const label = panel.querySelector<HTMLElement>("#tinder-import-state")!;
const feedback = panel.querySelector<HTMLElement>("#tinder-import-feedback")!;
const save = panel.querySelector<HTMLButtonElement>("#tinder-import-save")!;
const select = panel.querySelector<HTMLSelectElement>("#import-scope")!;
const criteria = panel.querySelector<HTMLElement>("#import-criteria")!;
const check = (id: string) => panel.querySelector<HTMLInputElement>("#"+id)!;
let generation = 0;
let forAccount: string | null = null;
function fill(settings: TinderImportSettings): void {
  check("import-auto-opened").checked = settings.autoSyncOpened;
  check("import-auto-collect").checked = settings.autoCollectLoaded;
  select.value = settings.scope;
  check("import-age-min").value = settings.ageMin === null ? "" : String(settings.ageMin);
  check("import-age-max").value = settings.ageMax === null ? "" : String(settings.ageMax);
  check("import-require-messages").checked = settings.requireMessages;
  check("import-messages").checked = settings.includeMessages;
  check("import-profile").checked = settings.includeProfile;
  check("import-photos").checked = settings.includePhotos;
  criteria.hidden = settings.scope !== "filtered";
}
function values(): TinderImportSettings {
  const min = check("import-age-min").value.trim(), max = check("import-age-max").value.trim();
  return validateTinderImportSettings({
    autoSyncOpened: check("import-auto-opened").checked,
    autoCollectLoaded: check("import-auto-collect").checked,
    scope: select.value,
    ageMin: min === "" ? null : Number(min), ageMax: max === "" ? null : Number(max),
    requireMessages: check("import-require-messages").checked,
    includeMessages: check("import-messages").checked,
    includeProfile: check("import-profile").checked,
    includePhotos: check("import-photos").checked
  });
}
select.addEventListener("change",()=>{ criteria.hidden = select.value !== "filtered"; });
async function refresh(): Promise<void> {
  const id = ++generation, session = readSession();
  forAccount = session?.user.id ?? null;
  if (!session) { label.textContent = "Sign in required"; feedback.textContent="Sign in to set import preferences."; save.disabled=true; fill(DEFAULT_TINDER_IMPORT_SETTINGS);return; }
  label.textContent = "Loading…"; save.disabled=true;
  try {
    const res = await fetch(API,{headers:{authorization:"Bearer "+session.token},cache:"no-store"});
    if (!res.ok) throw new Error("load_failed");
    const json = await res.json() as { settings: unknown };
    const settings = validateTinderImportSettings(json.settings);
    if (id !== generation || readSession()?.user.id !== session.user.id) return;
    fill(settings); label.textContent = "Saved"; feedback.textContent="Settings loaded. Changes require Save."; save.disabled=false;
  } catch {
    if (id===generation) {label.textContent="Unavailable";feedback.textContent="Unable to load import settings; check API and sign in again.";save.disabled=true;}
  }
}
form.addEventListener("submit", event => {
  event.preventDefault();
  void (async()=>{
    const session = readSession(), id=++generation;
    if (!session || session.user.id !== forAccount) return;
    let settings: TinderImportSettings;
    try { settings = values(); } catch { feedback.textContent="Choose at least one data type and valid age criteria."; return; }
    save.disabled=true; feedback.textContent="Saving…";
    try {
      const res = await fetch(API,{method:"PUT",headers:{"content-type":"application/json",authorization:"Bearer "+session.token},body:JSON.stringify(settings)});
      if (!res.ok) throw new Error("save_failed");
      if (id===generation && readSession()?.user.id===session.user.id) {
        label.textContent="Saved";feedback.textContent="Import preferences saved. No Tinder messages were sent.";
      }
    } catch { if (id===generation) feedback.textContent="Save failed; retry when TNND API is connected."; }
    finally { if (id===generation) save.disabled=false; }
  })();
});
window.addEventListener("tnnd:auth-session-changed",()=>{void refresh();});
void refresh();
