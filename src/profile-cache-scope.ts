/** Account-scoped cache guard: never load Web profile from another account. */
export function cacheBelongsToSession(
  cache: { userId?: string } | null | undefined,
  session: { token?: string; expiresAt?: string; user?: { id?: string } } | null | undefined,
  now = Date.now()
): boolean {
  return Boolean(cache?.userId && cache.userId === session?.user?.id
    && session?.token && session.expiresAt
    && Number.isFinite(Date.parse(session.expiresAt)) && Date.parse(session.expiresAt) > now);
}
