import { defineConfig } from "vite";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readWebVersion, resolveWebCommit } from "./build-info";

const webRoot = dirname(fileURLToPath(import.meta.url));
const gitRoot = resolve(webRoot, "../..");
const webVersion = readWebVersion(webRoot);
// The SHA is read once when the Web server starts or a production bundle is
// built. Restart the Web container after git pull to display the new SHA.
const webCommit = resolveWebCommit(gitRoot, process.env) ?? "unknown";

/**
 * Local TNND Web traffic stays on the Vite origin: /api/v1/* is transparently
 * forwarded by the dev server. This avoids cross-origin browser preflights
 * between localhost / 127.0.0.1 while preserving authenticated API headers.
 *
 * In Docker set TNND_DEV_API_PROXY_TARGET=http://api:4000. Outside Docker
 * the target defaults to the local API port.
 */
const target = process.env.TNND_DEV_API_PROXY_TARGET ?? "http://127.0.0.1:4000";

export default defineConfig({
  define: {
    __TNND_WEB_VERSION__: JSON.stringify(webVersion),
    __TNND_WEB_COMMIT__: JSON.stringify(webCommit)
  },
  server: {
    proxy: {
      "/api": {
        target,
        changeOrigin: true
      }
    }
  }
});
