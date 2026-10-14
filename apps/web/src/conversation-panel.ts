import { readSession } from "./auth-client";
import {
  clearTemporaryInstruction,
  getConversation,
  listConversations,
  saveTemporaryInstruction,
  saveConversationDisplayIdentity,
  updateConversationStatus,
  type ConversationDetail,
  type TemporaryInstructionScope
} from "./conversation-client";
import type { ConversationListItem, ConversationStatus } from "./conversation-contract";
import { filterConversationSummaries } from "./conversation-list-filter";
import { conversationEmptyState, hasConversationFilters, isCurrentConversationResponse } from "./conversation-list-ui";
import { replyTargetFromHistory, replyTargetHint } from "./conversation-reply-target";

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;"
  })[char] ?? char);
}

function formatDate(value?: string | null): string {
  if (!value) return "No messages yet";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unknown date" : date.toLocaleString();
}

function matchLabel(displayName: string, age?: number | null): string {
  const name = displayName.startsWith("Conversation ") ? "Match name not yet synced" : displayName;
  return `${name}${age ? ` ${age}` : ""}`;
}

function matchAvatar(displayName: string, photoUrl?: string | null): string {
  const initial = displayName.startsWith("Conversation ") ? "●" : displayName[0]?.toUpperCase() ?? "●";
  return `<span class="conversation-person-avatar" aria-hidden="true">${photoUrl ? `<img src="${escapeHtml(photoUrl)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : escapeHtml(initial)}</span>`;
}

function renderList(items: ConversationListItem[], total: number, filtered: boolean, selectedId?: string): string {
  if (!items.length) {
    const empty = conversationEmptyState(total, filtered);
    return `<div class="conversation-empty workspace-empty" role="status"><strong>${escapeHtml(empty.heading)}</strong><p>${escapeHtml(empty.guidance)}</p></div>`;
  }
  return items.map((item) => `
    <button type="button" class="conversation-row${item.id === selectedId ? " selected" : ""}" data-conversation-id="${escapeHtml(item.id)}" aria-pressed="${item.id === selectedId}">
      <span class="conversation-row-main">
        <span class="conversation-person-line">${matchAvatar(item.displayName, item.matchPhotoUrl)}<strong>${escapeHtml(matchLabel(item.displayName, item.matchAge))}</strong></span>
        <small>${escapeHtml(item.currentTopic ?? "No topic yet")}</small>
      </span>
      <span class="conversation-row-meta">
        <span class="pill">${escapeHtml(item.status)}</span>
        ${item.status === "active" && item.lastMessageDirection === "incoming" ? '<span class="pill">Reply waiting</span>' : ""}
        <small>${escapeHtml(formatDate(item.lastMessageAt))}</small>
      </span>
    </button>
  `).join("");
}

function renderStatusActions(detail: ConversationDetail): string {
  const actions: Array<{ label: string; status: ConversationStatus; danger?: boolean }> = [];
  if (detail.status === "paused" || detail.status === "disabled") {
    actions.push({ label: "Resume", status: "active" });
  } else {
    actions.push({ label: "Pause", status: "paused" });
  }
  if (detail.status !== "disabled") actions.push({ label: "Disable", status: "disabled", danger: true });
  return actions.map((action) => `
    <button type="button" class="conversation-status-action${action.danger ? " danger" : ""}" data-conversation-status-action="${action.status}">${action.label}</button>
  `).join("");
}

function renderTemporaryInstruction(detail: ConversationDetail): string {
  const instruction = detail.temporaryInstruction;
  const scope = instruction?.scope ?? "next-message";
  const remaining = instruction?.remainingReplies ?? 3;
  return `
    <section class="temporary-instruction-panel" aria-label="Temporary conversation instruction">
      <div class="temporary-instruction-heading">
        <div>
          <strong>Temporary instruction</strong>
          <small>Short-lived steering for this conversation only.</small>
        </div>
        ${instruction ? '<span class="pill">Active</span>' : '<span class="pill">None</span>'}
      </div>
      <label class="temporary-instruction-label" for="conversation-temporary-instruction">Instruction for this conversation</label>
      <textarea id="conversation-temporary-instruction" aria-describedby="conversation-temporary-instruction-help" maxlength="2000" placeholder="Example: be more direct now, change subject, keep the next replies shorter…">${escapeHtml(instruction?.text ?? "")}</textarea>
      <small id="conversation-temporary-instruction-help" class="subtle">Affects future AI-generated replies in this chat only. It does not change saved messages.</small>
      <div class="temporary-instruction-controls">
        <label>Scope
          <select id="conversation-temporary-instruction-scope">
            <option value="next-message"${scope === "next-message" ? " selected" : ""}>Next message</option>
            <option value="next-n-replies"${scope === "next-n-replies" ? " selected" : ""}>Next N replies</option>
            <option value="until-cleared"${scope === "until-cleared" ? " selected" : ""}>Until cleared</option>
          </select>
        </label>
        <label>Replies
          <input id="conversation-temporary-instruction-replies" type="number" min="1" max="50" value="${remaining}"${scope === "next-n-replies" ? "" : " disabled"}>
        </label>
      </div>
      <div class="temporary-instruction-actions">
        <button type="button" data-temporary-instruction-save>Save instruction</button>
        ${instruction ? '<button type="button" class="danger" data-temporary-instruction-clear>Clear</button>' : ""}
      </div>
      <p class="subtle" data-temporary-instruction-status role="status" aria-live="polite">${instruction ? `Current scope: ${escapeHtml(scope)}${instruction.remainingReplies ? ` · ${instruction.remainingReplies} remaining` : ""}` : "No temporary instruction is active."}</p>
    </section>
  `;
}

