/**
 * Safe interactive QA on TNND Web.
 *
 * This intentionally NEVER presses arbitrary application buttons or submits
 * forms: those actions can send messages, delete data or change billing/state.
 * Full mutations are reserved for isolated browser fixtures. This module
 * verifies real in-page navigation and disclosure interactions, then audits
 * all rendered buttons for accessibility, clipping and target sizes.
 *
 * No DOM text, input values, user identifiers, or conversation content leave
 * the tab in the result. Element references use only static id/class names.
 */
export type UiAuditSeverity = "error" | "warning" | "info";

export interface UiAuditIssue {
  code: string;
  severity: UiAuditSeverity;
  control: string;
  section: string;
  details: string;
}

export interface UiAuditCheck {
  name: string;
  result: "passed" | "failed" | "skipped";
  details: string;
}

export interface UiAuditReport {
  schemaVersion: 1;
  generatedAt: string;
  viewport: { width: number; height: number };
  sections: number;
  buttons: { visible: number; disabled: number; notClickedForSafety: number };
  navLinks: number;
  disclosures: number;
  checks: UiAuditCheck[];
  issues: UiAuditIssue[];
  limitations: string[];
}

function visible(element: Element): boolean {
  const styles = getComputedStyle(element);
  return styles.visibility !== "hidden" && styles.display !== "none" &&
    element.getClientRects().length > 0;
}

function reference(element: Element): string {
  if (element.id && /^[a-z0-9-]+$/i.test(element.id)) return "#" + element.id;
  // Never use textContent, href, title or data-* values as identifiers.
  const cls = Array.from(element.classList).filter(s => /^[a-z][a-z0-9_-]{1,40}$/i.test(s)).slice(0,2);
  return element.tagName.toLowerCase() + (cls.length ? "." + cls.join(".") : "");
}

function section(element: Element): string {
  return element.closest<HTMLElement>("[data-workspace-section]")?.dataset.workspaceSection ?? "workspace";
}

const settle = () => new Promise<void>(resolve => setTimeout(resolve, 75));

export async function runWebUiAudit(): Promise<UiAuditReport> {
  const issues: UiAuditIssue[] = [];
  const checks: UiAuditCheck[] = [];
  const add = (code: string, severity: UiAuditSeverity, control: Element, details: string): void => {
    // Bound the report to avoid large exports on chat-heavy user pages.
    if (issues.length < 180) issues.push({ code, severity, control: reference(control), section: section(control), details });
  };
  const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>("button")).filter(visible);
  const clickable = buttons.filter(el => !el.disabled);
  const viewportWidth = document.documentElement.clientWidth;
  let disabled = 0;
  for (const button of buttons) {
    if (button.disabled) { disabled++; continue; }
    const label = button.getAttribute("aria-label")?.trim() ||
      button.getAttribute("title")?.trim() ||
      button.textContent?.trim() || "";
    if (!label) add("missing-accessible-name", "error", button, "Button has no readable name or aria-label.");
    const rect = button.getBoundingClientRect();
    if (rect.width < 36 || rect.height < 36) {
      add("small-click-target", "warning", button, "Interactive area is smaller than 36px on at least one axis.");
    }
    if (rect.left < -1 || rect.right > viewportWidth + 1) {
      add("horizontal-overflow", "error", button, "Button extends outside the viewport horizontally.");
    }
  }
  const idCounts = new Map<string, number>();
  for (const el of document.querySelectorAll<HTMLElement>("[id]")) {
    idCounts.set(el.id, (idCounts.get(el.id) ?? 0) + 1);
    if (idCounts.get(el.id) === 2) add("duplicate-id", "error", el, "Two or more elements share this id.");
  }
  const internalLinks = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href^="#"]')).filter(visible);
  for (const a of internalLinks) {
    const raw = a.hash.slice(1);
    if (!raw || !document.getElementById(raw)) {
      add("broken-anchor", "error", a, "Internal navigation destination is missing.");
    }
  }
  const wide = Math.max(0, document.documentElement.scrollWidth - viewportWidth);
  if (wide > 2) {
    add("document-overflow", "error", document.documentElement, "Document has horizontal overflow: " + Math.round(wide) + "px.");
  }
  checks.push({ name: "Visible button labels and geometry", result: issues.some(i => ["missing-accessible-name","horizontal-overflow"].includes(i.code)) ? "failed" : "passed", details: clickable.length + " enabled buttons inspected; no state-changing button was pressed." });
  checks.push({ name: "Internal anchor targets", result: issues.some(i => i.code === "broken-anchor") ? "failed" : "passed", details: internalLinks.length + " visible anchor targets checked." });
  checks.push({ name: "Horizontal viewport overflow", result: wide > 2 ? "failed" : "passed", details: Math.round(wide) + "px of document overflow." });

  const links = Array.from(document.querySelectorAll<HTMLAnchorElement>('.workspace-nav a[href^="#"]')).filter(visible);
  const locationBefore = location.pathname + location.search + location.hash;
  const yBefore = window.scrollY;
  const scrollBefore = document.documentElement.style.scrollBehavior;
  let passedNav = 0;
  let testedNav = 0;
  let testedDisclosures = 0;
  try {
    document.documentElement.style.scrollBehavior = "auto";
    for (const link of links) {
      const hash = link.hash;
      if (!hash || !document.getElementById(hash.slice(1))) continue;
      testedNav++;
      link.click();
      await settle();
      const hashMatch = location.hash === hash;
      const activeMatch = link.getAttribute("aria-current") === "location";
      if (hashMatch && activeMatch) passedNav++;
      else add("navigation-not-responsive", "error", link, "Click did not update the URL and active section indicator.");
    }
    checks.push({ name: "Click each workspace navigation link", result: testedNav && testedNav === passedNav ? "passed" : "failed", details: passedNav + "/" + testedNav + " navigation clicks updated hash and active marker." });

    const disclosures = Array.from(document.querySelectorAll<HTMLDetailsElement>("details")).filter(visible);
    for (const details of disclosures.slice(0, 40)) {
      const summary = details.querySelector("summary");
      if (!summary || !visible(summary)) continue;
      const before = details.open;
      testedDisclosures++;
      summary.click();
      if (details.open === before) add("disclosure-not-responsive", "error", details, "Clicking summary did not toggle this section.");
      details.open = before;
    }
    checks.push({ name: "Expandable groups", result: issues.some(i => i.code === "disclosure-not-responsive") ? "failed" : "passed", details: testedDisclosures + " groups clicked and restored." });
  } finally {
    history.replaceState(null, "", locationBefore);
    window.dispatchEvent(new Event("hashchange"));
    document.documentElement.style.scrollBehavior = scrollBefore;
    window.scrollTo({ top: yBefore, behavior: "instant" });
  }
  return {
    schemaVersion: 1, generatedAt: new Date().toISOString(),
    viewport: { width: window.innerWidth, height: window.innerHeight },
    sections: document.querySelectorAll("[data-workspace-section]").length,
    buttons: { visible: buttons.length, disabled, notClickedForSafety: clickable.length },
    navLinks: testedNav, disclosures: testedDisclosures, checks, issues,
    limitations: [
      "Only read-only navigation and disclosure clicks are executed on live user data.",
      "Mutation, send, delete, account settings, generation and payment buttons require a separate synthetic-fixture E2E environment.",
      "This is a runtime ergonomics and wiring audit, not a guarantee every backend action succeeds."
    ]
  };
}
