/**
 * Browser-only visual smoke for the built extension's HTML/CSS.
 * Extension scripts are deliberately disabled: no live user data or backend calls.
 * The screenshots use synthetic fixture content and require manual visual review.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const root = resolve("dist");
const output = resolve(process.env.VISUAL_QA_DIR || "artifacts/neo-bento-extension");
const chrome = process.env.CHROME_BIN || "google-chrome";
const screens = [
  ["popup", 380, 600, "logged-out"],
  ["popup", 380, 600, "chat-open"],
  ["options", 1280, 900],
  ["options", 390, 844],
  ["preview", 1280, 900],
  ["preview", 390, 844]
];

function createStaticServer() {
  return createServer(async (req, res) => {
    try {
      const pathname = decodeURIComponent(new URL(req.url || "/", "http://localhost").pathname);
      const file = resolve(root, "." + pathname);
      if (relative(root, file).startsWith("..")) return res.writeHead(403).end();
      if (pathname.startsWith("/assets/") && pathname.endsWith(".js")) {
        res.writeHead(200, { "Content-Type": "application/javascript" }).end("/* visual QA: scripts disabled */");
        return;
      }
      const bytes = await readFile(file);
      const type = pathname.endsWith(".html") ? "text/html; charset=utf-8"
        : pathname.endsWith(".css") ? "text/css; charset=utf-8" : "application/octet-stream";
      res.writeHead(200, { "Content-Type": type, "Cache-Control": "no-store" }).end(bytes);
    } catch { res.writeHead(404).end("Not found"); }
  });
}

async function debugPort(profile, child) {
  for (let n = 0; n < 120; n++) {
    if (child.exitCode !== null) throw new Error("Chrome exited before DevTools started");
    try {
      const port = Number((await readFile(join(profile, "DevToolsActivePort"), "utf8")).split("\n")[0]);
      if (port > 0) return port;
    } catch { /* still starting */ }
    await sleep(100);
  }
  throw new Error("Chrome DevTools did not start");
}

async function openCDP(port) {
  const targets = await (await fetch("http://127.0.0.1:" + port + "/json/list")).json();
  const target = targets.find((t) => t.type === "page");
  assert.ok(target?.webSocketDebuggerUrl, "No Chrome page target");
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((ok, fail) => {
    socket.addEventListener("open", ok, { once: true });
    socket.addEventListener("error", fail, { once: true });
  });
  let id = 0;
  const pending = new Map();
  socket.addEventListener("message", (event) => {
    const msg = JSON.parse(event.data);
    if (!pending.has(msg.id)) return;
    const { ok, fail, method } = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? fail(new Error(method + ": " + msg.error.message + " " + JSON.stringify(msg.error.data || {}))) : ok(msg.result);
  });
  function send(method, params = {}) {
    const requestId = ++id;
    return new Promise((ok, fail) => {
      pending.set(requestId, { ok, fail, method });
      socket.send(JSON.stringify({ id: requestId, method, params }));
    });
  }
  async function evaluate(expression) {
    const result = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
    return result.result.value;
  }
  return { send, evaluate, close: () => socket.close() };
}

function syntheticFixtures(variant, extensionVersion) {
  const version = document.querySelector("#extensionVersion");
  if (version) version.textContent = "v" + extensionVersion;
  if (location.pathname.endsWith("popup.html") && variant === "chat-open") {
    const chat = document.querySelector("#chatEditor");
    const unavailable = document.querySelector("#chatUnavailable");
    if (chat && unavailable) { chat.classList.remove("hidden"); unavailable.classList.add("hidden"); }
    const alias = document.querySelector("#chatAlias");
    if (alias) alias.value = "Example conversation";
    const status = document.querySelector("#backendSyncStatus");
    if (status) status.textContent = "Connected (demo)";
    const loggedOut = document.querySelector("#backendLoggedOut");
    const loggedIn = document.querySelector("#backendLoggedIn");
    if (loggedOut && loggedIn) { loggedOut.classList.add("hidden"); loggedIn.classList.remove("hidden"); }
    const account = document.querySelector("#backendAccount");
    if (account) account.textContent = "demo@example.com";
  }
  if (location.pathname.endsWith("preview.html")) {
    const cards = document.querySelector("#cards");
    if (!cards) return;
    for (const titleText of ["Warm · French", "Playful · Darija"]) {
      const section = document.createElement("section");
      const title = document.createElement("h2");
      title.className = "card-heading";
      title.textContent = titleText;
      const chat = document.createElement("div");
      chat.className = "chat";
      for (const [who, message] of [
        ["them", "Hey! How has your week been?"],
        ["tnnd", "Pretty good! What was the highlight of yours?"]
      ]) {
        const bubble = document.createElement("div");
        bubble.className = "bubble " + who;
        const speaker = document.createElement("span");
        speaker.className = "speaker";
        speaker.textContent = who === "them" ? "Them" : "TNND";
        bubble.append(speaker, document.createTextNode(message));
        chat.appendChild(bubble);
      }
      section.append(title, chat);
      cards.appendChild(section);
    }
  }
}

