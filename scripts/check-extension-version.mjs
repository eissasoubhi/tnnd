import { readFile } from "node:fs/promises";

const [packageJson, manifest] = await Promise.all([
  readFile(new URL("../package.json", import.meta.url), "utf8").then(JSON.parse),
  readFile(new URL("../public/manifest.json", import.meta.url), "utf8").then(JSON.parse)
]);

if (typeof packageJson.version !== "string" || typeof manifest.version !== "string") {
  throw new Error("Extension package and manifest must both declare a version");
}

if (packageJson.version !== manifest.version) {
  throw new Error(`Extension version mismatch: package.json=${packageJson.version}, manifest.json=${manifest.version}`);
}

console.log(`Extension version ${manifest.version} is consistent.`);
