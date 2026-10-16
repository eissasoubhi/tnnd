import assert from "node:assert/strict";
import { redactDiagnosticInlineStyle } from "../src/tinder-diagnostic-inline-style-redaction.ts";

const sample = "background-image: url(\"https://example.invalid/private-profile-photo.jpg?token=hidden\"); transform: translateX(0px);";
const actual = redactDiagnosticInlineStyle(sample);
assert.equal(actual, 'background-image: url("[redacted-media-url]"); transform: translateX(0px);');
assert.equal(actual.includes("private-profile-photo"), false);
assert.equal(redactDiagnosticInlineStyle("background-image:url('https://example.invalid/image')"), 'background-image:url("[redacted-media-url]")');
assert.equal(redactDiagnosticInlineStyle("width: 100%; height: 50px"), "width: 100%; height: 50px");
console.log("Inline diagnostic CSS URLs are redacted.");
