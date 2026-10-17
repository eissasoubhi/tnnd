import { getBackendSession, getConfig } from "./storage";
import { assertTinderContentBridge } from "./tinder-tab-connection";
import { prepareReadOnlyImportBatches, type VisibleTinderMessage } from "./tinder-manual-import";
import { uploadVisibleMatchProfileCapture } from "./tinder-match-profile-backend";
import { DEFAULT_TINDER_IMPORT_SETTINGS, validateTinderImportSettings, shouldImportThread, type TinderImportSettings } from "./tinder-import-settings";
import type { TinderVisibleProfileSource } from "./tinder-match-profile-capture";
import { safeBulkRefs, nextBulkSyncRef, canContinueBulkSync, bulkSyncCounts, type BulkSyncProgress } from "./tinder-bulk-sync-policy";

const KEY = "tnnd.readOnlyBulkSync.v1";
const ALARM = "tnnd.readOnlyBulkSync.tick";
const API = "http://127.0.0.1:4000";
let processing = false;
const autoOpenedInFlight = new Set<string>();
const popupOnly = (sender: chrome.runtime.MessageSender): boolean =>
  sender.id === chrome.runtime.id && sender.url === `chrome-extension://${chrome.runtime.id}/popup.html`;

function pathRef(url: string | undefined): string | null {
  try {
    const pathname = new URL(url ?? "").pathname;
    if (!pathname.startsWith("/app/messages/")) return null;
    const ref = decodeURIComponent(pathname.slice("/app/messages/".length)).replace(/\/+$/, "");
    return /^[a-zA-Z0-9_-]{3,512}$/.test(ref) ? ref : null;
  } catch { return null; }
}
async function load(): Promise<BulkSyncProgress | null> {
  const value = (await chrome.storage.local.get(KEY))[KEY] as BulkSyncProgress | undefined;
  return value?.userId && Array.isArray(value.refs) && Array.isArray(value.done) ? value : null;
}
async function save(state: BulkSyncProgress): Promise<void> {
  await chrome.storage.local.set({ [KEY]: { ...state, updatedAt: new Date().toISOString() } });
}
async function tinderTab(): Promise<chrome.tabs.Tab> {
  const tabs = await chrome.tabs.query({ url: ["https://tinder.com/*", "https://www.tinder.com/*"] });
  if (tabs.length !== 1 || tabs[0]?.id === undefined) throw new Error("exactly_one_tinder_tab_required");
  return tabs[0];
}
async function otherRunnersActive(): Promise<boolean> {
  const values = await chrome.storage.local.get(["tnnd.globalExistingRunner.v2","tnnd.newMatchLinkObservation.v3"]);
  const existing = values["tnnd.globalExistingRunner.v2"] as { enabled?: boolean } | undefined;
  const newMatch = values["tnnd.newMatchLinkObservation.v3"] as { enabled?: boolean } | undefined;
  return existing?.enabled === true || newMatch?.enabled === true;
}
async function preflight(userId: string): Promise<chrome.tabs.Tab> {
  const session = await getBackendSession();
  if (!session || session.user.id !== userId) throw new Error("tnnd_account_changed");
  if ((await getConfig()).automation.enabled || await otherRunnersActive()) throw new Error("disable_all_auto_chat_before_read_only_import");
  const tab = await tinderTab();
  await assertTinderContentBridge(tab.id!);
  const sidebar = await chrome.tabs.sendMessage(tab.id!, { type: "TNND_BULK_SYNC_VISIBLE_MESSAGE_REFS" }) as { ok?: boolean };
  if (!sidebar?.ok) throw new Error("open_tinder_messages_before_import");
  return tab;
}
async function collect(): Promise<BulkSyncProgress> {
  const session = await getBackendSession();
  if (!session) throw new Error("tnnd_sign_in_required");
  const tab = await tinderTab();
  await assertTinderContentBridge(tab.id!);
  const snapshot = await chrome.tabs.sendMessage(tab.id!, { type: "TNND_BULK_SYNC_VISIBLE_MESSAGE_REFS" }) as
    { ok?: boolean; refs?: unknown; error?: string };
  if (!snapshot?.ok) throw new Error("open_tinder_messages_and_load_sidebar");
  const previous = await load();
  if (previous?.active) throw new Error("stop_bulk_sync_before_collecting");
  const refs = safeBulkRefs(snapshot.refs, 500);
  const same = previous?.userId === session.user.id && previous.tabId === tab.id;
  const merged = safeBulkRefs([...(same ? previous.refs : []), ...refs], 500);
  if (!merged.length) throw new Error("no_loaded_tinder_conversations");
  const state: BulkSyncProgress = {
    active: false, collecting: same ? previous.collecting === true : false, stopReason: null,
    userId: session.user.id, tabId: tab.id!,
    refs: merged, done: same ? previous.done.filter(ref=>merged.includes(ref)) : [],
    failed: same ? Object.fromEntries(Object.entries(previous.failed).filter(([ref])=>merged.includes(ref))) : {},
    partial: same ? previous.partial.filter(ref=>merged.includes(ref)) : [],
    initialRef: pathRef(tab.url), lastRef: null,
    startedAt: same ? previous.startedAt : new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  await save(state);
  return state;
}
function counts(state: BulkSyncProgress | null) {
  return state ? { active: state.active, collecting: state.collecting === true,
      stopReason: state.stopReason ?? null, ...bulkSyncCounts(state), updatedAt: state.updatedAt }
    : { active: false, collecting: false, stopReason: null, selected: 0, completed: 0, failed: 0, partial: 0, pending: 0, updatedAt: null };
}
async function stop(reason?: string): Promise<BulkSyncProgress | null> {
  const state = await load();
  if (state?.active) await save({ ...state, active: false, stopReason: reason ?? null });
  await chrome.alarms.clear(ALARM);
  return load();
}
async function settingsFor(userId: string): Promise<TinderImportSettings> {
  const session = await getBackendSession();
  if (!session || session.user.id !== userId) throw new Error("tnnd_account_changed");
  const response = await fetch(API + "/api/v1/tinder/import-settings", {
    headers: { authorization: "Bearer "+session.token }, cache: "no-store"
  });
  if (!response.ok) throw new Error("import_preferences_unavailable");
  const result = await response.json() as {settings?: unknown};
  return validateTinderImportSettings(result.settings ?? DEFAULT_TINDER_IMPORT_SETTINGS);
}
interface ProfileSnapshot {
  ok?: boolean;
  conversationRef?: string;
  age?: number | null;
  capture?: TinderVisibleProfileSource;
}
async function readProfile(tabId: number, ref: string): Promise<TinderVisibleProfileSource | null> {
  const snapshot = await chrome.tabs.sendMessage(tabId, {type:"TNND_IMPORT_VISIBLE_MATCH_PROFILE"}) as ProfileSnapshot;
  if (!snapshot?.ok || snapshot.conversationRef !== ref) throw new Error("profile_thread_mismatch");
  return snapshot.capture ?? null;
}
async function upload(
  ref: string, messages: VisibleTinderMessage[], expectedUserId: string,
  settings: TinderImportSettings, profile: TinderVisibleProfileSource | null
): Promise<{ partial: boolean }> {
  const session = await getBackendSession();
  if (!session || session.user.id !== expectedUserId) throw new Error("tnnd_account_changed");
  const lookup = await fetch(API + "/api/v1/conversations/by-external-thread?externalThreadId=" + encodeURIComponent(ref), {
    headers: { authorization: "Bearer " + session.token }
  });
  if (!lookup.ok && lookup.status !== 404) throw new Error("conversation_lookup_failed");
  const existing = lookup.ok;
  const batches = settings.includeMessages
    ? prepareReadOnlyImportBatches(messages, existing, new Date().toISOString()) : [];
  // Even with zero visible messages, create the thread as paused and unmanaged
  // when importing profile/photo evidence. Never re-enable existing status.
  const work = batches.length ? batches : [{messages:[],requestedStatus:existing?null:"paused",nextCursor:undefined}];
  let conversationId = "";
  for (const [index, batch] of work.entries()) {
    if ((await getBackendSession())?.user.id !== expectedUserId) throw new Error("tnnd_account_changed");
    const response = await fetch(API + "/api/v1/conversations/sync", {
      method:"POST",headers:{authorization:"Bearer "+session.token,"content-type":"application/json"},
      body:JSON.stringify({
        externalThreadId:ref, ...(index === 0 && !existing ? {status:"paused"} : {}),
        messages:batch.messages, ...(batch.nextCursor ? {nextCursor:batch.nextCursor}: {})
      })
    });
    if (!response.ok) throw new Error("conversation_import_failed");
    const result = await response.json() as {conversationId?: unknown; acceptedMessageIds?: unknown};
    if (typeof result.conversationId !== "string" || !Array.isArray(result.acceptedMessageIds)
      || (conversationId && result.conversationId !== conversationId)) throw new Error("unconfirmed_import_response");
    conversationId = result.conversationId;
  }
  if ((settings.includeProfile || settings.includePhotos) && profile) {
    const fields = profile.visibleFields;
    const selected: TinderVisibleProfileSource = {
      ...profile,
      visibleFields: settings.includeProfile ? {
        ...fields,
        ...(!settings.includePhotos ? {photoUrl:undefined,photoUrls:undefined}:{})
      } : {
        ...(settings.includePhotos ? {photoUrl:fields.photoUrl, photoUrls:fields.photoUrls}:{})
      }
    };
    if (Object.values(selected.visibleFields).some(value=>Array.isArray(value) ? value.length > 0 : Boolean(value))) {
      await uploadVisibleMatchProfileCapture(session, selected, {conversationId});
    }
  }
  // Tinder has not proven that the oldest message/photos were loaded.
  return {partial:true};
}

async function tick(): Promise<void> {
  if (processing) return;
  processing = true;
  try {
    for (let batch = 0; batch < 4; batch++) {
      let state = await load();
      if (!state?.active) return;
      const session = await getBackendSession();
      const tab = await tinderTab();
      const config = await getConfig();
      const reason = session && canContinueBulkSync(state, {
        userId: session.user.id, tabId: tab.id!, currentRef: pathRef(tab.url),
        automationEnabled: config.automation.enabled,
        otherRunnerActive: await otherRunnersActive()
      });
      if (!session || reason) { await stop(reason ?? "tnnd_account_disconnected"); return; }
      const ref = nextBulkSyncRef(state);
      if (!ref) { await stop(); return; }
      try {
        const result = await chrome.tabs.sendMessage(state.tabId, {
          type: "TNND_BULK_SYNC_READONLY_NAVIGATE",
          ref, expectedRef: pathRef(tab.url)
        }) as { ok?: boolean; currentRef?: string; error?: string };
        if (!result?.ok || result.currentRef !== ref) {
          if (["unsent_message_draft_present","conversation_processing_in_progress","unexpected_current_thread"].includes(result?.error ?? "")) {
            await stop("human_draft_or_chat_busy"); return;
          }
          state = { ...state, failed: { ...state.failed, [ref]: result?.error ?? "navigation_not_confirmed" } };
          await save(state);
          continue;
        }
        // A successful navigation is checkpointed before the database write.
        state = { ...state, lastRef: ref };
        await save(state);
        const snapshot = await chrome.tabs.sendMessage(state.tabId, {
          type: "TNND_GET_VISIBLE_THREAD_MESSAGES"
        }) as { ok?: boolean; threadKey?: string; conversationRef?: string; messages?: VisibleTinderMessage[]; error?: string };
        const info = !snapshot?.ok && snapshot?.error === "no_recognized_messages"
          ? await chrome.tabs.sendMessage(state.tabId, { type: "TNND_GET_THREAD_INFO" }) as
            { ok?: boolean; threadKey?: string; composerFound?: boolean }
          : null;
        if (!(snapshot?.ok && snapshot.threadKey === ref && snapshot.conversationRef === ref && Array.isArray(snapshot.messages))
          && !(info?.ok && info.threadKey === ref && info.composerFound)) {
          throw new Error("thread_transcript_not_verified");
        }
        const live = await load();
        if (!live?.active || live.startedAt !== state.startedAt
          || (await getBackendSession())?.user.id !== state.userId
          || (await getConfig()).automation.enabled || await otherRunnersActive()) {
          await stop("account_or_automation_changed"); return;
        }
        const observed = snapshot?.ok ? snapshot.messages! : [];
        const prefs = await settingsFor(state.userId);
        const profile = (prefs.includeProfile || prefs.includePhotos || prefs.scope === "filtered")
          ? await readProfile(state.tabId,ref) : null;
        const eligibility = shouldImportThread(prefs,{
          age:profile?.visibleFields.age ?? null,messageCount:observed.length
        });
        if (!eligibility.eligible) {
          await save({...live,failed:{...live.failed,[ref]:"filtered_"+eligibility.reason}});
          continue;
        }
        const imported = await upload(ref, observed, state.userId,prefs,profile);
        state = { ...live, done: [...live.done, ref],
          partial: imported.partial ? [...live.partial, ref] : live.partial };
        await save(state);
      } catch {
        const latest = await load();
        if (!latest?.active || latest.startedAt !== state.startedAt) return;
        await save({ ...latest, failed: { ...latest.failed, [ref]: "import_or_navigation_failed" } });
      }
    }
  } catch {
    await stop("tinder_or_api_unavailable");
  } finally {
    processing = false;
    const state = await load();
    if (state?.active && !nextBulkSyncRef(state)) await stop();
  }
}

/** Passive user-authorized discovery as the human scrolls Tinder Messages.
 * Collect thread refs only: no messages, prompts, AI sends or invented URLs.
 */
chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
  if (!message || typeof message !== "object"
    || (message as {type?: unknown}).type !== "TNND_BULK_SYNC_OBSERVE_REFS") return false;
  const input = message as { refs?: unknown };
  if (sender.id !== chrome.runtime.id || !sender.tab?.id ||
    !/^https:\/\/(?:www\.)?tinder\.com\//.test(sender.url ?? "")) {
    sendResponse({ok:false}); return false;
  }
  void (async () => {
    const state = await load();
    const session = await getBackendSession();
    if (!session || (state?.active) || (state?.userId && state.userId !== session.user.id)
      || (state?.tabId && sender.tab?.id !== state.tabId)) return {ok:false};
    const prefs = await settingsFor(session.user.id);
    if (!state?.collecting && !prefs.autoCollectLoaded) return {ok:false};
    const observed = safeBulkRefs(input.refs,500);
    const original = state?.refs ?? [];
    const merged = safeBulkRefs([...original,...observed],500);
    if (!merged.length) return {ok:false};
    if (merged.length !== original.length) {
      const next: BulkSyncProgress = state ?? {
        active:false,collecting:false,stopReason:null,
        userId:session.user.id,tabId:sender.tab!.id!,refs:[],done:[],failed:{},partial:[],
        initialRef:pathRef(sender.url),lastRef:null,
        startedAt:new Date().toISOString(),updatedAt:new Date().toISOString()
      };
      await save({...next,refs:merged});
    }
    return {ok:true,added:merged.length-original.length};
  })().then(sendResponse).catch(()=>sendResponse({ok:false}));
  return true;
});

