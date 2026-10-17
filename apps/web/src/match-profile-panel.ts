import { getConversationMatchProfile, MatchProfileApiError, promoteMatchProfile } from "./match-profile-client.js";
import { buildMatchProfileViewModel, type MatchProfileRecord } from "./match-profile-view-model.js";

export type MatchProfilePanelOptions = {
  apiBase: string;
  token: string;
  conversationId: string;
  temporaryProfile?: MatchProfileRecord | null;
};

export type MatchProfilePanel = {
  element: HTMLElement;
  load(): Promise<void>;
};

export function canPromoteTemporaryMatchProfile(record: MatchProfileRecord, now = new Date()): boolean {
  if (record.conversationId || record.normalizedProfile.retention.mode !== "temporary") return false;
  const expiresAt = record.expiresAt ?? record.normalizedProfile.retention.expiresAt;
  return !expiresAt || Date.parse(expiresAt) > now.getTime();
}

function text(tag: keyof HTMLElementTagNameMap, value: string, className?: string): HTMLElement {
  const element = document.createElement(tag);
  element.textContent = value;
  if (className) element.className = className;
  return element;
}

function fieldList(items: Array<{ label: string; value: string }>): HTMLElement {
  const list = document.createElement("dl");
  list.className = "match-profile-fields";
  for (const item of items) {
    const row = document.createElement("div");
    row.className = "match-profile-field";
    row.append(text("dt", item.label), text("dd", item.value));
    list.append(row);
  }
  return list;
}

function refreshButton(onReload: () => Promise<void>): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "Reload stored profile";
  button.title = "Reload the latest MatchProfile already stored by TNND. This does not capture Tinder again.";
  button.addEventListener("click", async () => {
    button.disabled = true;
    try { await onReload(); } finally { if (button.isConnected) button.disabled = false; }
  });
  return button;
}

function renderRecord(root: HTMLElement, record: MatchProfileRecord, onReload: () => Promise<void>): void {
  const model = buildMatchProfileViewModel(record);
  root.replaceChildren();
  const header = document.createElement("header");
  header.append(text("h3", model.title), text("p", model.freshnessLabel, `match-profile-freshness match-profile-freshness-${model.freshnessState}`), text("p", model.retentionLabel, "match-profile-retention"), refreshButton(onReload));
  const normalized = document.createElement("section");
  normalized.append(text("h4", "Normalized profile"));
  normalized.append(model.fields.length ? fieldList(model.fields) : text("p", "No normalized fields available yet."));
  if (model.photoUrls?.length) {
    const gallery = document.createElement("section");
    gallery.className = "match-profile-photo-gallery";
    gallery.append(text("h4","Photos visible on Tinder"));
    const images = document.createElement("div");
    images.className = "match-profile-photo-list";
    for (const url of model.photoUrls) {
      const img = document.createElement("img");
      img.src = url;
      img.alt = "Visible Tinder profile photo";
      img.loading = "lazy";
      img.referrerPolicy = "no-referrer";
      images.append(img);
    }
    gallery.append(images,text("p","These are Tinder photo links, not archived photo files. Links may expire.","subtle"));
    normalized.append(gallery);
  }
  const source = document.createElement("details");
  source.append(text("summary", model.sourceLabel));
  source.append(model.sourceFields.length ? fieldList(model.sourceFields) : text("p", "No visible source fields available."));
  root.append(header, normalized, source);
}

function renderState(root: HTMLElement, message: string, state: "loading" | "empty" | "error", onReload?: () => Promise<void>): void {
  root.replaceChildren(text("p", message, `match-profile-state match-profile-state-${state}`));
  if (onReload && state !== "loading") root.append(refreshButton(onReload));
}

