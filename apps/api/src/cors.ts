const localOrigins = new Set([
  "http://127.0.0.1:5173",
  "http://localhost:5173"
]);

function configuredOrigins(value: string | undefined): Set<string> {
  return new Set(
    (value ?? "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
  );
}

export function resolveCorsOrigin(
  origin: string | undefined,
  nodeEnv = process.env.NODE_ENV,
  configured = process.env.TNND_ALLOWED_ORIGINS
): string | null {
  if (!origin) return null;
  if (nodeEnv !== "production" && localOrigins.has(origin)) return origin;
  return configuredOrigins(configured).has(origin) ? origin : null;
}
