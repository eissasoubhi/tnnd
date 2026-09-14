import fs from "node:fs";

const source = fs.readFileSync(new URL("../src/tinder-match-profile-runtime.ts", import.meta.url), "utf8");
const functionStart = source.indexOf("export async function syncObservedMatchProfile");
const body = functionStart >= 0 ? source.slice(functionStart) : "";
const upload = body.indexOf("await uploadVisibleMatchProfileCapture");
const persist = body.indexOf("await saveMatchProfileSyncState");
const confirm = body.indexOf("confirmVisibleMatchProfileUpload", upload);
if (upload < 0 || persist < upload || confirm < upload || confirm > persist) {
  throw new Error("MatchProfile checkpoint must be confirmed and persisted only after backend upload succeeds");
}
if (!body.includes('decision.status !== "upload"')) {
  throw new Error("empty and unchanged captures must remain skipped");
}
console.log("MatchProfile runtime ACK ordering check passed");
