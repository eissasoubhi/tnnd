import assert from "node:assert/strict";
import test from "node:test";
import { archiveSourceUrls, downloadVerifiedTinderImage, verifiedImageMime } from "./tinder-photo-archive-service.js";

test("accept only bounded HTTPS Tinder gallery URLs from the saved match profile",()=>{
  assert.deepEqual(archiveSourceUrls({
    photoUrl:"https://images-ssl.gotinder.com/first.jpg",
    photoUrls:[
      "https://images-ssl.gotinder.com/first.jpg",
      "https://images-ssl.gotinder.com/second.webp",
      "http://images-ssl.gotinder.com/third.jpg",
      "https://gotinder.com.evil.example/fake.jpg",
      "javascript:alert(1)"
    ]
  }),["https://images-ssl.gotinder.com/first.jpg","https://images-ssl.gotinder.com/second.webp"]);
});
test("verify real binary signatures rather than trusting MIME headers or SVG",()=>{
  assert.equal(verifiedImageMime(Buffer.from([255,216,255,1])),"image/jpeg");
  assert.equal(verifiedImageMime(Buffer.from([137,80,78,71,13,10,26,10,1])),"image/png");
  assert.equal(verifiedImageMime(Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>")) ,null);
});
test("stream a valid photo without cookies or redirects and reject nonimages",async()=>{
  let options:RequestInit | undefined;
  const good = async (_url:string, init?: RequestInit) => {
    options=init;return new Response(new Uint8Array([255,216,255,7]),{status:200,headers:{"content-type":"image/png"}});
  };
  const result=await downloadVerifiedTinderImage("https://images-ssl.gotinder.com/photo",good as typeof fetch);
  assert.equal(result.mediaType,"image/jpeg");
  assert.equal(options?.redirect,"error");
  assert.equal(options?.credentials,"omit");
  await assert.rejects(downloadVerifiedTinderImage(
    "https://images-ssl.gotinder.com/script.svg",
    (async()=>new Response("<svg/>",{status:200})) as typeof fetch
  ),/unrecognized_image_binary/);
  await assert.rejects(downloadVerifiedTinderImage(
    "https://unknown.example/photo",good as typeof fetch
  ),/unsupported_photo_source/);
});
