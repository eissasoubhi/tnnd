import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import test from "node:test";

const directory = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(resolve(directory, "neo-bento.css"), "utf8");
const entrypoint = readFileSync(resolve(directory, "main.ts"), "utf8");
const navigation = readFileSync(resolve(directory, "workspace-scroll-navigation.ts"), "utf8");
const setup = readFileSync(resolve(directory, "setup-guidance-panel.ts"), "utf8");

test("Neo Bento is loaded after the legacy stylesheet", () => {
  assert.match(entrypoint, /import "\.\/styles\.css";\s*import "\.\/neo-bento\.css";/);
});

test("Neo Bento defines accessible light and dark semantic colors", () => {
  for (const token of [
    "--nb-bg", "--nb-surface", "--nb-text", "--nb-text-muted", "--nb-border",
    "--nb-primary", "--nb-on-primary", "--nb-focus", "--nb-mint", "--nb-lilac",
    "--nb-peach", "--nb-danger"
  ]) {
    assert.ok(css.includes(`${token}:`), `missing semantic token: ${token}`);
  }
  assert.match(css, /@media \(prefers-color-scheme: dark\)/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
});

test("Neo Bento keeps a responsive navigation and panel layout", () => {
  assert.match(css, /\.workspace-nav/);
  assert.match(css, /\.grid > \.panel/);
  assert.match(css, /@media \(max-width: 840px\)/);
  assert.match(css, /@media \(max-width: 560px\)/);
});


test("Section-first navigation preserves mounted forms and hides other views", () => {
  assert.match(entrypoint, /initWorkspaceScrollNavigation\(\);/);
  assert.match(navigation, /function initWorkspaceScrollNavigation\(\)/);
  assert.match(navigation, /section\.hidden = sectionView !== view/);
  assert.match(navigation, /areas\.get\(locate\(panel\)\)\?\.append\(panel\)/);
  assert.match(navigation, /link\.setAttribute\("aria-current", "location"\)/);
  assert.match(navigation, /pendingTargetId/);
  assert.match(navigation, /document\.title = copy\.label/);
  assert.doesNotMatch(navigation, /new IntersectionObserver\(scheduleSpy/);
  assert.match(css, /\.workspace-section\[hidden\] \{ display: none !important;/);
  assert.match(css, /\.shell\[data-workspace-view\]:not\(\[data-workspace-view="overview"\]\) \.metrics \{ display: none;/);
  assert.match(css, /#app \.workspace-nav \{ z-index: 25; align-self: start;/);
});

test("Setup cards have one full-width actionable link and don't overflow", () => {
  assert.match(setup, /link\.className = "setup-step-link"/);
  assert.match(setup, /link\.append\(title, flag\)/);
  assert.match(css, /#app #setup-guidance-panel \.setup-step-link/);
  assert.match(css, /overflow-wrap: anywhere/);
  assert.match(css, /@media\(max-width: 700px\)/);
});