function topicLabel(topic: { topic: string; subtopic?: string }): string {
  return topic.subtopic ? `${topic.topic} / ${topic.subtopic}` : topic.topic;
}

function renderTopicState(detail: ConversationDetail): string {
  const { primaryTopic, secondaryTopics, recentTopics } = detail.topicState;
  if (!primaryTopic && !secondaryTopics.length && !recentTopics.length) {
    return `
      <section class="conversation-topic-panel" aria-label="Topic Engine state">
        <div class="conversation-topic-heading"><strong>Topic Engine</strong><span class="pill">Waiting</span></div>
        <p class="subtle">Structured topics will appear after enough conversation context is synchronized.</p>
      </section>
    `;
  }
  const secondary = secondaryTopics.length
    ? secondaryTopics.map((topic) => `<span class="conversation-topic-chip">${escapeHtml(topicLabel(topic))}</span>`).join("")
    : '<span class="subtle">No secondary topics.</span>';
  const recent = recentTopics.slice(0, 5).map((topic) => escapeHtml(topicLabel(topic))).join(" · ");
  const confidence = primaryTopic ? `${Math.round(primaryTopic.confidence * 100)}% confidence` : "No primary topic";
  return `
    <section class="conversation-topic-panel" aria-label="Topic Engine state">
      <div class="conversation-topic-heading">
        <div><strong>Topic Engine</strong><small>Based on synchronized conversation history</small></div>
        <span class="pill">${escapeHtml(confidence)}</span>
      </div>
      <div class="conversation-topic-primary">
        <small>Primary topic</small>
        <strong>${primaryTopic ? escapeHtml(topicLabel(primaryTopic)) : "Not established"}</strong>
        ${primaryTopic?.messageCount ? `<small>${primaryTopic.messageCount} observed messages</small>` : ""}
      </div>
      <div>
        <small>Secondary topics</small>
        <div class="conversation-topic-chips">${secondary}</div>
      </div>
      ${recent ? `<p class="conversation-topic-recent"><small>Recent: ${recent}</small></p>` : ""}
    </section>
  `;
}

function renderConversationFlow(detail: ConversationDetail): string {
  const flow = detail.conversationFlow;
  if (!flow) {
    // An older API response does not contain conversationFlow. Never hide
    // the panel silently, otherwise a freshly updated Web looks broken.
    return '<section class="conversation-flow-panel" aria-label="Conversation Flow">'
      + '<div class="conversation-topic-heading"><strong>Conversation Flow</strong><span class="pill">Indisponible</span></div>'
      + '<p class="subtle">Les étapes ne sont pas disponibles pour cette conversation. Vérifie que l’API TNND et le Web sont tous les deux à jour (version 0.2.18 ou supérieure), puis redémarre l’API et actualise la page.</p>'
      + '<p class="subtle">Si le problème continue, contrôle la réponse de GET /api/v1/conversations/{id} : elle doit contenir le champ conversationFlow.</p>'
      + '</section>';
  }
  const labels: Record<string, string> = {
    greeting: "Salutation", "check-in": "Prendre des nouvelles",
    location: "Ville / origine", occupation: "Quotidien / travail",
    interests: "Centres d'intérêt", "free-conversation": "Discussion libre"
  };
  const steps = flow.stages.map(step => {
    const status = step.status === "covered" ? "✓" : step.status === "next" ? "→" : "·";
    const extra = step.reason === "known" || step.reason === "mentioned" ? " (déjà connu)" : step.reason === "asked" ? " (déjà abordé)" : "";
    return '<li class="conversation-flow-step" data-flow-status="' + escapeHtml(step.status) + '"><span aria-hidden="true">' + status + '</span><span>' + escapeHtml(labels[step.id] ?? step.id) + escapeHtml(extra) + '</span></li>';
  }).join("");
  const known = flow.known.length
    ? flow.known.map(fact => '<span class="conversation-topic-chip">' + escapeHtml(fact.key) + ' : ' + escapeHtml(fact.value) + '</span>').join("")
    : '<span class="subtle">Aucune information confirmée.</span>';
  return '<section class="conversation-flow-panel" aria-label="Conversation Flow"><div class="conversation-topic-heading"><strong>Conversation Flow</strong><span class="pill">Adaptatif</span></div>'
    + '<p class="subtle">Progression indicative, pas un questionnaire. Les réponses du match passent toujours en priorité.</p>'
    + '<ol class="conversation-flow-steps">' + steps + '</ol>'
    + (flow.respondToLatestFirst ? '<p class="subtle">Le match a posé une question : y répondre avant de changer de sujet.</p>' : '')
    + '<p class="subtle">Informations connues du match</p><div class="conversation-topic-chips">' + known + '</div></section>';
}

