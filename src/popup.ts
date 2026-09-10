import { strToU8, zipSync } from "fflate";

interface DiagnosticResponse {
  ok: boolean;
  snapshot?: {
    generatedAt: string;
    page: unknown;
    selectors: unknown;
    resources: unknown;
    config: unknown;
    domHtml: string;
    domTruncated: boolean;
  };
  error?: string;
}

const version = document.getElementById("extensionVersion")!;
const status = document.getElementById("status")!;
const exportButton = document.getElementById("exportDiagnostics") as HTMLButtonElement;
const openSettings = document.getElementById("openSettings") as HTMLButtonElement;
const openPreview = document.getElementById("openPreview") as HTMLButtonElement;
version.textContent = `v${chrome.runtime.getManifest().version}`;

function isTinderUrl(value?: string): boolean {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && (url.hostname === "tinder.com" || url.hostname === "www.tinder.com");
  } catch {
    return false;
  }
}

function screenshotBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(",", 2)[1] ?? "";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function downloadZip(files: Record<string, Uint8Array>): void {
  const zipped = zipSync(files, { level: 6 });
  const blob = new Blob([zipped], { type: "application/zip" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `tnnd-diagnostics-${new Date().toISOString().replace(/[:.]/g, "-")}.zip`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

async function exportDiagnostics(): Promise<void> {
  exportButton.disabled = true;
  status.textContent = "Collecting redacted diagnostics…";
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !isTinderUrl(tab.url)) throw new Error("Open Tinder in the active tab, then click TNND again.");

    const response = await chrome.tabs.sendMessage(tab.id, { type: "TNND_GET_DIAGNOSTICS" }) as DiagnosticResponse;
    if (!response?.ok || !response.snapshot) throw new Error(response?.error ?? "The Tinder content script did not return diagnostics.");
    const snapshot = response.snapshot;

    let screenshot: Uint8Array | null = null;
    let screenshotError = "";
    try {
      const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "png" });
      screenshot = screenshotBytes(dataUrl);
    } catch (error) {
      screenshotError = error instanceof Error ? error.message : "Visible-tab screenshot was unavailable.";
    }

    const metadata = {
      kind: "tnnd-diagnostics",
      schemaVersion: 1,
      extensionVersion: chrome.runtime.getManifest().version,
      exportedAt: new Date().toISOString(),
      domTruncated: snapshot.domTruncated,
      screenshotIncluded: Boolean(screenshot),
      screenshotError: screenshotError || undefined,
      privacy: "DOM text/form values and sensitive attributes are redacted. Cookies, auth headers, tokens, request/response bodies, localStorage and sessionStorage are not exported. A screenshot can still visibly contain profile/chat content because it represents the active page."
    };

    const files: Record<string, Uint8Array> = {
      "metadata.json": strToU8(JSON.stringify(metadata, null, 2)),
      "page.json": strToU8(JSON.stringify(snapshot.page, null, 2)),
      "selectors.json": strToU8(JSON.stringify(snapshot.selectors, null, 2)),
      "resources.json": strToU8(JSON.stringify(snapshot.resources, null, 2)),
      "config-summary.json": strToU8(JSON.stringify(snapshot.config, null, 2)),
      "dom-redacted.html": strToU8(snapshot.domHtml)
    };
    if (screenshot) files["screenshot-visible.png"] = screenshot;
    downloadZip(files);
    status.textContent = screenshot ? "Diagnostic ZIP exported with visible screenshot." : "Diagnostic ZIP exported. Screenshot was unavailable; the rest of the bundle is included.";
  } finally {
    exportButton.disabled = false;
  }
}

openSettings.addEventListener("click", () => void chrome.runtime.openOptionsPage());
openPreview.addEventListener("click", () => void chrome.tabs.create({ url: chrome.runtime.getURL("preview.html") }));
exportButton.addEventListener("click", () => void exportDiagnostics().catch((error) => {
  status.textContent = error instanceof Error ? error.message : "Could not export diagnostics.";
  exportButton.disabled = false;
}));
