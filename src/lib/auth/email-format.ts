/**
 * Client-side email format check (keco-studio style: no server-side mailbox verification).
 * Intentionally conservative: one @, domain with a dot, no whitespace.
 */
const EMAIL_FORMAT =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/

export function isValidEmailFormat(email: string): boolean {
  const t = email.trim()
  if (t.length < 5 || t.length > 254) return false
  return EMAIL_FORMAT.test(t)
}

/** Default in-game display name from email local-part (used when registering without a separate nickname). */
export function defaultDisplayNameFromEmail(email: string): string {
  const local = email.trim().split('@')[0] ?? ''
  const safe = local.replace(/[^\w\u4e00-\u9fff-]/g, '_').slice(0, 24)
  return safe.length > 0 ? safe : 'Adventurer'
}