function renderMatchScreening(detail: ConversationDetail): string {
  const screening = detail.matchScreening;
  if (!screening) return "";
  const label = screening.action === "pause" ? "Pause demandée"
    : screening.action === "clarify" ? "À clarifier" : "Aucun blocage";
  const intent: Record<string, string> = {
    marriage: "Mariage", casual: "Relation occasionnelle",
    "long-term": "Relation durable (mariage non confirmé)", unknown: "Inconnue"
  };
  const guidance = screening.action === "clarify"
    ? "Demander ce que la personne recherche réellement avant d'en tirer une conclusion."
    : screening.action === "pause" ? "Règle configurée déclenchée : ne pas envoyer de réponse automatique."
    : "Poursuivre uniquement si les préférences et autorisations le permettent.";
  return '<section class="conversation-flow-panel" aria-label="Match screening"><div class="conversation-topic-heading">'
    + '<strong>Intentions et règles du match</strong><span class="pill">' + escapeHtml(label) + '</span></div>'
    + '<p>Intention détectée : ' + escapeHtml(intent[screening.intent] ?? "Inconnue")
    + '</p><p class="subtle">' + escapeHtml(guidance) + '</p>'
    + (screening.heightCm ? '<p class="subtle">Taille enregistrée : ' + screening.heightCm + ' cm</p>' : '')
    + '<small class="subtle">Source : ' + escapeHtml(screening.evidence === "visible-profile" ? "Profil Tinder enregistré" : screening.evidence === "incoming-message" ? "Message reçu" : "Aucune information confirmée") + '</small></section>';
}
function renderDetail(detail: ConversationDetail): string {
  const messages = detail.messages.length
    ? detail.messages.map((message) => `
      <div class="conversation-message ${message.direction}">
        <span>${message.direction === "incoming" ? "Them" : "You"}</span>
        <p>${escapeHtml(message.text)}</p>
        <small>${escapeHtml(formatDate(message.sentAt))}</small>
      </div>
    `).join("")
    : '<p class="subtle">No messages synchronized for this conversation yet.</p>';

  return `
    <div class="conversation-detail-heading">
      ${matchAvatar(detail.displayName, detail.matchPhotoUrl)}
      <div>
        <strong>${escapeHtml(matchLabel(detail.displayName, detail.matchAge))}</strong>
        <small>${escapeHtml(detail.currentTopic ?? "No current topic")}</small>
      </div>
      <span class="pill">${escapeHtml(detail.status)}</span>
    </div>
    <details class="conversation-identity-editor">
      <summary>${detail.displayName.startsWith("Conversation ") ? "Tinder identity not yet detected" : "Advanced · Override chat identity"} <span class="subtle">(optional)</span></summary>
      <p class="subtle">The extension automatically reads the name, age and avatar from the matching visible Tinder conversation when available. Open this chat on Tinder with the extension running, then refresh TNND Web. Manual override below is an optional fallback and does not change Tinder.</p>
      <div class="conversation-identity-controls">
        <label for="conversation-display-name">Name <input id="conversation-display-name" maxlength="80" autocomplete="off" placeholder="e.g. Sara" value="${escapeHtml(detail.userDisplayLabel ?? "")}"></label>
        <label for="conversation-display-age">Age <input id="conversation-display-age" type="number" min="18" max="120" placeholder="Optional" value="${detail.userDisplayAge ?? ""}"></label>
        <button type="button" data-save-conversation-identity>Save match name</button>
      </div>
      <p data-conversation-identity-status class="subtle" role="status"></p>
    </details>
    <details class="conversation-status-help"><summary>What do Synced, Unmanaged and Paused mean?</summary><p><strong>Synced</strong>: history is saved in TNND, not necessarily live. <strong>Unmanaged</strong>: AI has not been authorized to control the Tinder chat. <strong>Paused</strong>: server-side automation is stopped. Draft previews remain manual and do not send anything.</p><p>To allow AI to manage this chat, choose <strong>AI managed</strong> in Conversation management, confirm it, then Resume this chat. Separately enable automation for this chat and globally in the extension. Test generated drafts before allowing sends.</p><a href="#conversation-management-panel">Open conversation management →</a></details>
    <div class="conversation-status-actions" aria-label="Conversation controls">
      ${renderStatusActions(detail)}
    </div>
    <section class="conversation-messages" aria-label="Saved conversation history">
      <h3 class="conversation-message-heading">Message history</h3>
      ${messages}
    </section>
    <details class="conversation-secondary-section"${detail.temporaryInstruction ? " open" : ""}>
      <summary>Temporary instruction${detail.temporaryInstruction ? " · Active" : ""} <span class="subtle">(advanced)</span></summary>
      ${renderTemporaryInstruction(detail)}
    </details>
    <details class="conversation-secondary-section">
      <summary>Conversation topics and progress <span class="subtle">(advanced)</span></summary>
      ${renderTopicState(detail)}
      ${renderConversationFlow(detail)}
      ${renderMatchScreening(detail)}
    </details>
  `;
}

