import { planBoundedTinderJob, type TinderJobDecision } from "./tinder-orchestrator";
import {
  classifyTinderPath,
  composeTinderUiState,
  type TinderJobKind,
  type TinderSidebarState,
  type TinderUiStateSnapshot
} from "./tinder-state-machine";

function actuallyVisible(element: Element | null): element is HTMLElement {
  if (!(element instanceof HTMLElement)) return false;
  if (element.hidden || element.getAttribute("aria-hidden") === "true") return false;
  const style = getComputedStyle(element);
  if (style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse") return false;
  if (Number(style.opacity) === 0) return false;
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0 && element.getClientRects().length > 0;
}

function visibleElements(selector: string): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>(selector)).filter((element) => actuallyVisible(element));
}

function detectSidebarState(): TinderSidebarState {
  if (visibleElements('a[href*="/app/messages/"]').length > 0) return "messages";
  if (visibleElements('[data-testid*="matchList" i], [aria-label*="matches" i]').length > 0) return "matches";
  return "unknown";
}

function visibleBlockingModal(): boolean {
  return visibleElements('[role="dialog"], [aria-modal="true"]').some((element) => {
    if (element.getAttribute("aria-hidden") === "true") return false;
    const ariaModal = element.getAttribute("aria-modal");
    return ariaModal === "true" || element.getAttribute("role") === "dialog";
  });
}

export function readCurrentTinderUiState(): TinderUiStateSnapshot {
  return composeTinderUiState(classifyTinderPath(location.pathname), {
    sidebarState: detectSidebarState(),
    visibleModal: visibleBlockingModal()
  });
}

export function planCurrentTinderJob(job: TinderJobKind, conversationRef?: string): TinderJobDecision {
  return planBoundedTinderJob(readCurrentTinderUiState(), job, conversationRef);
}
