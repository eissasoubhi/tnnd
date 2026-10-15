/** Avoid rendering results from superseded requests or a signed-out/different account. */
export function isLatestSessionResponse(
  requestId: number,
  latestId: number,
  requestToken: string,
  activeToken: string | null | undefined
): boolean {
  return requestId === latestId && Boolean(requestToken) && requestToken === activeToken;
}