function countStatus(items: ConversationListItem[], status: ConversationStatus): number {
  return items.filter((item) => item.status === status).length;
}

function renderOperationalSummary(items: ConversationListItem[]): string {
  const cards: Array<{ label: string; value: number }> = [
    { label: "Active", value: countStatus(items, "active") },
    { label: "Waiting for them", value: countStatus(items, "waiting-for-them") },
    { label: "Waiting for you", value: countStatus(items, "waiting-for-user") },
    { label: "Action required", value: countStatus(items, "action-required") },
    { label: "Paused", value: countStatus(items, "paused") }
  ];
  return cards.map((card) => `
    <div class="conversation-stat">
      <strong>${card.value}</strong>
      <span>${escapeHtml(card.label)}</span>
    </div>
  `).join("");
}

function installStyles(): void {
  if (document.querySelector("#tnnd-conversation-panel-styles")) return;
  const style = document.createElement("style");
  style.id = "tnnd-conversation-panel-styles";
  style.textContent = `
    .conversation-stats{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px;margin-top:12px}.conversation-stat{display:grid;gap:2px;padding:9px 10px;border:1px solid var(--border,#d4d4d8);border-radius:10px;background:rgba(127,127,127,.05)}.conversation-stat strong{font-size:18px}.conversation-stat span{font-size:10px;opacity:.7}
    .conversation-toolbar{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:12px;flex-wrap:wrap}.conversation-filter{display:flex;align-items:center;gap:7px;font-size:12px}.conversation-filter select{width:auto;min-width:170px}.conversation-summary{font-size:11px;opacity:.7}.conversation-clear-filters{width:auto;min-height:44px;padding:8px 12px;border:1px solid var(--nb-border,#c8d8cd);color:var(--nb-primary,#264b40);background:var(--nb-surface,#fff);border-radius:10px}.conversation-empty{display:grid;gap:8px;padding:16px;border:1px dashed var(--nb-border,#c8d8cd);border-radius:12px;background:var(--nb-surface-soft,#edf4eb)}.conversation-empty p{margin:0;line-height:1.5}
    .conversation-layout{display:grid;grid-template-columns:minmax(220px,.9fr) minmax(280px,1.1fr);gap:14px;margin-top:14px}
    .conversation-identity-editor{margin:0 0 12px;padding:10px 13px;border:1px solid var(--border,#d4d4d8);border-radius:10px;background:var(--nb-surface-soft,#edf4eb)}.conversation-identity-editor summary{cursor:pointer;font-size:12px;font-weight:750}.conversation-identity-editor>p{font-size:12px;line-height:1.5}.conversation-identity-controls{display:flex;align-items:flex-end;flex-wrap:wrap;gap:9px}.conversation-identity-controls label{display:grid;gap:5px;flex:1 1 130px;font-size:12px}.conversation-identity-controls label:nth-child(2){flex:0 1 115px}.conversation-identity-controls input{min-width:0;max-width:100%}.conversation-identity-controls button{max-width:100%;width:auto;white-space:normal}
    .conversation-person-line{display:flex;align-items:center;gap:9px;min-width:0}.conversation-person-line strong{min-width:0;overflow-wrap:anywhere} .conversation-person-avatar{display:inline-grid;flex:0 0 40px;place-items:center;width:40px;height:40px;background:var(--nb-mint,#d9efcc);color:var(--nb-primary,#264b40);border-radius:50%;font-weight:800;overflow:hidden}.conversation-person-avatar img{display:block;width:100%;height:100%;object-fit:cover}.conversation-detail-heading>.conversation-person-avatar{width:48px;height:48px;flex-basis:48px}.conversation-status-help{margin:0 0 12px;padding:10px 13px;border:1px solid var(--border,#d4d4d8);border-radius:10px;background:var(--nb-surface-soft,#edf4eb)}.conversation-status-help summary{cursor:pointer;font-size:12px;font-weight:750}.conversation-status-help p{font-size:12px;line-height:1.55}.conversation-status-help a{font-size:12px;font-weight:750;color:inherit;text-decoration:underline}
    .conversation-flow-panel{border:1px solid var(--border,#d4d4d8);border-radius:12px;padding:13px;margin:12px 0;background:var(--nb-surface-soft,#edf4eb)}.conversation-flow-panel .conversation-topic-heading{display:flex;justify-content:space-between}.conversation-flow-steps{display:grid;gap:8px;margin:12px 0;padding:0;list-style:none}.conversation-flow-step{display:flex;gap:9px;align-items:center;font-size:12px}.conversation-flow-step[data-flow-status="covered"]{opacity:.65}.conversation-flow-step[data-flow-status="next"]{font-weight:750}.conversation-flow-panel .conversation-topic-chips{display:flex;flex-wrap:wrap;gap:6px}
    .conversation-list{display:grid;gap:8px;align-content:start;max-height:430px;overflow:auto}
    .conversation-row{width:100%;display:flex;justify-content:space-between;gap:12px;text-align:left;padding:11px;border:1px solid var(--border,#d4d4d8);border-radius:10px;background:transparent;color:inherit;cursor:pointer}
    .conversation-row:hover{border-color:currentColor}.conversation-row.selected{outline:2px solid currentColor;outline-offset:1px}.conversation-row-main,.conversation-row-meta{display:grid;gap:4px}.conversation-row-meta{text-align:right;justify-items:end}.conversation-row small,.conversation-detail small,.conversation-message small{opacity:.65}
    .conversation-detail{min-height:180px;border:1px solid var(--border,#d4d4d8);border-radius:12px;padding:12px}.conversation-detail-heading{display:flex;justify-content:space-between;gap:12px;margin-bottom:10px}.conversation-detail-heading>div{display:grid;gap:4px}
    .conversation-status-actions{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px}.conversation-status-action{width:auto;padding:7px 10px;border:1px solid var(--border,#d4d4d8);border-radius:8px;background:transparent;color:inherit;cursor:pointer}.conversation-status-action:hover{border-color:currentColor}.conversation-status-action.danger{border-style:dashed}.conversation-status-action:disabled{opacity:.55;cursor:wait}
    .conversation-topic-panel{display:grid;gap:9px;padding:11px;margin-bottom:12px;border:1px solid var(--border,#d4d4d8);border-radius:10px;background:rgba(127,127,127,.04)}.conversation-topic-heading{display:flex;align-items:start;justify-content:space-between;gap:10px}.conversation-topic-heading>div,.conversation-topic-primary{display:grid;gap:3px}.conversation-topic-chips{display:flex;gap:6px;flex-wrap:wrap;margin-top:5px}.conversation-topic-chip{display:inline-flex;padding:4px 7px;border:1px solid var(--border,#d4d4d8);border-radius:999px;font-size:11px}.conversation-topic-recent{margin:0}
    .temporary-instruction-panel{display:grid;gap:9px;padding:11px;margin-bottom:12px;border:1px solid var(--border,#d4d4d8);border-radius:10px;background:rgba(127,127,127,.04)}.temporary-instruction-heading{display:flex;align-items:start;justify-content:space-between;gap:10px}.temporary-instruction-heading>div{display:grid;gap:3px}.temporary-instruction-panel textarea{width:100%;min-height:74px;resize:vertical}.temporary-instruction-controls{display:grid;grid-template-columns:1fr 110px;gap:8px}.temporary-instruction-controls label{display:grid;gap:4px;font-size:11px}.temporary-instruction-controls select,.temporary-instruction-controls input{width:100%}.temporary-instruction-actions{display:flex;gap:8px}.temporary-instruction-actions button{width:auto;padding:7px 10px;border:1px solid var(--border,#d4d4d8);border-radius:8px;background:transparent;color:inherit;cursor:pointer}.temporary-instruction-actions .danger{border-style:dashed}.temporary-instruction-actions button:disabled{opacity:.55;cursor:wait}
    .conversation-messages{display:grid;gap:8px;max-height:340px;overflow:auto}.conversation-message-heading{margin:0 0 4px;font-size:14px;line-height:1.4}.conversation-secondary-section{margin-top:12px;border:1px solid var(--nb-border,#c8d8cd);border-radius:12px;padding:0 10px;background:var(--nb-surface,#fff)}.conversation-secondary-section>summary{min-height:44px;cursor:pointer;font-size:13px;font-weight:750;padding:12px 4px;line-height:1.4}.conversation-secondary-section>summary:focus-visible{outline:3px solid var(--nb-focus,#7565de);outline-offset:2px}.conversation-secondary-section[open]{padding-bottom:10px}.conversation-secondary-section .conversation-topic-panel,.conversation-secondary-section .conversation-flow-panel,.conversation-secondary-section .temporary-instruction-panel{margin:8px 0}.conversation-message{max-width:86%;padding:9px 10px;border-radius:10px;background:rgba(127,127,127,.12)}.conversation-message.outgoing{justify-self:end}.conversation-message.incoming{justify-self:start}.conversation-message span{font-size:10px;font-weight:700;opacity:.7}.conversation-message p{margin:3px 0 4px;white-space:pre-wrap}
    @media(max-width:760px){.conversation-layout{grid-template-columns:1fr}.conversation-stats{grid-template-columns:repeat(2,minmax(0,1fr))}.temporary-instruction-controls{grid-template-columns:1fr}}
  `;
  document.head.append(style);
}

