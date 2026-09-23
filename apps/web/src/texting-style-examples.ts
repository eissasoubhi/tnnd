export const MAX_TEXTING_STYLE_EXAMPLES = 50;
export const MAX_TEXTING_STYLE_EXAMPLE_LENGTH = 2_000;

export interface PreparedTextingStyleExamples {
  examples: string[];
  sourceRetentionOptIn: boolean;
}

/**
 * Prepare user-authored message examples for style analysis without silently
 * retaining source text. The caller must explicitly pass sourceRetentionOptIn
 * when the user chooses to keep the raw examples after analysis.
 */
export function prepareTextingStyleExamples(
  rawExamples: readonly string[],
  sourceRetentionOptIn = false
): PreparedTextingStyleExamples {
  const examples = rawExamples
    .map((example) => example.trim())
    .filter((example) => example.length > 0)
    .map((example) => example.slice(0, MAX_TEXTING_STYLE_EXAMPLE_LENGTH))
    .slice(0, MAX_TEXTING_STYLE_EXAMPLES);

  return {
    examples,
    sourceRetentionOptIn
  };
}

/**
 * Split a paste buffer into message examples. Blank lines delimit messages so
 * multi-line messages stay intact while accidental surrounding whitespace is
 * ignored.
 */
export function parsePastedTextingStyleExamples(raw: string): string[] {
  return prepareTextingStyleExamples(raw.split(/\r?\n\s*\r?\n/)).examples;
}
