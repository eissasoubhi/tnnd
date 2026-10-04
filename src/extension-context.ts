export function isExtensionContextInvalidated(error: unknown): boolean {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  return /extension context invalidated/i.test(message);
}

export async function sendRuntimeMessageSafely<T>(
  message: unknown,
  sender: (message: unknown) => Promise<T>,
  onInvalidated: () => void
): Promise<T | null> {
  try {
    return await sender(message);
  } catch (error) {
    if (!isExtensionContextInvalidated(error)) throw error;
    onInvalidated();
    return null;
  }
}
