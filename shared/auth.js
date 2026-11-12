// Admin login helpers shared by the local Express server and the Cloudflare Worker.
// Uses only the Web Crypto API, so it runs in Node.js 20+ and in Workers.
//
// Sessions are stateless: a signed token { u: user, exp: expiry } in an HttpOnly cookie.
// The signing key is derived from the admin password, so changing the password logs everyone out.

const enc = new TextEncoder()
const dec = new TextDecoder()

export const SESSION_COOKIE = 'uo_session'
export const SESSION_DAYS = 14

function b64url(bytes) {
  let s = ''
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromB64url(s) {
  const pad = '='.repeat((4 - (s.length % 4)) % 4)
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad)
  return Uint8Array.from(bin, (c) => c.charCodeAt(0))
}

function hmacKey(secret) {
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify'])
}

/** cfg = { user, password, sessionSecret? } */
function signingSecret(cfg) {
  return cfg.sessionSecret || `uusimaa-open-session:${cfg.user.toLowerCase()}:${cfg.password}`
}

export async function createToken(cfg, now = Date.now()) {
  const payload = b64url(enc.encode(JSON.stringify({ u: cfg.user.toLowerCase(), exp: now + SESSION_DAYS * 86400000 })))
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(signingSecret(cfg)), enc.encode(payload))
  return `${payload}.${b64url(sig)}`
}

export async function verifyToken(cfg, token, now = Date.now()) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return false
  const [payload, sig] = token.split('.')
  try {
    const ok = await crypto.subtle.verify('HMAC', await hmacKey(signingSecret(cfg)), fromB64url(sig), enc.encode(payload))
    if (!ok) return false
    const data = JSON.parse(dec.decode(fromB64url(payload)))
    return data.u === cfg.user.toLowerCase() && typeof data.exp === 'number' && data.exp > now
  } catch {
    return false
  }
}

/** Username is case-insensitive, password is not. Compared via HMACs so timing doesn't leak anything. */
export async function checkCredentials(cfg, user, password) {
  const key = await hmacKey('uusimaa-open-login-compare')
  const [a, b] = await Promise.all(
    [`${String(user).trim().toLowerCase()}\n${password}`, `${cfg.user.toLowerCase()}\n${cfg.password}`].map((s) =>
      crypto.subtle.sign('HMAC', key, enc.encode(s)),
    ),
  )
  const x = new Uint8Array(a)
  const y = new Uint8Array(b)
  let diff = 0
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i]
  return diff === 0
}

export function readCookie(header, name) {
  if (!header) return null
  for (const part of header.split(';')) {
    const i = part.indexOf('=')
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim()
  }
  return null
}

export function sessionCookie(token, secure) {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}${secure ? '; Secure' : ''}`
}

export function clearSessionCookie(secure) {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? '; Secure' : ''}`
}

/** Extra CSRF guard for state-changing requests: if the browser sends an Origin, it must be ours. */
export function sameOrigin(originHeader, hostHeader) {
  if (!originHeader) return true
  try {
    return new URL(originHeader).host === hostHeader
  } catch {
    return false
  }
}
