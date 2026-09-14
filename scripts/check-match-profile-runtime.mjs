import fs from "node:fs";
const source = fs.readFileSync(new URL("../src/tinder-match-profile-runtime.ts", import.meta.url), "utf8");
if (!source.includes("await uploadVisibleMatchProfileCapture") || !source.includes("await saveMatchProfileSyncState")) throw new Error("runtime sync must upload and persist ACK state");
if (source.indexOf("await saveMatchProfileSyncState") < source.indexOf("await uploadVisibleMatchProfileCapture")) throw new Error("checkpoint cannot persist before upload success");
if (!source.includes('decision.status !== "upload"')) throw new Error("empty and unchanged captures must remain skipped");
console.log("MatchProfile runtime ACK ordering check passed");