function mount(): { list: HTMLElement; detail: HTMLElement; status: HTMLElement; filter: HTMLSelectElement; search: HTMLInputElement; clearFilters: HTMLButtonElement; summary: HTMLElement; stats: HTMLElement } | null {
  const grid = document.querySelector<HTMLElement>(".grid");
  if (!grid) return null;
  installStyles();
  const panel = document.createElement("article");
  panel.className = "panel panel-wide workspace-feature";
  panel.id = "conversation-panel";
  panel.innerHTML = `
    <div class="panel-heading">
      <div><p class="eyebrow">Conversations</p><h2>Conversation control center</h2></div>
      <span class="pill" id="conversation-panel-status">Sign in required</span>
    </div>
    <p class="subtle">Synced Tinder conversations from the backend. Select one to inspect its current status, topic and message history.</p>
    <div id="conversation-operational-summary" class="conversation-stats"></div>
    <div class="conversation-toolbar" role="search" aria-label="Find conversations">
      <label class="conversation-search-label" for="conversation-search">Search
        <input id="conversation-search" type="search" autocomplete="off" placeholder="Name or topic…" aria-label="Search conversations by name or topic" />
      </label>
      <label class="conversation-filter">Status
        <select id="conversation-status-filter">
          <option value="all">All conversations</option>
          <option value="active">Active</option>
          <option value="waiting-for-them">Waiting for them</option>
          <option value="waiting-for-user">Waiting for user</option>
          <option value="action-required">Action required</option>
          <option value="paused">Paused</option>
          <option value="disabled">Disabled</option>
          <option value="moved-off-tinder">Moved off Tinder</option>
          <option value="stale">Stale</option>
          <option value="archived">Archived</option>
        </select>
      </label>
      <button id="conversation-clear-filters" class="conversation-clear-filters" type="button" hidden>Clear filters</button>
      <span id="conversation-filter-summary" class="conversation-summary" role="status" aria-live="polite"></span>
    </div>
    <div class="conversation-layout">
      <div id="conversation-list" class="conversation-list" aria-label="Conversations"></div>
      <div id="conversation-detail" class="conversation-detail"><p class="subtle">Select a conversation.</p></div>
    </div>
  `;
  grid.prepend(panel);
  return {
    list: panel.querySelector<HTMLElement>("#conversation-list")!,
    detail: panel.querySelector<HTMLElement>("#conversation-detail")!,
    status: panel.querySelector<HTMLElement>("#conversation-panel-status")!,
    filter: panel.querySelector<HTMLSelectElement>("#conversation-status-filter")!,
    search: panel.querySelector<HTMLInputElement>("#conversation-search")!,
    clearFilters: panel.querySelector<HTMLButtonElement>("#conversation-clear-filters")!,
    summary: panel.querySelector<HTMLElement>("#conversation-filter-summary")!,
    stats: panel.querySelector<HTMLElement>("#conversation-operational-summary")!
  };
}

