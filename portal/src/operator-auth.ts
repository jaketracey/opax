const encoder = new TextEncoder()

/** Preserve the exact Bearer header format without comparing raw credentials. */
export async function operatorAuthorized(request: Request, env: Pick<Env, 'DAILY_POST_OPERATOR_SECRET'>): Promise<boolean> {
  const secret = env.DAILY_POST_OPERATOR_SECRET
  if (!secret) return false
  const authorization = request.headers.get('authorization')
  if (!authorization?.startsWith('Bearer ')) return false
  const [presented, expected] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(authorization.slice(7))),
    crypto.subtle.digest('SHA-256', encoder.encode(secret)),
  ])
  return crypto.subtle.timingSafeEqual(new Uint8Array(presented), new Uint8Array(expected))
}