function inspectLayout() {
  const css = getComputedStyle(document.documentElement);
  const visible = (el) => {
    const s = getComputedStyle(el);
    return s.display !== "none" && s.visibility !== "hidden" && el.getClientRects().length > 0;
  };
  const tooSmall = Array.from(document.querySelectorAll("button, .button"))
    .filter(visible).filter((el) => el.getBoundingClientRect().height < 43.5)
    .map((el) => ({ id: el.id, height: el.getBoundingClientRect().height }));
  return {
    theme: css.colorScheme,
    background: css.getPropertyValue("--nb-bg").trim().toLowerCase(),
    hasMain: !!document.querySelector("main"),
    hasStylesheet: Array.from(document.styleSheets).some((s) => s.href?.endsWith("/neo-bento.css")),
    horizontalOverflow: Math.max(0, document.documentElement.scrollWidth - innerWidth),
    smallButtons: tooSmall
  };
}

async function capture(cdp, base, name, width, height, theme, variant = "", extensionVersion = "") {
  await cdp.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
  await cdp.send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-color-scheme", value: theme }, { name: "prefers-reduced-motion", value: "reduce" }]
  });
  await cdp.send("Page.navigate", { url: base + "/" + name + ".html" });
  let loaded = false;
  for (let i = 0; i < 80; i++) {
    loaded = await cdp.evaluate(
      "location.pathname.endsWith('/" + name + ".html') && document.readyState === 'complete' && Array.from(document.styleSheets).some(s => s.href && s.href.endsWith('/neo-bento.css'))"
    );
    if (loaded) break;
    await sleep(100);
  }
  assert.ok(loaded, name + ": stylesheet not loaded");
  await cdp.evaluate("(" + syntheticFixtures.toString() + ")(" + JSON.stringify(variant) + "," + JSON.stringify(extensionVersion) + ")");
  const result = await cdp.evaluate("(" + inspectLayout.toString() + ")()");
  const label = name + (variant ? "-" + variant : "") + "-" + theme + "-" + width;
  assert.ok(result.hasMain && result.hasStylesheet, label + ": missing main or CSS");
  assert.equal(result.theme, theme, label + ": color scheme");
  assert.equal(result.background, theme === "dark" ? "#101e1a" : "#f6f8f3", label + ": theme token");
  assert.ok(result.horizontalOverflow <= 1, label + ": horizontal overflow " + result.horizontalOverflow + "px");
  assert.deepEqual(result.smallButtons, [], label + ": controls below 44px");
  const png = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true, fromSurface: true });
  await writeFile(join(output, label + ".png"), Buffer.from(png.data, "base64"));
  console.log("PASS " + label);
  return { label, ...result, screenshot: label + ".png" };
}

async function main() {
  await mkdir(output, { recursive: true });
  const server = createStaticServer();
  await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
  const profile = await mkdtemp(join(tmpdir(), "tnnd-visual-chrome-"));
  const child = spawn(chrome, [
    "--headless=new", "--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu",
    "--disable-extensions", "--no-first-run", "--no-default-browser-check",
    "--remote-allow-origins=*", "--remote-debugging-port=0",
    "--user-data-dir=" + profile, "about:blank"
  ], { stdio: "ignore" });
  let cdp;
  try {
    cdp = await openCDP(await debugPort(profile, child));
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    const report = [];
    const extensionVersion = JSON.parse(await readFile(join(root, "manifest.json"), "utf8")).version;
    const base = "http://127.0.0.1:" + server.address().port;
    for (const [name, width, height, variant] of screens) {
      for (const theme of ["light", "dark"]) {
        report.push(await capture(cdp, base, name, width, height, theme, variant, extensionVersion));
      }
    }
    await writeFile(join(output, "report.json"), JSON.stringify({
      note: "Static HTML/CSS smoke only; no extension APIs, live data, or interaction tests.",
      report
    }, null, 2) + "\n");
    console.log("Visual smoke passed: " + report.length + " screenshots.");
  } finally {
    cdp?.close();
    child.kill("SIGTERM");
    server.close();
    await rm(profile, { recursive: true, force: true, maxRetries: 4, retryDelay: 150 });
  }
}
await main();
