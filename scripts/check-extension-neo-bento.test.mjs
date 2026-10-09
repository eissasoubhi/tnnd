import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import test from "node:test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(resolve(root, path), "utf8");
const css = read("public/neo-bento.css");

test("all extension views load the shared Neo Bento stylesheet after their local CSS", () => {
  for (const path of ["public/popup.html", "public/options.html", "public/preview.html"]) {
    const html = read(path);
    assert.match(html, /<\/style><link rel="stylesheet" href="neo-bento\.css"><\/head>/);
    assert.equal((html.match(/href="neo-bento\.css"/g) ?? []).length, 1, path);
  }
});

test("extension build copies the shared stylesheet into dist", () => {
  assert.match(read("scripts/build.mjs"), /"popup\.html", "neo-bento\.css"/);
});

test("extension Neo Bento has semantic tokens, dark mode, keyboard focus and reduced motion", () => {
  for (const token of ["--nb-bg", "--nb-surface", "--nb-text", "--nb-muted", "--nb-border", "--nb-primary", "--nb-on-primary", "--nb-focus", "--nb-mint", "--nb-lilac", "--nb-peach", "--nb-danger"]) {
    assert.ok(css.includes(token + ":"), "Missing token " + token);
  }
  assert.match(css, /:focus-visible/);
  assert.match(css, /@media \(prefers-color-scheme: dark\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /@media \(max-width: 650px\)/);
});

test("extension view behavior IDs are preserved", () => {
  const popup = read("public/popup.html");
  for (const id of ["webDiagnosticCard", "backendLogin", "backendLogout", "chatEditor", "saveChat", "exportDiagnostics", "openSettings", "openPreview"]) {
    assert.ok(popup.includes('id="' + id + '"'), "Missing popup behavior ID: " + id);
  }
  assert.ok(read("public/options.html").includes('id="settings-form"'));
  assert.ok(read("public/preview.html").includes('id="generateMatrix"'));
});
