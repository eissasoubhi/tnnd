import { planBoundedTinderJob, type TinderJobDecision } from "./tinder-orchestrator.ts";
import type { TinderJobKind, TinderUiStateSnapshot } from "./tinder-state-machine.ts";

export type TinderCheckpointPhase = "queued" | "navigating" | "ready" | "completed" | "blocked";

export interface TinderScheduledJob {
  id: string;
  kind: TinderJobKind;
  conversationRef?: string;
}

export interface TinderSchedulerCheckpoint {
  schemaVersion: 1;
  jobId: string;
  kind: TinderJobKind;
  conversationRef: string | null;
  phase: TinderCheckpointPhase;
  lastPath: string;
  navigationTarget: string | null;
  reason: string;
  updatedAt: string;
}

export interface TinderSchedulerStep {
  decision: TinderJobDecision;
  checkpoint: TinderSchedulerCheckpoint;
  action: "none" | "navigate" | "execute";
}

function checkpoint(
  job: TinderScheduledJob,
  current: TinderUiStateSnapshot,
  phase: TinderCheckpointPhase,
  decision: TinderJobDecision,
  now: string
): TinderSchedulerCheckpoint {
  return {
    schemaVersion: 1,
    jobId: job.id,
    kind: job.kind,
    conversationRef: job.conversationRef?.trim() || null,
    phase,
    lastPath: current.path,
    navigationTarget: decision.navigation.path,
    reason: decision.reason,
    updatedAt: now
  };
}

export function planTinderSchedulerStep(
  current: TinderUiStateSnapshot,
  job: TinderScheduledJob,
  now = new Date().toISOString()
): TinderSchedulerStep {
  const decision = planBoundedTinderJob(current, job.kind, job.conversationRef);
  if (!decision.allowed) {
    return { decision, checkpoint: checkpoint(job, current, "blocked", decision, now), action: "none" };
  }
  if (decision.navigation.path) {
    return { decision, checkpoint: checkpoint(job, current, "navigating", decision, now), action: "navigate" };
  }
  return { decision, checkpoint: checkpoint(job, current, "ready", decision, now), action: "execute" };
}

export function completeTinderSchedulerStep(
  prior: TinderSchedulerCheckpoint,
  currentPath: string,
  now = new Date().toISOString()
): TinderSchedulerCheckpoint {
  return {
    ...prior,
    phase: "completed",
    lastPath: currentPath,
    navigationTarget: null,
    reason: "bounded action completed and checkpointed",
    updatedAt: now
  };
}

export function canResumeCheckpoint(value: unknown): value is TinderSchedulerCheckpoint {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<TinderSchedulerCheckpoint>;
  return item.schemaVersion === 1
    && typeof item.jobId === "string"
    && item.jobId.length > 0
    && typeof item.kind === "string"
    && ["scan-inbox", "process-thread", "sync-only", "swipe"].includes(item.kind)
    && typeof item.phase === "string"
    && ["queued", "navigating", "ready", "completed", "blocked"].includes(item.phase)
    && typeof item.lastPath === "string"
    && typeof item.updatedAt === "string";
}