const elements = mount();
let cachedItems: ConversationListItem[] = [];
let selectedConversationId: string | undefined;
let detailRequestSequence = 0;
let refreshRequestSequence = 0;
let displayedSessionToken: string | null = null;

/** TNND Web sorting uses synchronized direction, not Tinder sidebar position. */
export function prioritizeWaitingReplies(items: readonly ConversationListItem[]): ConversationListItem[] {
  const priority = (item: ConversationListItem): number => item.status === "active"
    && item.lastMessageDirection === "incoming" ? 2 : item.status === "waiting-for-user" ? 1 : 0;
  return [...items].sort((a, b) =>
    priority(b) - priority(a)
    || (Date.parse(b.lastMessageAt ?? "") || 0) - (Date.parse(a.lastMessageAt ?? "") || 0)
    || a.id.localeCompare(b.id));
}

function filteredItems(): ConversationListItem[] {
  return prioritizeWaitingReplies(filterConversationSummaries(cachedItems, {
    status: (elements?.filter.value ?? "all") as ConversationStatus | "all",
    query: elements?.search.value ?? ""
  }));
}

function bindRows(items: ConversationListItem[]): void {
  if (!elements) return;
  elements.list.querySelectorAll<HTMLElement>("[data-conversation-id]").forEach((row) => {
    row.addEventListener("click", () => {
      const id = row.dataset.conversationId;
      if (!id) return;
      selectedConversationId = id;
      renderCurrentList();
      void loadDetail(id);
    });
  });
  if (selectedConversationId && !items.some((item) => item.id === selectedConversationId)) {
    selectedConversationId = undefined;
    elements.detail.innerHTML = '<p class="subtle">Select a conversation.</p>';
  }
}

function renderCurrentList(): void {
  if (!elements) return;
  const items = filteredItems();
  const filtered = hasConversationFilters(elements.search.value, elements.filter.value);
  elements.list.innerHTML = renderList(items, cachedItems.length, filtered, selectedConversationId);
  elements.clearFilters.hidden = !filtered;
  elements.summary.textContent = `${items.length} shown · ${cachedItems.length} total`;
  elements.stats.innerHTML = renderOperationalSummary(cachedItems);
  bindRows(items);
}

