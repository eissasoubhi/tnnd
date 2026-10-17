import { createHash, randomUUID } from "node:crypto";
import { getPool } from "./db-client.js";
import { normalizeTinderPhotoUrl, type MatchProfileVisibleFields } from "./match-profile-contract.js";

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
export function verifiedImageMime(bytes: Buffer): string | null {
  if (bytes.length >= 3 && bytes[0]===0xff && bytes[1]===0xd8 && bytes[2]===0xff) return "image/jpeg";
  if (bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return "image/png";
  if (bytes.length >= 12 && bytes.toString("ascii",0,4)==="RIFF" && bytes.toString("ascii",8,12)==="WEBP") return "image/webp";
  if (bytes.length >= 6 && ["GIF87a","GIF89a"].includes(bytes.toString("ascii",0,6))) return "image/gif";
  return null;
}
export function archiveSourceUrls(fields: MatchProfileVisibleFields): string[] {
  return [...new Set([fields.photoUrl,...(fields.photoUrls ?? [])]
    .map(normalizeTinderPhotoUrl).filter((u):u is string => Boolean(u)))].slice(0,12);
}
export async function downloadVerifiedTinderImage(source: string, fetcher: typeof fetch = fetch):
Promise<{bytes:Buffer; mediaType:string}> {
  const safe = normalizeTinderPhotoUrl(source);
  if (!safe) throw new Error("unsupported_photo_source");
  const response=await fetcher(safe,{method:"GET",redirect:"error",credentials:"omit",signal:AbortSignal.timeout(9000)});
  if(!response.ok || !response.body) throw new Error("photo_source_unavailable");
  const declared=Number(response.headers.get("content-length"));
  if (declared > MAX_IMAGE_BYTES) {await response.body.cancel();throw new Error("photo_too_large");}
  const chunks:Buffer[]=[];
  const reader=response.body.getReader();
  let size=0;
  try {
    while (true) {
      const part=await reader.read();if(part.done)break;
      size+=part.value.byteLength;
      if(size>MAX_IMAGE_BYTES)throw new Error("photo_too_large");
      chunks.push(Buffer.from(part.value));
    }
  } finally {await reader.cancel().catch(()=>undefined);}
  const bytes=Buffer.concat(chunks);
  const mediaType=verifiedImageMime(bytes);
  if(!mediaType)throw new Error("unrecognized_image_binary");
  return {bytes,mediaType};
}
type ProfileRow={id:string; normalized_profile:{fields?:MatchProfileVisibleFields}};
export async function archiveSavedMatchProfilePhotos(userId:string, profileId:string) {
  const row=await getPool().query<ProfileRow>(
    "SELECT id, normalized_profile FROM match_profiles WHERE user_id=$1 AND id=$2 LIMIT 1",[userId,profileId]);
  if(!row.rows[0])return null;
  const urls=archiveSourceUrls(row.rows[0].normalized_profile.fields ?? {});
  const outcomes:{stored:number;alreadySaved:number;unavailable:number}={stored:0,alreadySaved:0,unavailable:0};
  for(const url of urls){
    const hash=createHash("sha256").update(url).digest("hex");
    const existing=await getPool().query("SELECT 1 FROM match_profile_photo_archives WHERE user_id=$1 AND profile_id=$2 AND source_hash=$3",[userId,profileId,hash]);
    if(existing.rowCount){outcomes.alreadySaved++;continue;}
    try{
      const downloaded=await downloadVerifiedTinderImage(url);
      const saved=await getPool().query(
        "INSERT INTO match_profile_photo_archives(id,user_id,profile_id,source_hash,media_type,bytes) "
        +"VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(user_id,profile_id,source_hash) DO NOTHING",
        [randomUUID(),userId,profileId,hash,downloaded.mediaType,downloaded.bytes]);
      if(saved.rowCount)outcomes.stored++;else outcomes.alreadySaved++;
    }catch{outcomes.unavailable++;}
  }
  return {totalUrls:urls.length,...outcomes};
}
export async function listArchivedMatchPhotos(userId:string, profileId:string) {
  const owns=await getPool().query("SELECT 1 FROM match_profiles WHERE user_id=$1 AND id=$2",[userId,profileId]);
  if(!owns.rowCount)return null;
  const result=await getPool().query<{id:string;media_type:string;size:number}>(
    "SELECT id,media_type,octet_length(bytes)::int AS size FROM match_profile_photo_archives "
    +"WHERE user_id=$1 AND profile_id=$2 ORDER BY captured_at,id LIMIT 12",[userId,profileId]);
  return result.rows.map(x=>({id:x.id,mediaType:x.media_type,bytes:x.size}));
}
export async function getArchivedMatchPhoto(userId:string,profileId:string,photoId:string) {
  const row=await getPool().query<{bytes:Buffer;media_type:string}>(
    "SELECT p.bytes,p.media_type FROM match_profile_photo_archives p "
    +"JOIN match_profiles mp ON mp.id=p.profile_id AND mp.user_id=p.user_id "
    +"WHERE p.user_id=$1 AND p.profile_id=$2 AND p.id=$3 LIMIT 1",[userId,profileId,photoId]);
  return row.rows[0] ? {bytes:row.rows[0].bytes,mediaType:row.rows[0].media_type}:null;
}
