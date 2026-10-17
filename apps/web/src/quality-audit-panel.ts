import { readSession } from "./auth-client";

interface Finding {
  id: string;
  severity: "attention" | "review" | "info";
  evidence: string;
  recommendation: string;
  suggestedSetting?: { key: string; value: string | number };
}
export interface QualityReport {
  generatedAt: string;
  source: "saved-messages";
  sampleSize: number;
  conversations: number;
  outgoing: number;
  incoming: number;
  sufficientSample: boolean;
  metrics: {
    emojiMessages: number; laughterMessages: number; veryLongReplies: number;
    formalPhrases: number; questions: number; comparedLanguages: number; differingLanguages: number;
  };
  findings: Finding[];
  cautions: string[];
}
export function parseQualityReport(input: unknown): QualityReport {
  if (!input || typeof input !== "object") throw new Error("Invalid audit response");
  const x = input as Partial<QualityReport>;
  const numbers = [x.sampleSize,x.conversations,x.outgoing,x.incoming,x.metrics?.emojiMessages,x.metrics?.laughterMessages,
    x.metrics?.veryLongReplies,x.metrics?.formalPhrases,x.metrics?.questions,x.metrics?.comparedLanguages,x.metrics?.differingLanguages];
  if (x.source !== "saved-messages" || !x.generatedAt || Number.isNaN(Date.parse(x.generatedAt))
    || typeof x.sufficientSample !== "boolean" || numbers.some(n=>typeof n !== "number" || !Number.isFinite(n) || n < 0)
    || !Array.isArray(x.findings) || !Array.isArray(x.cautions)) throw new Error("Invalid audit response");
  return x as QualityReport;
}
export const safeAuditHtml = (value: string): string => value.replace(/[&<>"']/g, c =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);
export function renderQualityReport(report: QualityReport): string {
  const m = report.metrics;
  const stats: Array<[string,number]> = [
    ["Sent messages", report.outgoing],
    ["Received messages",report.incoming],
    ["Sent with emoji",m.emojiMessages],
    ["Sent with laughter",m.laughterMessages],
    ["Sent with formal phrases",m.formalPhrases],
    ["Reply language comparisons",m.comparedLanguages]
  ];
  return `
    <p class="subtle">Checked ${report.sampleSize} stored messages from ${report.conversations} conversations.
    This is a sample-based style review, not a measure of authenticity or confirmed Tinder delivery.</p>
    <p class="subtle">Confidence: ${report.sufficientSample ? "Limited to measured signals" : "Insufficient sample — collect more messages"} ·
      ${safeAuditHtml(report.generatedAt)}</p>
    <div class="analytics-status-grid">${stats.map(([label,value])=>`
      <div class="analytics-status-metric"><span>${safeAuditHtml(label)}</span><strong>${value}</strong></div>
    `).join("")}</div>
    <h4>Review suggestions · no settings were changed</h4>
    <ul>${report.findings.map(f=>`<li>
      <strong>${safeAuditHtml(f.severity.toUpperCase())} · ${safeAuditHtml(f.id.replaceAll("-"," "))}</strong>
      <p>${safeAuditHtml(f.evidence)}</p>
      <p>${safeAuditHtml(f.recommendation)}</p>
      ${f.suggestedSetting ? `<small>Suggested setting to review: ${safeAuditHtml(f.suggestedSetting.key)} = ${safeAuditHtml(String(f.suggestedSetting.value))}</small>` : ""}
    </li>`).join("")}</ul>
    <details><summary>Scope and limitations</summary><ul>${report.cautions.map(c=>`<li>${safeAuditHtml(c)}</li>`).join("")}</ul></details>
  `;
}
const baseUrl = (import.meta.env.VITE_TNND_API_BASE_URL as string | undefined)?.replace(/\/$/, "") ?? "http://127.0.0.1:4000";
let sequence = 0;
const panel = document.querySelector<HTMLElement>("#analytics-panel");
if (panel && !document.querySelector("#quality-audit-section")) {
  const section = document.createElement("section");
  section.id = "quality-audit-section";
  section.className = "analytics-insight-group";
  section.setAttribute("aria-label","Conversation quality audit");
  section.innerHTML = `
    <div class="panel-heading"><div><p class="eyebrow">Quality review</p><h3>Conversation style audit</h3></div>
    <button type="button" class="secondary" id="quality-audit-refresh">Run audit</button></div>
    <p class="subtle">Read-only analysis of recent synced messages. Recommendations are optional and will not change your AI configuration.</p>
    <div id="quality-audit-output" role="status" aria-live="polite">Sign in to run the audit.</div>`;
  panel.append(section);
  const button = section.querySelector<HTMLButtonElement>("#quality-audit-refresh");
  const output = section.querySelector<HTMLElement>("#quality-audit-output");
  const run = async () => {
    const id = ++sequence;
    const session = readSession();
    if (!output || !session) { if (output) output.textContent = "Sign in to run the audit."; return; }
    if (button) button.disabled = true;
    output.textContent = "Reviewing saved messages…";
    try {
      const response = await fetch(baseUrl + "/api/v1/quality-audit", {
        headers: { authorization: "Bearer " + session.token }
      });
      if (!response.ok) throw new Error("Quality audit request failed");
      const payload: unknown = await response.json();
      if (!payload || typeof payload !== "object" || !("report" in payload)) throw new Error("Missing report");
      const report = parseQualityReport((payload as {report: unknown}).report);
      if (id !== sequence || readSession()?.token !== session.token) return;
      output.innerHTML = renderQualityReport(report);
    } catch {
      if (id === sequence && readSession()?.token === session.token) {
        output.textContent = "Audit unavailable. Check your API and database connection, then retry.";
      }
    } finally { if (id === sequence && button) button.disabled = false; }
  };
  button?.addEventListener("click",()=>{ void run(); });
  window.addEventListener("tnnd:auth-session-changed",()=>{
    ++sequence;
    if (button) button.disabled = false;
    if (output) output.textContent = "Run an audit for the current signed-in account.";
  });
}
