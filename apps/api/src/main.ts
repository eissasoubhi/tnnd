import { createServer } from "node:http";
import { publicProfileSchema } from "./profile-schema";

const port = Number(process.env.PORT ?? 4000);
const host = process.env.HOST ?? "127.0.0.1";

const server = createServer((request, response) => {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? `${host}:${port}`}`);

  if (request.method === "GET" && url.pathname === "/health") {
    response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({
      ok: true,
      service: "tnnd-api",
      version: "0.1.0",
      now: new Date().toISOString()
    }));
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/v1/meta") {
    response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({
      apiVersion: "v1",
      capabilities: ["health", "profile-schema", "account-foundation", "extension-sync-foundation"]
    }));
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/v1/profile/schema") {
    response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    response.end(JSON.stringify(publicProfileSchema()));
    return;
  }

  response.writeHead(404, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify({ error: "not_found" }));
});

server.listen(port, host, () => {
  console.log(`TNND API listening on http://${host}:${port}`);
});
