/** One reply generated once, optionally sent as TWO natural bubbles.
 * This never adds an extra Gemini call, and does not apply to first openers.
 */
export function naturalReplyBubbles(
  message: string, options: { enabled?: boolean; minCharacters?: number }
): string[] {
  const text = message.replace(/\r/g, "").replace(/\s+/g, " ").trim();
  const threshold = Math.max(90,Math.min(400,Number.isFinite(options.minCharacters)
    ? Math.round(options.minCharacters!) : 150));
  if (!options.enabled || text.length < threshold || text.length > 900) return [text];
  // Pick a single genuine sentence boundary near the middle. No mid-word
  // truncation, unbalanced quotes, repeated greetings or forced extra questions.
  const boundaries: number[] = [];
  const re = /[.!?;]\s+|,\s+/g;
  let match: RegExpExecArray | null;
  while ((match=re.exec(text))) {
    const position = match.index + match[0].length;
    if (position >= 30 && text.length-position >= 30) boundaries.push(position);
  }
  if (!boundaries.length) return [text];
  const near = boundaries.sort((a,b)=>Math.abs(a-text.length/2)-Math.abs(b-text.length/2))[0]!;
  const first=text.slice(0,near).trim(), second=text.slice(near).trim();
  if (!first || !second || /\b(?:https?:\/\/|www\.)/i.test(text)) return [text];
  // Some, not all, long replies are broken up: stable deterministic choice
  // to avoid a random re-plan of an already claimed reply after an interruption.
  let hash=2166136261;
  for (const character of text) hash=Math.imul(hash ^ character.charCodeAt(0),16777619)>>>0;
  return hash % 3 === 0 ? [text] : [first,second];
}
