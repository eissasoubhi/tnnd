export {};
/** Compact extension control: the user chooses exactly when to import.
 * This does NOT enable AI management or send Tinder messages.
 */
const anchor = document.getElementById("manualSyncStatus");
const manualImportCard = anchor?.closest(".card");
if (manualImportCard && !document.getElementById("tnnd-bulk-readonly-sync")) {
  const panel = document.createElement("section");
  panel.className = "card";
  panel.id = "tnnd-bulk-readonly-sync";
  panel.setAttribute("aria-label", "Read-only Tinder history import");
  panel.innerHTML = `
    <h2>Sync Tinder conversations · read-only</h2>
    <p>Collect currently loaded Messages conversations, then import their visible history into TNND. No Tinder message will be sent or AI management enabled.</p>
    <p class="muted">Tinder loads older chats as you scroll. Choose Collect while scrolling, close the popup, scroll through Messages, then reopen TNND and stop collection. Only loaded conversations are counted.</p>
    <div class="actions">
      <button type="button" class="secondary" id="bulkSyncCollect">Collect loaded chats</button>
      <button type="button" class="secondary" id="bulkSyncCollectStart">Collect while scrolling</button>
      <button type="button" class="secondary" id="bulkSyncCollectStop">Stop collecting</button>
      <button type="button" class="secondary" id="bulkSyncRetry">Retry skipped</button>
      <button type="button" class="primary" id="bulkSyncStart">Start read-only import</button>
      <button type="button" class="secondary" id="bulkSyncStop">Stop import</button>
    </div>
    <p class="warning">Before import: stop all automatic runners, turn OFF global auto-replies, keep exactly one Tinder tab and do not type in the composer.</p>
    <p id="bulkSyncFeedback" role="status" aria-live="polite">Checking previously collected conversations…</p>
  `;
  manualImportCard.insertAdjacentElement("afterend", panel);
  const status = panel.querySelector<HTMLElement>("#bulkSyncFeedback");
  const collect = panel.querySelector<HTMLButtonElement>("#bulkSyncCollect");
  const collectStart = panel.querySelector<HTMLButtonElement>("#bulkSyncCollectStart");
  const collectStop = panel.querySelector<HTMLButtonElement>("#bulkSyncCollectStop");
  const start = panel.querySelector<HTMLButtonElement>("#bulkSyncStart");
  const stop = panel.querySelector<HTMLButtonElement>("#bulkSyncStop");
  const retry = panel.querySelector<HTMLButtonElement>("#bulkSyncRetry");
  interface Counts { active: boolean; collecting?: boolean; stopReason?: string | null; selected: number; completed: number; failed: number; partial: number; pending: number }
  interface Answer { ok?: boolean; error?: string; state?: Counts }
  let pending = false;
  const display = (data: Counts) => {
    const safetyReason: Record<string, string> = {
      manual_tinder_navigation_detected: "Tinder navigation changed; stop typing and restart the import.",
      automatic_runner_must_be_disabled: "Turn off auto-replies and stop all chat runners.",
      account_or_tab_changed: "Account or Tinder tab changed. Check both before restarting.",
      human_draft_or_chat_busy: "An unsent draft or an in-progress reply prevents navigation.",
      tinder_or_api_unavailable: "Tinder or TNND API became unavailable.",
      account_or_automation_changed: "Account or automation setting changed; import safely stopped.",
      tnnd_account_disconnected: "TNND account disconnected."
    };
    if (status) status.textContent = `${data.active ? "Import running" : data.collecting ? "Collecting loaded chats while you scroll" : "Import stopped"} · ${data.completed}/${data.selected} completed · ${data.failed} skipped · ${data.partial} with only the last 40 visible messages · ${data.pending} remaining. ${data.stopReason ? (safetyReason[data.stopReason] ?? "Import safely stopped. Check Tinder and TNND, then retry.") : ""} These are loaded chats, not a confirmed complete Tinder inbox.`;
    if (start) start.disabled = pending || data.active || data.selected === 0 || data.pending === 0;
    if (stop) stop.disabled = pending || !data.active;
    if (retry) retry.disabled = pending || data.active || data.failed === 0;
    if (collect) collect.disabled = pending || data.active;
    if (collectStart) collectStart.disabled = pending || data.active || data.collecting === true;
    if (collectStop) collectStop.disabled = pending || data.active || data.collecting !== true;
  };
  const message = async (type: string): Promise<Answer> => chrome.runtime.sendMessage({ type }) as Promise<Answer>;
  const command = async (type: string) => {
    if (pending) return;
    pending = true;
    if (status) status.textContent = "Checking Tinder and your TNND account…";
    for (const button of [collect,collectStart,collectStop,start,stop,retry]) if (button) button.disabled = true;
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
  collectStart?.addEventListener("click", () => void command("TNND_BULK_SYNC_COLLECT_START"));
  collectStop?.addEventListener("click", () => void command("TNND_BULK_SYNC_COLLECT_STOP"));
  start?.addEventListener("click", () => void command("TNND_BULK_SYNC_START"));
  stop?.addEventListener("click", () => void command("TNND_BULK_SYNC_STOP"));
  retry?.addEventListener("click", () => void command("TNND_BULK_SYNC_RETRY"));
  void refresh();
  window.setInterval(()=>{ void refresh(); }, 2500);
}
