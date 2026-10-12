import { readSession } from "./auth-client";
import { groupForPanelId, viewForHash, workspaceCopy, workspaceViews, type WorkspaceView } from "./workspace-sections";

/**
 * One scrollable document. Existing panel nodes are reparented, not recreated:
 * saved input drafts, form listeners and async panel state survive navigation.
 */
export function initWorkspaceScrollNavigation(): void {
  const nav = document.querySelector<HTMLElement>(".workspace-nav");
  const grid = document.querySelector<HTMLElement>("#conversation-workspace");
  const shell = document.querySelector<HTMLElement>(".shell");
  if (!nav || !grid || !shell) return;

  const links = Array.from(nav.querySelectorAll<HTMLAnchorElement>('a[href^="#"]'));
  const sections = new Map<WorkspaceView, HTMLElement>();
  const areas = new Map<WorkspaceView, HTMLElement>();
  for (const view of workspaceViews) {
    const section = document.createElement("section");
    section.id = "workspace-" + view + "-section";
    section.className = "workspace-section";
    section.dataset.workspaceSection = view;
    section.setAttribute("aria-label", workspaceCopy[view].label);
    if (view !== "overview") {
      const header = document.createElement("div");
      header.className = "workspace-section-heading";
      const eyebrow = document.createElement("p");
      eyebrow.className = "eyebrow";
      eyebrow.textContent = "TNND / " + workspaceCopy[view].label;
      const heading = document.createElement("h2");
      heading.textContent = workspaceCopy[view].title;
      const summary = document.createElement("p");
      summary.className = "subtle";
      summary.textContent = workspaceCopy[view].subtitle;
      header.append(eyebrow, heading, summary);
      section.append(header);
    }
    const area = document.createElement("div");
    area.className = "workspace-section-panels";
    const empty = document.createElement("p");
    empty.className = "workspace-section-placeholder";
    empty.textContent = "Sign in to start using " + workspaceCopy[view].label + ".";
    area.append(empty);
    section.append(area);
    grid.append(section);
    sections.set(view, section);
    areas.set(view, area);
  }

  // Old per-view placeholder is no longer needed; each section has a natural
  // empty state and no content is hidden or detached when navigating.
  document.getElementById("workspace-section-empty")?.remove();

  const locate = (panel: HTMLElement): WorkspaceView =>
    panel.id === "auth-panel" && !readSession() ? "overview" : groupForPanelId(panel.id);
  const organize = (): void => {
    for (const panel of Array.from(grid.children)) {
      if (!(panel instanceof HTMLElement) || panel.classList.contains("workspace-section")) continue;
      areas.get(locate(panel))?.append(panel);
    }
    // Sign-in moves from Overview to Settings once a session exists.
    const account = document.getElementById("auth-panel");
    if (account && account.parentElement !== areas.get(locate(account))) {
      areas.get(locate(account))?.append(account);
    }
    for (const [view, area] of areas) {
      const empty = area.querySelector<HTMLElement>(".workspace-section-placeholder");
      const hasPanels = Array.from(area.children).some(child => child.classList.contains("panel"));
      if (empty) {
        empty.hidden = hasPanels;
        empty.textContent = readSession()
          ? "Nothing to show here yet. Your information will appear after it is synced."
          : "Sign in to load " + workspaceCopy[view].label.toLowerCase() + ".";
      }
    }
  };

  let active: WorkspaceView = "overview";
  let pendingScroll = "";
  let scrollFrame = 0;
  const setActive = (view: WorkspaceView): void => {
    if (active !== view) active = view;
    shell.dataset.workspaceView = view;
    const label = document.querySelector<HTMLElement>("#workspace-location");
    if (label) label.textContent = workspaceCopy[view].label;
    for (const link of links) {
      if (viewForHash(link.hash) === view) link.setAttribute("aria-current", "location");
      else link.removeAttribute("aria-current");
    }
  };
  const spy = (): void => {
    scrollFrame = 0;
    const threshold = Math.min(window.innerHeight * 0.32, 220);
    let chosen: WorkspaceView = "overview";
    for (const view of workspaceViews) {
      const section = sections.get(view);
      if (section && section.getBoundingClientRect().top <= threshold) chosen = view;
    }
    // Hero/metrics sit above the first content section.
    if (window.scrollY < 80) chosen = "overview";
    setActive(chosen);
  };
  const scheduleSpy = (): void => {
    if (!scrollFrame) scrollFrame = window.requestAnimationFrame(spy);
  };
  const onHash = (): void => {
    const hash = window.location.hash;
    const raw = hash.slice(1);
    const target = raw ? document.getElementById(raw) : document.getElementById("workspace-overview");
    const owningPanelId = target?.closest<HTMLElement>(".panel")?.id ?? "";
    const view = viewForHash(hash, owningPanelId);
    const destination = target ?? sections.get(view);
    if (!destination) return;
    pendingScroll = target ? "" : raw;
    setActive(view);
    destination.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
  };
  const update = (): void => {
    organize();
    if (pendingScroll) {
      const target = document.getElementById(pendingScroll);
      if (target) {
        pendingScroll = "";
        target.scrollIntoView({ behavior: "auto", block: "start" });
      }
    }
    scheduleSpy();
  };

  for (const link of links) link.addEventListener("click", event => {
    // Still work when a lazy-loaded panel hasn't mounted yet.
    event.preventDefault();
    if (window.location.hash !== link.hash) history.pushState(null, "", link.hash);
    onHash();
  });
  window.addEventListener("hashchange", onHash);
  window.addEventListener("popstate", onHash);
  window.addEventListener("scroll", scheduleSpy, { passive: true });
  window.addEventListener("resize", scheduleSpy, { passive: true });
  window.addEventListener("tnnd:auth-session-changed", update);
  // Observer is not an all-subtree observer: profile field edits never cause
  // navigation recomputes; only async top-level panels need relocating.
  const observer = new MutationObserver(records => {
    if (records.some(record => record.target === grid && Array.from(record.addedNodes).some(node =>
      node instanceof HTMLElement && node.classList.contains("panel")))) update();
  });
  observer.observe(grid, { childList: true });
  if (typeof IntersectionObserver !== "undefined") {
    const visibility = new IntersectionObserver(scheduleSpy, { rootMargin: "-16% 0px -62% 0px", threshold: 0 });
    for (const section of sections.values()) visibility.observe(section);
  }
  organize();
  if (window.location.hash) window.requestAnimationFrame(onHash);
  else scheduleSpy();
}
