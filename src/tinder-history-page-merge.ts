import type { VisibleTinderMessage } from "./tinder-manual-import";

/** Merge a virtualized, older DOM page only when it overlaps the known
 * chronological sequence. A missing overlap is ambiguous and must NOT be
 * guessed; the import stops instead of silently corrupting history.
 */
export function mergeOlderHistory(
  chronological: readonly VisibleTinderMessage[],
  olderPage: readonly VisibleTinderMessage[]
): { messages: VisibleTinderMessage[]; added: number } | null {
  if (!olderPage.length) return {messages:[...chronological],added:0};
  if (!chronological.length) return {messages:[...olderPage],added:olderPage.length};
  const same=(a:VisibleTinderMessage,b:VisibleTinderMessage)=>
    a.direction===b.direction && a.text===b.text;
  for(let overlap=Math.min(chronological.length,olderPage.length);overlap>=1;overlap--){
    if(olderPage.slice(-overlap).every((m,i)=>same(m,chronological[i]))) {
      return {messages:[...olderPage.slice(0,-overlap),...chronological],added:olderPage.length-overlap};
    }
  }
  return null;
}
/** Mark read-only backfill keys with relative order from an *observed*
 * initial window; not from guessed Tinder timestamps or message URLs.
 * True deduplication across multiple partially-rendered sessions still
 * requires stable source message IDs unavailable in the current DOM.
 */
export function olderBackfillKey(ref:string,relativeIndex:number,message:VisibleTinderMessage):string {
  const source=ref+"|"+relativeIndex+"|"+message.direction+"|"+message.text;
  let h1=2166136261,h2=0x811c9dc7;
  for(let i=0;i<source.length;i++){
    const c=source.charCodeAt(i);
    h1=Math.imul(h1^c,16777619)>>>0;
    h2=Math.imul(h2^c,2246822519)>>>0;
  }
  return "history:"+h1.toString(36)+":"+h2.toString(36);
}
