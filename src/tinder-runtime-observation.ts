import { TinderDomAdapter, type TinderSelectorDiagnostics } from "./tinder-adapter";
import { classifyTinderPath, type TinderStateSnapshot } from "./tinder-state-machine";

export interface TinderRuntimeObservation {
  observedAt: string;
  route: TinderStateSnapshot;
  diagnostics: TinderSelectorDiagnostics;
  routeAgreesWithDom: boolean;
  readOnlyStepAllowed: boolean;
}

function routeMatchesDiagnostics(route: TinderStateSnapshot, diagnostics: TinderSelectorDiagnostics): boolean {
  if (route.state === "unknown" || diagnostics.view === "unknown") return false;
  return route.state === diagnostics.view;
}

export function observeTinderRuntime(
  adapter: TinderDomAdapter,
  path: string = location.href,
  now: string = new Date().toISOString()
): TinderRuntimeObservation {
  const route = classifyTinderPath(path);
  const diagnostics = adapter.diagnose();
  const routeAgreesWithDom = routeMatchesDiagnostics(route, diagnostics);
  const readOnlyStepAllowed = routeAgreesWithDom
    && diagnostics.viewConfidenceLabel !== "low"
    && diagnostics.runtimeIssues.length === 0;

  return {
    observedAt: now,
    route,
    diagnostics,
    routeAgreesWithDom,
    readOnlyStepAllowed
  };
}
