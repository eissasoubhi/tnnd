import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import test from "node:test";

const directory = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(resolve(directory, "neo-bento.css"), "utf8");
const entrypoint = readFileSync(resolve(directory, "main.ts"), "utf8");

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