async function applyStatus(conversationId: string, status: ConversationStatus): Promise<void> {
  if (!elements) return;
  const session = readSession();
  if (!session) return;
  const buttons = Array.from(elements.detail.querySelectorAll<HTMLButtonElement>("[data-conversation-status-action]"));
  buttons.forEach((button) => { button.disabled = true; });
  try {
    await updateConversationStatus(session, conversationId, status);
    cachedItems = cachedItems.map((item) => item.id === conversationId ? { ...item, status } : item);
    renderCurrentList();
    await loadDetail(conversationId);
  } catch (error) {
    elements.detail.insertAdjacentHTML("afterbegin", `<p class="subtle">${escapeHtml(error instanceof Error ? error.message : "Unable to update conversation status.")}</p>`);
    buttons.forEach((button) => { button.disabled = false; });
  }
}

function bindDisplayIdentityActions(conversationId: string): void {
  if (!elements) return;
  const save = elements.detail.querySelector<HTMLButtonElement>("[data-save-conversation-identity]");
  const name = elements.detail.querySelector<HTMLInputElement>("#conversation-display-name");
  const age = elements.detail.querySelector<HTMLInputElement>("#conversation-display-age");
  const status = elements.detail.querySelector<HTMLElement>("[data-conversation-identity-status]");
  if (!save || !name || !age || !status) return;
  save.addEventListener("click", () => {
    void (async () => {
      const session = readSession();
      if (!session) throw new Error("Sign in first.");
      const label = name.value.replace(/\\s+/g, " ").trim();
      const numericAge = age.value.trim() ? Number(age.value) : null;
      if (label.length > 80 || (numericAge !== null && (!Number.isInteger(numericAge) || numericAge < 18 || numericAge > 120))) {
        throw new Error("Enter a name under 80 characters and an optional age between 18 and 120.");
      }
      save.disabled = true;
      status.textContent = "Saving…";
      await saveConversationDisplayIdentity(session, conversationId, label, numericAge);
      status.textContent = "Saved.";
      await refresh();
    })().catch(error => {
      status.textContent = error instanceof Error ? error.message : "Unable to save the name.";
    }).finally(() => { save.disabled = false; });
  });
}

function bindStatusActions(conversationId: string): void {
  if (!elements) return;
  elements.detail.querySelectorAll<HTMLButtonElement>("[data-conversation-status-action]").forEach((button) => {
    button.addEventListener("click", () => {
      const nextStatus = button.dataset.conversationStatusAction as ConversationStatus | undefined;
      if (nextStatus) void applyStatus(conversationId, nextStatus);
    });
  });
}

function bindTemporaryInstructionActions(conversationId: string): void {
  if (!elements) return;
  const scope = elements.detail.querySelector<HTMLSelectElement>("#conversation-temporary-instruction-scope");
  const replies = elements.detail.querySelector<HTMLInputElement>("#conversation-temporary-instruction-replies");
  const text = elements.detail.querySelector<HTMLTextAreaElement>("#conversation-temporary-instruction");
  const status = elements.detail.querySelector<HTMLElement>("[data-temporary-instruction-status]");
  const save = elements.detail.querySelector<HTMLButtonElement>("[data-temporary-instruction-save]");
  const clear = elements.detail.querySelector<HTMLButtonElement>("[data-temporary-instruction-clear]");
  if (!scope || !replies || !text || !status || !save) return;

  const syncRepliesAvailability = () => {
    replies.disabled = scope.value !== "next-n-replies";
  };
  scope.addEventListener("change", syncRepliesAvailability);
  syncRepliesAvailability();

  save.addEventListener("click", () => {
    void (async () => {
      const session = readSession();
      if (!session) return;
      const trimmed = text.value.trim();
      const selectedScope = scope.value as TemporaryInstructionScope;
      const remainingReplies = Number(replies.value);
      if (!trimmed) {
        status.textContent = "Enter an instruction before saving.";
        return;
      }
      if (selectedScope === "next-n-replies" && (!Number.isInteger(remainingReplies) || remainingReplies < 1 || remainingReplies > 50)) {
        status.textContent = "Replies must be an integer between 1 and 50.";
        return;
      }
      save.disabled = true;
      if (clear) clear.disabled = true;
      status.textContent = "Saving temporary instruction…";
      try {
        await saveTemporaryInstruction(session, conversationId, {
          text: trimmed,
          scope: selectedScope,
          ...(selectedScope === "next-n-replies" ? { remainingReplies } : {})
        });
        await loadDetail(conversationId);
      } catch (error) {
        status.textContent = error instanceof Error ? error.message : "Unable to save temporary instruction.";
        save.disabled = false;
        if (clear) clear.disabled = false;
      }
    })();
  });

  clear?.addEventListener("click", () => {
    void (async () => {
      const session = readSession();
      if (!session) return;
      save.disabled = true;
      clear.disabled = true;
      status.textContent = "Clearing temporary instruction…";
      try {
        await clearTemporaryInstruction(session, conversationId);
        await loadDetail(conversationId);
      } catch (error) {
        status.textContent = error instanceof Error ? error.message : "Unable to clear temporary instruction.";
        save.disabled = false;
        clear.disabled = false;
      }
    })();
  });
}

