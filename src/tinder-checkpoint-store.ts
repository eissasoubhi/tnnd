import {
  canResumeCheckpoint,
  planTinderSchedulerStep,
  type TinderScheduledJob,
  type TinderSchedulerCheckpoint,
  type TinderSchedulerStep
} from "./tinder-scheduler";
import type { TinderUiStateSnapshot } from "./tinder-state-machine";

interface CheckpointResponse {
  ok: boolean;
  checkpoint?: unknown;
  error?: string;
}

async function request(message: object): Promise<CheckpointResponse> {
  return chrome.runtime.sendMessage(message) as Promise<CheckpointResponse>;
}

export async function loadTinderCheckpoint(): Promise<TinderSchedulerCheckpoint | null> {
  const response = await request({ type: "TNND_GET_TINDER_CHECKPOINT" });
  if (!response.ok) throw new Error(response.error ?? "checkpoint_read_failed");
  return canResumeCheckpoint(response.checkpoint) ? response.checkpoint : null;
}

export async function saveTinderCheckpoint(checkpoint: TinderSchedulerCheckpoint): Promise<TinderSchedulerCheckpoint> {
  const response = await request({ type: "TNND_SAVE_TINDER_CHECKPOINT", checkpoint });
  if (!response.ok || !canResumeCheckpoint(response.checkpoint)) {
    throw new Error(response.error ?? "checkpoint_save_failed");
  }
  return response.checkpoint;
}

export async function clearTinderCheckpoint(): Promise<void> {
  const response = await request({ type: "TNND_CLEAR_TINDER_CHECKPOINT" });
  if (!response.ok) throw new Error(response.error ?? "checkpoint_clear_failed");
}

export async function planAndCheckpointTinderJob(
  current: TinderUiStateSnapshot,
  job: TinderScheduledJob,
  now = new Date().toISOString()
): Promise<TinderSchedulerStep> {
  const step = planTinderSchedulerStep(current, job, now);
  await saveTinderCheckpoint(step.checkpoint);
  return step;
}

export async function resumeTinderJob(
  current: TinderUiStateSnapshot,
  fallbackJob?: TinderScheduledJob,
  now = new Date().toISOString()
): Promise<TinderSchedulerStep | null> {
  const checkpoint = await loadTinderCheckpoint();
  const job = checkpoint
    ? {
        id: checkpoint.jobId,
        kind: checkpoint.kind,
        ...(checkpoint.conversationRef ? { conversationRef: checkpoint.conversationRef } : {})
      }
    : fallbackJob;
  if (!job) return null;
  if (checkpoint?.phase === "completed") return null;
  return planAndCheckpointTinderJob(current, job, now);
}
