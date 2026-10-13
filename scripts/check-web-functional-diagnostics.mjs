import assert from "node:assert/strict";
import test from "node:test";
import { functionalFindings } from "../src/web-functional-diagnostics.ts";
const at=100_000;
test("detects server 500, network errors and 200 application failures after clicks",()=>{
 const events=[
 {kind:"ui-click",at:at-100,pageSessionId:"p",detail:"generate-draft"},
 {kind:"fetch-end",at,pageSessionId:"p",id:"a",method:"POST",url:"http://127.0.0.1:5173/api/v1/conversations/private-uuid/generate",status:500},
 {kind:"app-error",at:at+1,pageSessionId:"p",id:"a",method:"POST",url:"http://127.0.0.1:5173/api/v1/conversations/private-uuid/generate",status:500,detail:"internal_error"},
 {kind:"app-error",at:at+2,pageSessionId:"p",id:"b",method:"POST",url:"http://127.0.0.1:5173/api/v1/ai/test-connection",status:200,detail:"ai_connection_failed"},
 {kind:"fetch-error",at:at+3,pageSessionId:"p",id:"c",method:"GET",url:"http://127.0.0.1:5173/api/v1/human-actions",detail:"TypeError"},
 ];
 const findings=functionalFindings(events,at+200);
 assert.ok(findings.some(x=>x.operation==="conversation.generate"&&x.errorCode==="internal_error"&&x.action==="generate-draft"));
 assert.ok(findings.some(x=>x.operation==="gemini.test"&&x.httpStatus===200&&x.kind==="application"));
 assert.ok(findings.some(x=>x.kind==="network"));
 assert.ok(!JSON.stringify(findings).includes("private-uuid"));
});
test("ignores expected profile 404 and unrelated traffic",()=>{
 assert.deepEqual(functionalFindings([{kind:"fetch-end",at,pageSessionId:"p",status:404,method:"GET",url:"http://localhost:5173/api/v1/profile"}],at),[]);
});

test("missing optional texting-style source examples does not count as a broken feature", () => {
  const events = [
    {kind:"fetch-end",at,pageSessionId:"p",status:404,method:"GET",id:"styles",url:"http://localhost:5173/api/v1/profile/texting-style/source-examples"},
    {kind:"app-error",at:at+1,pageSessionId:"p",status:404,method:"GET",id:"styles",url:"http://localhost:5173/api/v1/profile/texting-style/source-examples",detail:"texting_style_source_examples_not_found"}
  ];
  assert.deepEqual(functionalFindings(events,at+300),[]);
});

test("missing /analytics route is treated as a real functional API failure", () => {
  const findings = functionalFindings([{kind:"fetch-end",at,pageSessionId:"p",status:404,method:"GET",id:"analytics",url:"http://localhost:5173/api/v1/analytics"}],at);
  assert.equal(findings[0]?.operation,"analytics");
  assert.match(findings[0]?.nextStep ?? "",/API/);
});
