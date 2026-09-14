import fs from "node:fs";

const source = fs.readFileSync(new URL("../src/tinder-match-profile-runtime.ts", import.meta.url), "utf8");
const upload = source.indexOf("await uploadVisibleMatchProfileCapture");
const confirm = source.indexOf("confirmVisibleMatchProfileUpload");
const persist = source.indexOf("await saveMatchProfileSyncState");
if (upload < 0 || confirm < upload || persist < confirm) {
  throw new Error("MatchProfile checkpoint must be confirmed and persisted only after backend upload succeeds");
}
if (!source.includes('decision.status !== "upload"')) {
  throw new Error("empty and unchanged captures must remain skipped");
}
console.log("MatchProfile runtime ACK ordering check passed");
