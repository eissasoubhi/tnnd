import type { TinderScheduledJob } from "./tinder-scheduler";

export interface TinderUnreadThreadCandidate {
  conversationRef: string;
  signal: "aria" | "testid" | "class" | "badge";
}

const THREAD_PREFIX = "/app/messages/";
const UNREAD_TOKEN = /\bunread\b|new[-_ ]?message|notification/i;

function visible(element: Element): boolean {
  return element instanceof HTMLElement && element.offsetParent !== null;
}

function conversationRefFromHref(href: string | null): string | null {
  if (!href) return null;
  try {
    const parsed = new URL(href, location.href);
    const path = parsed.pathname;
    if (!path.startsWith(THREAD_PREFIX) || path.length <= THREAD_PREFIX.length) return null;
    return decodeURIComponent(path.slice(THREAD_PREFIX.length)).trim() || null;
  } catch {
    return null;
  }
}

function unreadSignal(anchor: HTMLAnchorElement): TinderUnreadThreadCandidate["signal"] | null {
  const aria = anchor.getAttribute("aria-label") ?? "";
  if (UNREAD_TOKEN.test(aria)) return "aria";

  const testId = anchor.getAttribute("data-testid") ?? "";
  if (UNREAD_TOKEN.test(testId)) return "testid";

  const className = anchor.className?.toString() ?? "";
  if (UNREAD_TOKEN.test(className)) return "class";

  const scope = anchor.closest("li,[role='listitem'],article,div") ?? anchor;
  const badge = Array.from(scope.querySelectorAll<HTMLElement>("[aria-label],[data-testid],[class]")).find((element) => {
    if (!visible(element)) return false;
    const hint = `${element.getAttribute("aria-label") ?? ""} ${element.getAttribute("data-testid") ?? ""} ${element.className?.toString() ?? ""}`;
    return UNREAD_TOKEN.test(hint);
  });
  return badge ? "badge" : null;
}

export function discoverUnreadThreadCandidates(root: ParentNode = document): TinderUnreadThreadCandidate[] {
  const seen = new Set<string>();
  const result: TinderUnreadThreadCandidate[] = [];
  for (const anchor of Array.from(root.querySelectorAll<HTMLAnchorElement>('a[href*="/app/messages/"]'))) {
    if (!visible(anchor)) continue;
    const conversationRef = conversationRefFromHref(anchor.getAttribute("href"));
    if (!conversationRef || seen.has(conversationRef)) continue;
    const signal = unreadSignal(anchor);
    if (!signal) continue;
    seen.add(conversationRef);
    result.push({ conversationRef, signal });
  }
  return result.slice(0, 50);
}

function stableJobId(conversationRef: string): string {
  let hash = 2166136261;
  for (let index = 0; index < conversationRef.length; index += 1) {
    hash ^= conversationRef.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `unread-${(hash >>> 0).toString(36)}`;
}

export function buildUnreadProcessThreadJobs(
  candidates: readonly TinderUnreadThreadCandidate[],
  existing: readonly TinderScheduledJob[] = [],
  completedVisibleRefs: readonly string[] = []
): TinderScheduledJob[] {
  const occupied = new Set(existing.filter((job) => job.kind === "process-thread").map((job) => job.conversationRef).filter(Boolean));
  for (const ref of completedVisibleRefs) {
    const normalized = ref.trim();
    if (normalized) occupied.add(normalized);
  }

  const jobs: TinderScheduledJob[] = [];
  for (const candidate of candidates) {
    if (occupied.has(candidate.conversationRef)) continue;
    occupied.add(candidate.conversationRef);
    jobs.push({ id: stableJobId(candidate.conversationRef), kind: "process-thread", conversationRef: candidate.conversationRef });
  }
  return jobs;
}
