import { TinderAdapter } from "./tinder-adapter";
import type { GenerateRequest, GenerateResponse } from "./types";

const adapter = new TinderAdapter();
const HOST_ID = "tnnd-root";

function button(label: string, className = ""): HTMLButtonElement {
  const element = document.createElement("button");
  element.type = "button";
  element.textContent = label;
  element.className = className;
  return element;
}

function mount(): void {
  if (document.getElementById(HOST_ID)) return;

  const host = document.createElement("div");
  host.id = HOST_ID;
  const shadow = host.attachShadow({ mode: "open" });
  document.documentElement.appendChild(host);

  const style = document.createElement("style");
  style.textContent = `
    :host { all: initial; }
    .panel { position: fixed; right: 18px; bottom: 18px; z-index: 2147483647; width: 350px; max-height: min(560px, calc(100vh - 36px)); overflow: auto; border: 1px solid rgba(0,0,0,.12); border-radius: 16px; padding: 12px; background: rgba(255,255,255,.97); color: #171717; box-shadow: 0 16px 45px rgba(0,0,0,.18); font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    .header { display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:10px; }
    .title { font-size:15px; font-weight:800; }
    .subtitle { font-size:11px; color:#71717a; margin-top:2px; }
    .toolbar { display:flex; gap:7px; }
    button { appearance:none; border:0; border-radius:9px; cursor:pointer; font:inherit; font-weight:700; }
    .icon { width:32px; height:32px; background:#f4f4f5; }
    .actions { display:grid; grid-template-columns: 1fr auto; gap:8px; }
    .generate { padding:10px 12px; background:#171717; color:white; }
    .like { padding:10px 12px; background:#f4f4f5; color:#171717; }
    button:disabled { opacity:.5; cursor:default; }
    .status { min-height:18px; margin-top:8px; font-size:12px; color:#606068; }
    .suggestions { display:grid; gap:8px; margin-top:8px; }
    .suggestion { border:1px solid #e4e4e7; border-radius:11px; padding:10px; background:white; }
    .text { white-space:pre-wrap; font-size:13px; line-height:1.4; }
    .insert { margin-top:8px; padding:7px 9px; background:#f4f4f5; color:#171717; font-size:12px; }
    .note { margin-top:9px; font-size:10px; line-height:1.35; color:#8a8a92; }
  `;

  const panel = document.createElement("div");
  panel.className = "panel";

  const header = document.createElement("div");
  header.className = "header";
  const heading = document.createElement("div");
  heading.innerHTML = '<div class="title">TNND</div><div class="subtitle">Gemini reply copilot</div>';
  const toolbar = document.createElement("div");
  toolbar.className = "toolbar";
  const settings = button("⚙", "icon");
  settings.title = "Open TNND settings";
  settings.addEventListener("click", () => void chrome.runtime.openOptionsPage());
  toolbar.append(settings);
  header.append(heading, toolbar);

  const actions = document.createElement("div");
  actions.className = "actions";
  const generate = button("✨ Generate replies", "generate");
  const like = button("♡ Like once", "like");
  like.title = "Triggers one Like on the current visible profile";
  actions.append(generate, like);

  const status = document.createElement("div");
  status.className = "status";
  const suggestions = document.createElement("div");
  suggestions.className = "suggestions";
  const note = document.createElement("div");
  note.className = "note";
  note.textContent = "TNND inserts drafts only. Review before sending. The Like helper performs one user-triggered action and does not bypass Tinder limits.";

  generate.addEventListener("click", async () => {
    const context = adapter.getContextSnapshot();
    suggestions.replaceChildren();
    generate.disabled = true;
    status.textContent = context ? "Generating…" : "No Tinder context found on this page.";

    if (!context) {
      generate.disabled = false;
      return;
    }

    try {
      const request: GenerateRequest = { type: "GENERATE_SUGGESTIONS", context };
      const response = (await chrome.runtime.sendMessage(request)) as GenerateResponse;
      if (!response.ok || !response.suggestions?.length) throw new Error(response.error || "No suggestions returned.");

      for (const text of response.suggestions) {
        const card = document.createElement("div");
        card.className = "suggestion";
        const copy = document.createElement("div");
        copy.className = "text";
        copy.textContent = text;
        const insert = button("Insert draft", "insert");
        insert.addEventListener("click", () => {
          const inserted = adapter.insertDraft(text);
          status.textContent = inserted ? "Draft inserted — review it, then send yourself." : "Message box not found. Open a conversation and try again.";
        });
        card.append(copy, insert);
        suggestions.append(card);
      }
      status.textContent = `${response.suggestions.length} suggestion(s) ready.`;
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : "TNND could not generate replies.";
    } finally {
      generate.disabled = false;
    }
  });

  like.addEventListener("click", () => {
    const clicked = adapter.likeCurrentProfile();
    status.textContent = clicked ? "One Like triggered." : "Like button not found on the current screen.";
  });

  panel.append(header, actions, status, suggestions, note);
  shadow.append(style, panel);
}

mount();

const observer = new MutationObserver(() => {
  if (!document.getElementById(HOST_ID)) mount();
});
observer.observe(document.documentElement, { childList: true, subtree: true });
