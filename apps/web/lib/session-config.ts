import type { SessionOptions } from 'iron-session'

export const SESSION_COOKIE_NAME = 'onrepeat_session'

// Canonical app origin for internal redirects. Pinned to PUBLIC_URL (127.0.0.1 in
// dev) because Next's req.url reports `localhost` in dev regardless of the real
// host — redirecting there would land on a different cookie origin (logged out).
export const APP_URL = process.env.PUBLIC_URL ?? 'http://127.0.0.1:3000'

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