/** Automatic *passive* sync of an already opened Tinder conversation.
 * This never navigates or sends. Disabled by default in the account's Web
 * import preferences, independent from all Tinder AI-send permissions.
 */
chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
  if (!message || typeof message !== "object" ||
      (message as {type?: unknown}).type !== "TNND_IMPORT_OPENED_THREAD_OBSERVED") return false;
  const ref = (message as {ref?: unknown}).ref;
  if (sender.id !== chrome.runtime.id || !sender.tab?.id ||
      !/^https:\/\/(?:www\.)?tinder\.com\//.test(sender.url ?? "") ||
      typeof ref !== "string" || !/^[a-zA-Z0-9_-]{3,512}$/.test(ref) ||
      pathRef(sender.url) !== ref) { sendResponse({ok:false});return false; }
  void (async () => {
    const session = await getBackendSession();
    if (!session) return {ok:false};
    const key = session.user.id + ":" + sender.tab!.id + ":" + ref;
    if (autoOpenedInFlight.has(key)) return {ok:false};
    const prefs = await settingsFor(session.user.id);
    if (!prefs.autoSyncOpened) return {ok:false};
    const tab = await chrome.tabs.get(sender.tab!.id!);
    if (pathRef(tab.url) !== ref) return {ok:false};
    autoOpenedInFlight.add(key);
    try {
      const snapshot = await chrome.tabs.sendMessage(tab.id!,{type:"TNND_GET_VISIBLE_THREAD_MESSAGES"}) as
        {ok?:boolean;conversationRef?:string;threadKey?:string;messages?:VisibleTinderMessage[];error?:string};
      const isEmpty = snapshot?.error === "no_recognized_messages";
      if (!isEmpty && !(snapshot?.ok && snapshot.conversationRef === ref &&
          snapshot.threadKey === ref && Array.isArray(snapshot.messages))) return {ok:false};
      const observed = snapshot?.ok ? snapshot.messages! : [];
      const profile = await readProfile(tab.id!,ref);
      const eligible = shouldImportThread(prefs,{age:profile?.visibleFields.age ?? null,
        messageCount:observed.length});
      if (!eligible.eligible) return {ok:false,reason:eligible.reason};
      if ((await getBackendSession())?.user.id !== session.user.id ||
          pathRef((await chrome.tabs.get(tab.id!)).url) !== ref ||
          !(await settingsFor(session.user.id)).autoSyncOpened) return {ok:false};
      await upload(ref,observed,session.user.id,prefs,profile);
      return {ok:true};
    } finally {autoOpenedInFlight.delete(key);}
  })().then(sendResponse).catch(()=>sendResponse({ok:false}));
  return true;
});

chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === ALARM) void tick();
});
chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
  if (!message || typeof message !== "object") return false;
  const input = message as { type?: unknown };
  if (!["TNND_BULK_SYNC_STATUS","TNND_BULK_SYNC_COLLECT","TNND_BULK_SYNC_COLLECT_START","TNND_BULK_SYNC_COLLECT_STOP","TNND_BULK_SYNC_START","TNND_BULK_SYNC_STOP","TNND_BULK_SYNC_RETRY"].includes(String(input.type))) return false;
  if (!popupOnly(sender)) {
    sendResponse({ ok:false, error:"popup_only" }); return false;
  }
  const run = async () => {
    if (input.type === "TNND_BULK_SYNC_STATUS") {
      const session = await getBackendSession(), state = await load();
      return { ok:true, state: state?.userId === session?.user.id ? counts(state) : counts(null) };
    }
    if (input.type === "TNND_BULK_SYNC_COLLECT") return { ok:true, state: counts(await collect()) };
    if (input.type === "TNND_BULK_SYNC_COLLECT_START") {
      const state = await collect();
      await save({ ...state, collecting: true, stopReason: null });
      return { ok: true, state: counts(await load()) };
    }
    if (input.type === "TNND_BULK_SYNC_COLLECT_STOP") {
      const state = await load();
      if (state?.collecting) await save({ ...state, collecting: false });
      return { ok: true, state: counts(await load()) };
    }
    if (input.type === "TNND_BULK_SYNC_STOP") return { ok:true, state: counts(await stop()) };
    let state = await load();
    const session = await getBackendSession();
    if (!session) throw new Error("tnnd_sign_in_required");
    await preflight(session.user.id);
    if (!state || state.userId !== session.user.id || !state.refs.length) state = await collect();
    if (state.active) throw new Error("bulk_sync_already_running");
    if (input.type === "TNND_BULK_SYNC_RETRY") {
      state = { ...state, failed: {} };
    }
    state = { ...state, active: true, collecting: false, stopReason: null, initialRef: pathRef((await tinderTab()).url),
      lastRef: null, startedAt: new Date().toISOString() };
    await save(state);
    await chrome.alarms.create(ALARM, { periodInMinutes: 1 });
    void tick();
    return { ok:true, state: counts(state) };
  };
  void run().then(sendResponse).catch(error => sendResponse({
    ok:false, error: error instanceof Error ? error.message : "bulk_sync_unavailable"
  }));
  return true;
});
