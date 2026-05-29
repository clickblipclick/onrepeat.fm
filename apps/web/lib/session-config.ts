import type { SessionOptions } from 'iron-session'

export const SESSION_COOKIE_NAME = 'onrepeat_session'

/** Only the DID is stored in the (encrypted) cookie. Tokens stay in the server-side store. */
export interface SessionData {
  did?: string
}

export function sessionCookieOptions(nodeEnv: string | undefined): SessionOptions['cookieOptions'] {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: nodeEnv === 'production',
    path: '/',
  }
}

export function sessionOptions(): SessionOptions {
  const password = process.env.SESSION_SECRET
  if (!password || password.length < 32) {
    throw new Error('SESSION_SECRET must be set and at least 32 characters')
  }
  return {
    password,
    cookieName: SESSION_COOKIE_NAME,
    cookieOptions: sessionCookieOptions(process.env.NODE_ENV),
  }
}
