import { strToU8, zipSync } from "fflate";

/** One read-only export for the currently mounted Tinder page.
 * No requests, browser storage, credentials, cookies or raw message text.
 * Screenshots remain opt-in because they can contain visible personal data.
 */
export interface TinderPageDiagnosticSnapshot {
  generatedAt: string;
  page: { url?: string; document?: { width?: number; height?: number }; [key: string]: unknown };
  selectors: { view?: string; viewSignals?: string[]; [key: string]: unknown };
  resources: unknown;
  config: unknown;
  domHtml: string;
  domTruncated: boolean;
}

export type TinderDiagnosticArchive = {
  filename: string;
  zip: Uint8Array;
  screenshotIncluded: boolean;
};

function safeView(view: unknown): string {
  return typeof view === "string" && /^(discovery|inbox|conversation|unknown)$/.test(view)
    ? view : "unknown";
}

export function buildTinderPageDiagnosticArchive(
  snapshot: TinderPageDiagnosticSnapshot,
  extensionVersion: string,
  screenshot?: Uint8Array | null,
  at = new Date()
): TinderDiagnosticArchive {
  const view = safeView(snapshot.selectors?.view);
  const exportedAt = at.toISOString();
  const files: Record<string, Uint8Array> = {
    "metadata.json": strToU8(JSON.stringify({
      kind: "tnnd-tinder-page-diagnostic",
      schemaVersion: 1,
      exportedAt,
      extensionVersion,
      tinderView: view,
      domTruncated: snapshot.domTruncated,
      screenshotIncluded: Boolean(screenshot?.length),
      coverage: "Current rendered/mounted document only; virtualized, unloaded or off-screen route states may be absent. No navigation or automatic scrolling.",
      privacy: "DOM text, form values and sensitive DOM attributes are masked by the content script. Never includes cookies, browser storage, auth headers or network response bodies. Opt-in screenshot may contain visible private profile/chat details."
    }, null, 2)),
    "page.json": strToU8(JSON.stringify(snapshot.page, null, 2)),
    "selectors.json": strToU8(JSON.stringify(snapshot.selectors, null, 2)),
    "resources.json": strToU8(JSON.stringify(snapshot.resources, null, 2)),
    "config-summary.json": strToU8(JSON.stringify(snapshot.config, null, 2)),
    "dom-redacted.html": strToU8(snapshot.domHtml)
  };
  if (screenshot?.length) files["screenshot-visible.png"] = screenshot;
  const filename = `tnnd-tinder-page-${view}-${exportedAt.replace(/[:.]/g, "-")}.zip`;
  return { filename, zip: zipSync(files, { level: 6 }), screenshotIncluded: Boolean(screenshot?.length) };
}

export function saveTinderPageDiagnosticArchive(archive: TinderDiagnosticArchive): void {
  const blob = new Blob([archive.zip], { type: "application/zip" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = archive.filename;
  link.style.display = "none";
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 15_000);
}

export function screenshotDataUrlBytes(dataUrl: string): Uint8Array {
  if (!dataUrl.startsWith("data:image/png;base64,")) throw new Error("Capture PNG invalide.");
  const binary = atob(dataUrl.slice("data:image/png;base64,".length));
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}
