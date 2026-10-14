import { readSession } from "./auth-client";
import { groupForPanelId, viewForHash, workspaceCopy, workspaceViews, type WorkspaceView } from "./workspace-sections";

/**
 * Task-focused workspace: only the selected section is visible.
 * Feature panels are reparented once, never destroyed on navigation, so
 * unsaved forms, data, listeners and API-loaded state survive tab changes.
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
    section.hidden = view !== "overview";

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

  document.getElementById("workspace-section-empty")?.remove();

  const locate = (panel: HTMLElement): WorkspaceView =>
    panel.id === "auth-panel" && !readSession() ? "overview" : groupForPanelId(panel.id);

  const organize = (): void => {
    for (const panel of Array.from(grid.children)) {
      if (!(panel instanceof HTMLElement) || panel.classList.contains("workspace-section")) continue;
      areas.get(locate(panel))?.append(panel);
    }
    // Authentication moves from Overview to Settings once signed in.
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
  let pendingTargetId = "";
  const setActive = (view: WorkspaceView): void => {
    active = view;
    shell.dataset.workspaceView = view;
    for (const [sectionView, section] of sections) section.hidden = sectionView !== view;
    const copy = workspaceCopy[view];
    const label = document.querySelector<HTMLElement>("#workspace-location");
    const title = document.querySelector<HTMLElement>("#workspace-title");
    const description = document.querySelector<HTMLElement>("#workspace-description");
    if (label) label.textContent = copy.label;
    if (title) title.textContent = copy.title;
    if (description) description.textContent = copy.subtitle;
    document.title = copy.label + " · TNND";
    for (const link of links) {
      if (viewForHash(link.hash) === view) link.setAttribute("aria-current", "location");
      else link.removeAttribute("aria-current");
    }
  };

  const onHash = (): void => {
    const raw = decodeURIComponent(window.location.hash.replace(/^#/, ""));
    const target = raw ? document.getElementById(raw) : null;
    const owner = target?.closest<HTMLElement>(".panel")?.id ?? "";
    const container = target?.closest<HTMLElement>(".workspace-section");
    const view = (container?.dataset.workspaceSection as WorkspaceView | undefined)
      ?? viewForHash(window.location.hash, owner);
    pendingTargetId = raw && !target ? raw : "";
    setActive(view);
    // Visibility must be updated *before* scrolling to a deep-linked control.
    window.requestAnimationFrame(() => {
      if (view !== active) return;
      const destination = target ?? (view === "overview"
        ? document.getElementById("workspace-overview")
        : sections.get(view));
      destination?.scrollIntoView({ behavior: "auto", block: "start" });
    });
  };

  const update = (): void => {
    organize();
    // A deep link may target an asynchronously loaded form or conversation.
    if (pendingTargetId && document.getElementById(pendingTargetId)) {
      onHash();
    }
  };

  for (const link of links) link.addEventListener("click", event => {
    event.preventDefault();
    if (window.location.hash !== link.hash) history.pushState(null, "", link.hash);
    onHash();
  });
  window.addEventListener("hashchange", onHash);
  window.addEventListener("popstate", onHash);
  window.addEventListener("tnnd:auth-session-changed", update);

  const observer = new MutationObserver(records => {
    if (records.some(record => record.target === grid && Array.from(record.addedNodes).some(node =>
      node instanceof HTMLElement && node.classList.contains("panel")))) update();
  });
  observer.observe(grid, { childList: true });

  organize();
  setActive("overview");
  if (window.location.hash) onHash();
}
