/** Redact media URLs embedded in inline CSS before exporting diagnostic HTML.
 * The original profile photo address must never be written to an exported DOM file.
 */
export function redactDiagnosticInlineStyle(value: string): string {
  return value.replace(/url\s*\(\s*(?:"[^"]*"|'[^']*'|[^)]*)\s*\)/gi, 'url("[redacted-media-url]")');
}
