import { readFile } from "node:fs/promises";

const readme = await readFile(new URL("../README.md", import.meta.url), "utf8");

if (readme.length !== 0) {
  console.error("README.md must remain strictly empty while the repository is public.");
  process.exitCode = 1;
} else {
  console.log("README.md public-empty guardrail: OK");
}
