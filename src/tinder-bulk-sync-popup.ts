/** Compact extension control: the user chooses exactly when to import.
 * This does NOT enable AI management or send Tinder messages.
 */
const anchor = document.getElementById("manualSyncStatus");
const parent = anchor?.closest(".card");
if (parent && !document.getElementById("tnnd-bulk-readonly-sync")) {
  const panel = document.createElement("section");
  panel.className = "card";
  panel.id = "tnnd-bulk-readonly-sync";
  panel.setAttribute("aria-label", "Read-only Tinder history import");
  panel.innerHTML = `
    <h2>Sync Tinder conversations · read-only</h2>
    <p>Collect currently loaded Messages conversations, then import their visible history into TNND. No Tinder message will be sent or AI management enabled.</p>
    <p class="muted">Tinder may load older chats only when you scroll the Messages sidebar. Scroll, reopen TNND, and collect again to include more. This cannot certify that every Tinder chat was loaded.</p>
    <div class="actions">
      <button type="button" class="secondary" id="bulkSyncCollect">Collect loaded chats</button>
      <button type="button" class="secondary" id="bulkSyncRetry">Retry skipped</button>
      <button type="button" class="primary" id="bulkSyncStart">Start read-only import</button>
      <button type="button" class="secondary" id="bulkSyncStop">Stop import</button>
    </div>
    <p class="warning">Before import: stop all automatic runners, turn OFF global auto-replies, keep exactly one Tinder tab and do not type in the composer.</p>
    <p id="bulkSyncFeedback" role="status" aria-live="polite">Checking previously collected conversations…</p>
  `;
  parent.insertAdjacentElement("afterend", panel);
  const status = panel.querySelector<HTMLElement>("#bulkSyncFeedback");
  const collect = panel.querySelector<HTMLButtonElement>("#bulkSyncCollect");
  const start = panel.querySelector<HTMLButtonElement>("#bulkSyncStart");
  const stop = panel.querySelector<HTMLButtonElement>("#bulkSyncStop");
  const retry = panel.querySelector<HTMLButtonElement>("#bulkSyncRetry");
  interface Counts { active: boolean; selected: number; completed: number; failed: number; partial: number; pending: number }
  interface Answer { ok?: boolean; error?: string; state?: Counts }
  let pending = false;
  const display = (data: Counts) => {
    if (status) status.textContent = `${data.active ? "Import running" : "Import stopped"} · ${data.completed}/${data.selected} completed · ${data.failed} skipped · ${data.partial} with only the last 40 visible messages · ${data.pending} remaining. These are loaded chats, not a confirmed complete Tinder inbox.`;
    if (start) start.disabled = pending || data.active || data.selected === 0 || data.pending === 0;
    if (stop) stop.disabled = pending || !data.active;
    if (retry) retry.disabled = pending || data.active || data.failed === 0;
    if (collect) collect.disabled = pending || data.active;
  };
  const message = async (type: string): Promise<Answer> => chrome.runtime.sendMessage({ type }) as Promise<Answer>;
  const command = async (type: string) => {
    if (pending) return;
    pending = true;
    if (status) status.textContent = "Checking Tinder and your TNND account…";
    for (const button of [collect,start,stop,retry]) if (button) button.disabled = true;
    try {
      const result = await message(type);
      if (!result?.ok || !result.state) throw new Error(result?.error ?? "bulk_sync_unavailable");
      display(result.state);
    } catch (error) {
      if (status) status.textContent = "Read-only import unavailable: " +
        (error instanceof Error ? error.message : "Check Tinder/extension connection.") +
        ". No Tinder message was sent.";
    } finally {
      pending = false;
      void refresh();
    }
  };
  const refresh = async () => {
    if (pending) return;
    try {
      const result = await message("TNND_BULK_SYNC_STATUS");
      if (result?.ok && result.state) display(result.state);
    } catch { /* extension disconnected; keep the last visible status */ }
  };
  collect?.addEventListener("click", () => void command("TNND_BULK_SYNC_COLLECT"));
  start?.addEventListener("click", () => void command("TNND_BULK_SYNC_START"));
  stop?.addEventListener("click", () => void command("TNND_BULK_SYNC_STOP"));
  retry?.addEventListener("click", () => void command("TNND_BULK_SYNC_RETRY"));
  void refresh();
  window.setInterval(()=>{ void refresh(); }, 2500);
}
