import {
  completeTinderSchedulerStep,
  type TinderScheduledJob,
  type TinderSchedulerCheckpoint,
  type TinderSchedulerStep
} from "./tinder-scheduler";
import {
  planAndCheckpointTinderJob,
  saveTinderCheckpoint
} from "./tinder-checkpoint-store";
import type { TinderUiStateSnapshot } from "./tinder-state-machine";

export interface TinderSingleTabExecutorHooks {
  navigate(path: string): void | Promise<void>;
  execute(job: TinderScheduledJob, state: TinderUiStateSnapshot): void | Promise<void>;
}

export interface TinderSingleTabExecutionResult {
  step: TinderSchedulerStep;
  checkpoint: TinderSchedulerCheckpoint;
  navigated: boolean;
  executed: boolean;
}

export async function executeTinderSingleTabStep(
  state: TinderUiStateSnapshot,
  job: TinderScheduledJob,
  hooks: TinderSingleTabExecutorHooks,
  now = new Date().toISOString()
): Promise<TinderSingleTabExecutionResult> {
  const step = await planAndCheckpointTinderJob(state, job, now);

  if (step.action === "none") {
    return {
      step,
      checkpoint: step.checkpoint,
      navigated: false,
      executed: false
    };
  }

  if (step.action === "navigate") {
    const target = step.checkpoint.navigationTarget;
    if (!target) throw new Error("missing_tinder_navigation_target");
    await hooks.navigate(target);
    return {
      step,
      checkpoint: step.checkpoint,
      navigated: true,
      executed: false
    };
  }

  await hooks.execute(job, state);
  const completed = completeTinderSchedulerStep(step.checkpoint, state.path);
  const saved = await saveTinderCheckpoint(completed);
  return {
    step,
    checkpoint: saved,
    navigated: false,
    executed: true
  };
}