async function loadDetail(conversationId: string): Promise<void> {
  if (!elements) return;
  const session = readSession();
  if (!session) return;
  const requestId = ++detailRequestSequence;
  elements.detail.innerHTML = '<p class="subtle" role="status">Loading conversation…</p>';
  try {
    const detail = await getConversation(session, conversationId);
    if (!isCurrentConversationResponse(requestId, detailRequestSequence, session.token, readSession()?.token) || selectedConversationId !== conversationId) return;
    elements.detail.innerHTML = renderDetail(detail);
    // The draft editor is mounted lazily after the detail DOM changes.
    // Keep the live reply target on its owning detail node, never in storage.
    elements.detail.dataset.replyTarget = replyTargetFromHistory(detail.messages) ?? "";
    elements.detail.dataset.replyTargetHint = replyTargetHint(detail.messages);
    bindDisplayIdentityActions(conversationId);
    bindStatusActions(conversationId);
    bindTemporaryInstructionActions(conversationId);
  } catch (error) {
    if (!isCurrentConversationResponse(requestId, detailRequestSequence, session.token, readSession()?.token) || selectedConversationId !== conversationId) return;
    elements.detail.innerHTML = `<p class="subtle">${escapeHtml(error instanceof Error ? error.message : "Unable to load conversation.")}</p>`;
  }
}

async function refresh(): Promise<void> {
  if (!elements) return;
  const requestId = ++refreshRequestSequence;
  const session = readSession();

  // Never display previous-account data while a fresh session is loading.
  if ((session?.token ?? null) !== displayedSessionToken) {
    displayedSessionToken = session?.token ?? null;
    cachedItems = [];
    selectedConversationId = undefined;
    ++detailRequestSequence;
    elements.search.value = "";
    elements.filter.value = "all";
    elements.clearFilters.hidden = true;
    elements.summary.textContent = "";
    elements.stats.innerHTML = "";
    elements.list.innerHTML = '<p class="subtle" role="status">Loading conversations…</p>';
    elements.detail.innerHTML = '<p class="subtle">Select a conversation to view its details.</p>';
  }

  if (!session) {
    ++detailRequestSequence;
    cachedItems = [];
    selectedConversationId = undefined;
    elements.status.textContent = "Sign in required";
    elements.summary.textContent = "";
    elements.stats.innerHTML = "";
    elements.list.innerHTML = '<p class="subtle">Sign in to TNND to view your synced conversations.</p>';
    elements.detail.innerHTML = '<p class="subtle">Conversation details will appear after sign-in.</p>';
    return;
  }

  elements.status.textContent = "Loading…";
  try {
    const items = await listConversations(session);
    if (!isCurrentConversationResponse(requestId, refreshRequestSequence, session.token, readSession()?.token)) return;
    cachedItems = items;
    window.dispatchEvent(new CustomEvent("tnnd:conversation-updated"));
    elements.status.textContent = `${cachedItems.length} synced`;
    const visible = filteredItems();
    if (!selectedConversationId && visible[0]) selectedConversationId = visible[0].id;
    renderCurrentList();
    if (selectedConversationId) void loadDetail(selectedConversationId);
    else elements.detail.innerHTML = '<p class="subtle">Select a synced conversation to view its details.</p>';
  } catch (error) {
    if (!isCurrentConversationResponse(requestId, refreshRequestSequence, session.token, readSession()?.token)) return;
    ++detailRequestSequence;
    cachedItems = [];
    selectedConversationId = undefined;
    elements.status.textContent = "Unavailable";
    elements.summary.textContent = "";
    elements.stats.innerHTML = "";
    elements.list.innerHTML = `<p class="subtle" role="alert">Unable to load conversations. ${escapeHtml(error instanceof Error ? error.message : "Check your connection and try again.")}</p>`;
    elements.detail.innerHTML = '<p class="subtle">Conversation details are unavailable until the list loads successfully.</p>';
  }
}

function applyConversationFilters(): void {
  if (!elements) return;
  const visible = filteredItems();
  const previous = selectedConversationId;
  if (!selectedConversationId || !visible.some((item) => item.id === selectedConversationId)) {
    selectedConversationId = visible[0]?.id;
  }
  renderCurrentList();
  if (!selectedConversationId) {
    ++detailRequestSequence;
    elements.detail.innerHTML = '<p class="workspace-empty">No conversation selected. Change the search or status filter to see more.</p>';
  } else if (previous !== selectedConversationId) {
    void loadDetail(selectedConversationId);
  }
}
elements?.filter.addEventListener("change", applyConversationFilters);
elements?.search.addEventListener("input", applyConversationFilters);
elements?.clearFilters.addEventListener("click", () => {
  if (!elements) return;
  elements.filter.value = "all";
  elements.search.value = "";
  applyConversationFilters();
  elements.search.focus();
});

window.addEventListener("tnnd:auth-session-changed", () => void refresh());
void refresh();