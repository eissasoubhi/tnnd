import { isUnreadObservationState, type TinderUnreadObservationState } from "./tinder-unread-observation-state";

type LoadResponse = { ok: true; state: TinderUnreadObservationState | null } | { ok: false; error?: string };
type SaveResponse = { ok: true; state: TinderUnreadObservationState } | { ok: false; error?: string };
type ClearResponse = { ok: true } | { ok: false; error?: string };

function runtimeError(message: string): Error {
  return new Error(message || "tinder_unread_observation_storage_failed");
}

export async function loadUnreadObservationState(): Promise<TinderUnreadObservationState | null> {
  const response = await chrome.runtime.sendMessage({ type: "TNND_GET_TINDER_UNREAD_OBSERVATIONS" }) as LoadResponse;
  if (!response?.ok) throw runtimeError(response?.error ?? "unread_observation_read_failed");
  return response.state && isUnreadObservationState(response.state) ? response.state : null;
}

export async function saveUnreadObservationState(state: TinderUnreadObservationState): Promise<TinderUnreadObservationState> {
  if (!isUnreadObservationState(state)) throw new Error("invalid_tinder_unread_observation_state");
  const response = await chrome.runtime.sendMessage({ type: "TNND_SAVE_TINDER_UNREAD_OBSERVATIONS", state }) as SaveResponse;
  if (!response?.ok) throw runtimeError(response?.error ?? "unread_observation_save_failed");
  return response.state;
}

export async function clearUnreadObservationState(): Promise<void> {
  const response = await chrome.runtime.sendMessage({ type: "TNND_CLEAR_TINDER_UNREAD_OBSERVATIONS" }) as ClearResponse;
  if (!response?.ok) throw runtimeError(response?.error ?? "unread_observation_clear_failed");
}
