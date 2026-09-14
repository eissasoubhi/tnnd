export type TinderContextMessageDirection = "me" | "them";

export interface TinderNormalizedMessageKey {
  key: string;
  direction: TinderContextMessageDirection;
  text: string;
}

function simpleHash(value: string): string {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function normalizeMessageText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function buildNormalizedMessageKeys(
  context: string,
  threadKeyHash: string
): TinderNormalizedMessageKey[] {
  const occurrences = new Map<string, number>();
  const result: TinderNormalizedMessageKey[] = [];

  for (const rawLine of context.split("\n")) {
    const match = /^(Me|Them):\s*(.+)$/.exec(rawLine.trim());
    if (!match) continue;

    const direction: TinderContextMessageDirection = match[1] === "Me" ? "me" : "them";
    const text = normalizeMessageText(match[2] ?? "");
    if (!text) continue;

    const identity = `${direction}|${text}`;
    const occurrence = (occurrences.get(identity) ?? 0) + 1;
    occurrences.set(identity, occurrence);

    result.push({
      direction,
      text,
      key: simpleHash(`${threadKeyHash}|${identity}|${occurrence}`)
    });
  }

  return result;
}
