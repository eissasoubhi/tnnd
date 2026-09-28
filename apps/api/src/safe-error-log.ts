const safeErrorNamePattern = /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/;

export function safeErrorName(error: unknown): string {
  if (!(error instanceof Error)) return "UnknownError";
  const name = error.name?.trim() || "Error";
  return safeErrorNamePattern.test(name) ? name : "Error";
}

export function safeApiErrorLog(error: unknown): string {
  return JSON.stringify({
    event: "api_request_failed",
    error: safeErrorName(error)
  });
}
