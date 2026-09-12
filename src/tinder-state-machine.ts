export type TinderRouteState = "discovery" | "inbox" | "conversation" | "unknown";
export type TinderJobKind = "scan-inbox" | "process-thread" | "sync-only" | "swipe";
export type TinderDiscoveryContext = "recs" | "explore-catalog" | "explore-category" | "unknown";
export type TinderSidebarState = "matches" | "messages" | "unknown";
export type TinderProfileState = "card" | "expanded" | "unknown";
export type TinderOverlayState = "none" | "blocking-modal";

export interface TinderStateSnapshot {
  state: TinderRouteState;
  path: string;
  conversationRef: string | null;
  discoveryContext: TinderDiscoveryContext;
}

export interface TinderUiSignals {
  sidebarState?: TinderSidebarState;
  profileExpanded?: boolean;
  visibleModal?: boolean;
}

export interface TinderUiStateSnapshot extends TinderStateSnapshot {
  sidebarState: TinderSidebarState;
  profileState: TinderProfileState;
  overlay: TinderOverlayState;
  boundedActionAllowed: boolean;
}

export interface TinderNavigationPlan {
  from: TinderRouteState;
  target: TinderRouteState;
  reason: string;
  path: string | null;
}

const INBOX_PATHS = new Set(["/app/matches", "/app/messages"]);
const CONVERSATION_PREFIX = "/app/messages/";
const EXPLORE_PREFIX = "/app/explore/";

function normalizePath(value: string): string {
  const raw = value.trim();
  if (!raw) return "/";
  try {
    const parsed = new URL(raw, "https://tinder.com");
    return parsed.pathname.replace(/\/+$/, "") || "/";
  } catch {
    const path = raw.split(/[?#]/, 1)[0] ?? "/";
    return (path.startsWith("/") ? path : `/${path}`).replace(/\/+$/, "") || "/";
  }
}

function discoveryContext(path: string): TinderDiscoveryContext {
  if (path === "/app/recs") return "recs";
  if (path === "/app/explore") return "explore-catalog";
  if (path.startsWith(EXPLORE_PREFIX) && path.length > EXPLORE_PREFIX.length) return "explore-category";
  return "unknown";
}

export function classifyTinderPath(value: string): TinderStateSnapshot {
  const path = normalizePath(value).toLowerCase();
  const context = discoveryContext(path);
  if (context !== "unknown") return { state: "discovery", path, conversationRef: null, discoveryContext: context };
  if (INBOX_PATHS.has(path)) return { state: "inbox", path, conversationRef: null, discoveryContext: "unknown" };
  if (path.startsWith(CONVERSATION_PREFIX) && path.length > CONVERSATION_PREFIX.length) {
    return {
      state: "conversation",
      path,
      conversationRef: path.slice(CONVERSATION_PREFIX.length),
      discoveryContext: "unknown"
    };
  }
  return { state: "unknown", path, conversationRef: null, discoveryContext: "unknown" };
}

export function composeTinderUiState(route: TinderStateSnapshot, signals: TinderUiSignals = {}): TinderUiStateSnapshot {
  const overlay: TinderOverlayState = signals.visibleModal ? "blocking-modal" : "none";
  const profileState: TinderProfileState = route.state === "discovery"
    ? signals.profileExpanded ? "expanded" : "card"
    : "unknown";
  return {
    ...route,
    sidebarState: signals.sidebarState ?? "unknown",
    profileState,
    overlay,
    boundedActionAllowed: route.state !== "unknown" && overlay === "none"
  };
}

export function targetStateForJob(job: TinderJobKind): TinderRouteState {
  switch (job) {
    case "scan-inbox":
      return "inbox";
    case "process-thread":
      return "conversation";
    case "swipe":
      return "discovery";
    case "sync-only":
      return "unknown";
  }
}

export function planNavigation(current: TinderStateSnapshot, job: TinderJobKind, conversationRef?: string): TinderNavigationPlan {
  const target = targetStateForJob(job);
  if (job === "sync-only") {
    return { from: current.state, target: current.state, reason: "sync-only does not require Tinder navigation", path: null };
  }

  if (target === current.state) {
    if (target !== "conversation" || !conversationRef || current.conversationRef === conversationRef) {
      return { from: current.state, target, reason: "already in required Tinder state", path: null };
    }
  }

  if (target === "discovery") {
    return { from: current.state, target, reason: "swipe work requires discovery", path: "/app/recs" };
  }
  if (target === "inbox") {
    return { from: current.state, target, reason: "conversation discovery requires inbox", path: "/app/matches" };
  }
  if (target === "conversation") {
    const ref = conversationRef?.trim();
    return {
      from: current.state,
      target,
      reason: ref ? "thread work requires the selected conversation" : "thread work requires a resolved conversation before navigation",
      path: ref ? `/app/messages/${encodeURIComponent(ref)}` : null
    };
  }

  return { from: current.state, target, reason: "no bounded navigation target available", path: null };
}

export function isObservedV1Transition(from: TinderRouteState, to: TinderRouteState): boolean {
  if (from === to) return true;
  return (
    (from === "discovery" && to === "conversation") ||
    (from === "conversation" && to === "inbox") ||
    (from === "inbox" && to === "discovery") ||
    (from === "discovery" && to === "inbox") ||
    (from === "inbox" && to === "conversation")
  );
}
