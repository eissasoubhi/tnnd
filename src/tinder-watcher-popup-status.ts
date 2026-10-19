/** Human-readable, action-confirmed watcher status for the extension popup.
 * Pure UI logic: never changes runner state or starts sending messages.
 */
export interface WatcherPopupState {
  enabled: boolean;
  mode?: "runner" | "watcher";
  phase: string;
  phaseDetail?: string;
  pausedOnStop?: boolean;
  watcherStatus?: string;
}

export interface WatcherPopupFeedback {
  label: string;
  status: "stopped" | "waiting" | "new-replies" | "following" | "processing" |
    "paused" | "disconnected";
}

const labelByStatus: Record<string, string> = {
  stopped: "Stopped", waiting: "Waiting for replies", "new-replies": "New replies found",
  following: "Following current conversation", processing: "Processing a conversation",
  paused: "Paused", disconnected: "Disconnected"
};

function bounded(text: string): string {
  return text.slice(0, 360);
}

/** A failed control command must stay visible after a read-only status poll.
 * An async worker failure must not silently become a generic Stopped label.
 */
export function presentWatcherStatus(
  state: WatcherPopupState,
  commandError: string | null,
  commandNotice: string | null
): WatcherPopupFeedback {
  if (commandError)
    return { label: "Watcher action failed: " + bounded(commandError), status: "stopped" };
  const watching = state.enabled && state.mode === "watcher";
  if (!state.enabled && state.phase === "error") {
    return {
      label: "Watcher stopped after a problem: " +
        bounded(state.phaseDetail || "Check TNND and Tinder connections before retrying."),
      status: "paused"
    };
  }
  if (state.enabled && state.mode !== "watcher")
    return { label: "Full-chat runner active. Stop it before starting the watcher.",
      status: "stopped" };
  if (watching && state.phase === "error")
    return { label: "Watcher encountered a problem: " +
      bounded(state.phaseDetail || "Check runner activity and network connections."),
      status: "paused" };
  if (watching && state.phase === "waiting" &&
      /automatic replies are off/i.test(state.phaseDetail ?? ""))
    return { label: "Watcher is waiting: " + bounded(state.phaseDetail ?? ""),
      status: "paused" };
  if (!watching)
    return { label: "Stopped · watcher is off", status: "stopped" };
  const type = state.watcherStatus && state.watcherStatus in labelByStatus
    ? state.watcherStatus : "waiting";
  const normal = (labelByStatus[type] ?? "Waiting") + " · Tinder tab required";
  const message = commandNotice ? bounded(commandNotice) + " · " + normal : normal;
  return { label: message, status: type as WatcherPopupFeedback["status"] };
}
