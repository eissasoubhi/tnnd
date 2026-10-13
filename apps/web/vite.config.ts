import { defineConfig } from "vite";

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
  server: {
    proxy: {
      "/api": {
        target,
        changeOrigin: true
      }
    }
  }
});