/** Use the authenticated local binary archive, never expose auth tokens in image URLs. */
async function showArchivedProfilePhotos(
  root:HTMLElement, record:MatchProfileRecord, options:MatchProfilePanelOptions
): Promise<string[]> {
  const prefix=options.apiBase.replace(/\/$/,"") + "/api/v1/match-profiles/" + encodeURIComponent(record.id) + "/photos";
  const headers={authorization:"Bearer "+options.token};
  const listing=await fetch(prefix,{headers,cache:"no-store"});
  if(!listing.ok)return [];
  const data=await listing.json() as {photos?:Array<{id:string;mediaType:string}>};
  if(!Array.isArray(data.photos) || !data.photos.length)return [];
  const urls:string[]=[];
  const list=document.createElement("div");
  list.className="match-profile-photo-list";
  try {
    for(const photo of data.photos.slice(0,12)) {
      if(!/^[0-9a-f-]{36}$/i.test(photo.id))continue;
      const response=await fetch(prefix+"/"+photo.id,{headers,cache:"no-store"});
      if(!response.ok)continue;
      const blob=await response.blob();
      if(!["image/jpeg","image/png","image/webp","image/gif"].includes(blob.type))continue;
      const local=URL.createObjectURL(blob);
      urls.push(local);
      const img=document.createElement("img");
      img.src=local;img.loading="lazy";img.alt="Saved Tinder profile photo";
      img.referrerPolicy="no-referrer";
      list.append(img);
    }
    if(!root.isConnected || !urls.length) {
      urls.forEach(URL.revokeObjectURL);return [];
    }
    const gallery=root.querySelector<HTMLElement>(".match-profile-photo-gallery");
    if(gallery){
      gallery.replaceChildren(text("h4",urls.length+" photos saved privately in TNND"),list);
    }else{
      const section=document.createElement("section");
      section.className="match-profile-photo-gallery";
      section.append(text("h4",urls.length+" photos saved privately in TNND"),list);
      root.append(section);
    }
    return urls;
  } catch {
    urls.forEach(URL.revokeObjectURL);
    return [];
  }
}

export function createMatchProfilePanel(options: MatchProfilePanelOptions): MatchProfilePanel {
  let archivedBlobUrls: string[] = [];
  const root = document.createElement("section");
  root.className = "match-profile-panel";
  root.setAttribute("aria-live", "polite");

  const panel: MatchProfilePanel = {
    element: root,
    async load() {
      renderState(root, "Loading MatchProfile…", "loading");
      try {
        const record = await getConversationMatchProfile(options.apiBase, options.token, options.conversationId);
        if (record) {
          archivedBlobUrls.forEach(URL.revokeObjectURL);
          archivedBlobUrls=[];
          renderRecord(root,record,panel.load);
          archivedBlobUrls=await showArchivedProfilePhotos(root,record,options);
          return;
        }
        const temporary = options.temporaryProfile;
        if (temporary && temporary.normalizedProfile.retention.mode === "temporary" && !temporary.conversationId) {
          if (!canPromoteTemporaryMatchProfile(temporary)) {
            root.replaceChildren(text("p", "The available temporary Tinder capture has expired. Refresh it from Tinder before linking it to this conversation.", "match-profile-state match-profile-state-empty"), refreshButton(panel.load));
            return;
          }
          root.replaceChildren(text("p", "A temporary Tinder capture is available. Link it only if it belongs to this conversation.", "match-profile-state"));
          const promote = document.createElement("button");
          promote.type = "button";
          promote.textContent = "Link profile to this conversation";
          promote.title = "Promote this temporary capture to durable conversation-linked retention.";
          promote.addEventListener("click", async () => {
            if (!window.confirm("Link this temporary Tinder profile to the selected conversation? This makes its retention durable.")) return;
            promote.disabled = true;
            try {
              const linked = await promoteMatchProfile(options.apiBase, options.token, temporary.id, options.conversationId);
              renderRecord(root, linked, panel.load);
            } catch (error) {
              renderState(root, error instanceof MatchProfileApiError ? `Unable to link MatchProfile (${error.status}).` : "Unable to link MatchProfile.", "error", panel.load);
            }
          });
          root.append(promote, refreshButton(panel.load));
          return;
        }
        renderState(root, "No captured Tinder profile is linked to this conversation yet.", "empty", panel.load);
      } catch (error) {
        renderState(root, error instanceof MatchProfileApiError ? `Unable to load MatchProfile (${error.status}).` : "Unable to load MatchProfile.", "error", panel.load);
      }
    }
  };
  return panel;
}
