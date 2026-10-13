/** UI-only formatting; do not claim a commit hash when Git metadata is absent. */
export function formatWebBuildLabel(version: string, commit: string): string {
  const safeVersion = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version) ? version : "unknown";
  const short = /^[0-9a-f]{7,40}$/i.test(commit) ? commit.slice(0, 8).toLowerCase() : "unknown";
  return `Web v${safeVersion} (${short})`;
}
export function formatWebBuildDescription(version: string, commit: string): string {
  const sha = /^[0-9a-f]{7,40}$/i.test(commit) ? commit.toLowerCase() : "unavailable";
  return `TNND Web version ${version}, Git commit ${sha}. Captured when the Web server started or the bundle was built. Restart Web after git pull to refresh it. This is not the Chrome extension version.`;
}
declare const __TNND_WEB_VERSION__: string;
declare const __TNND_WEB_COMMIT__: string;
export function webBuildInfo(): { label: string; description: string } {
  return {
    label: formatWebBuildLabel(__TNND_WEB_VERSION__, __TNND_WEB_COMMIT__),
    description: formatWebBuildDescription(__TNND_WEB_VERSION__, __TNND_WEB_COMMIT__)
  };
}
