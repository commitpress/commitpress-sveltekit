/**
 * Verifying a commitpress editor token, in your deployment.
 *
 * This is the project's half of the data-source handshake. Commitpress holds no credential of
 * yours and stores none of your data; when an editor changes a record, their browser calls *your*
 * endpoint carrying a short-lived assertion of who they are, signed by commitpress. This verifies
 * that assertion against commitpress's public keys and hands back what it says.
 *
 * ```ts
 * import { verifyCommitpressToken } from '@commitpress/sdk/server'
 *
 * const claims = await verifyCommitpressToken(request.headers.get('authorization'), {
 *   audience: 'https://acme.com',
 *   project: 'acme/site',
 * })
 *
 * if (!claims.can.includes('cancel')) return new Response('Not allowed', { status: 403 })
 * ```
 *
 * **What it proves and what it does not.** A valid token proves commitpress believes this person is
 * that editor on that project, and that the token was minted for your origin within the last few
 * minutes. It does not decide whether they may do the thing — `can` is what the CMS believes, and
 * you are free to refuse an editor commitpress would have allowed. Treat it as authentication, and
 * keep authorisation yours.
 *
 * **Nothing here needs configuring.** There is no client secret, no registration and no API key,
 * because the verification is asymmetric: commitpress signs with a key it never shares and you
 * check against one it publishes. Onboarding is this function plus a CORS rule.
 */
import { createPublicKey, verify as verifySignature } from 'node:crypto'

/** Where commitpress publishes its public keys. Permanent — see the app's `identity.ts`. */
export const COMMITPRESS_JWKS_URL = 'https://commitpress.com/.well-known/commitpress/jwks.json'

/** The `iss` every genuine token carries. */
export const COMMITPRESS_ISSUER = 'https://commitpress.com'

/**
 * The only algorithm accepted, pinned rather than read from the token.
 *
 * Reading `alg` out of the header is the oldest JWT vulnerability there is: a token claiming
 * `"alg":"none"` verifies trivially, and one claiming `HS256` invites a library to check an RSA/EC
 * *public* key as though it were an HMAC secret — and that public key is, by design, something the
 * attacker can fetch. The header's `alg` is therefore compared against this and never consulted.
 */
const ALG = 'ES256'

/**
 * Allowance for clock drift between commitpress and your server, in seconds.
 *
 * Small on purpose. Tokens live minutes, so a generous skew is a meaningful fraction of the whole
 * lifetime; a machine more than half a minute out of step has a problem NTP should fix.
 */
const CLOCK_SKEW = 30

/** How long fetched keys are trusted before a refresh is attempted. */
const KEY_TTL_MS = 24 * 60 * 60 * 1000

/**
 * Floor between refetches triggered by an unrecognised `kid`.
 *
 * Without it, a caller sending tokens with random `kid`s makes your server fetch the JWKS once per
 * request — turning a rejected token into an outbound request amplifier pointed at commitpress.
 */
const UNKNOWN_KID_REFETCH_MS = 5 * 60 * 1000

export type CommitpressClaims = {
  /** Who acted: `github:<login>`, or `service:commitpress` for the CMS itself. */
  sub: string
  /** `owner/repo`. */
  project: string
  /** Which data source the token was minted for. */
  source: string
  /**
   * The ids of the operations the CMS believes the subject may invoke — `["list","read","create",
   * "cancel"]` — read straight off your own descriptor. Advisory: it is what the CMS believes, and
   * you decide.
   *
   * Tokens minted before descriptor v2 carried `["data:read"]`/`["data:read","data:write"]`
   * instead. If you check this claim, check for the operation id you serve.
   */
  can: string[]
  /** Your origin. */
  aud: string
  iss: string
  iat: number
  exp: number
  /** Unique per token; keep them briefly if you want replay protection. */
  jti: string
}

export type VerifyOptions = {
  /**
   * The origin the token must name — your own. Required, because a token minted for someone else's
   * endpoint is otherwise indistinguishable from one minted for yours, and replaying it here is the
   * cheapest attack against this design.
   */
  audience: string
  /** Restrict to one project, `owner/repo`. Worth setting when an endpoint serves exactly one. */
  project?: string
  /** Restrict to one named data source within the project. */
  source?: string
  /** Override for self-hosted commitpress. Both must be changed together. */
  jwksUrl?: string
  issuer?: string
  /** Injectable for tests. */
  now?: () => number
  fetchImpl?: typeof fetch
}

type Jwk = { kty: string; crv: string; x: string; y: string; kid: string; alg?: string }

type CacheEntry = { keys: Map<string, Jwk>; fetchedAt: number; lastAttemptAt: number }

const cache = new Map<string, CacheEntry>()
const pendingKeys = new Map<string, Promise<Map<string, Jwk>>>()

/** Test seam — the cache is module state and a suite that rotates keys needs to clear it. */
export function resetCommitpressKeyCache(): void {
  cache.clear()
  pendingKeys.clear()
}

function decodeSegment(segment: string): unknown {
  return JSON.parse(Buffer.from(segment, 'base64url').toString('utf8'))
}

async function loadKeys(
  url: string,
  fetchImpl: typeof fetch,
  now: number,
  wantKid: string,
): Promise<Map<string, Jwk>> {
  const entry = cache.get(url)
  const pending = pendingKeys.get(url)
  if (pending) return pending

  const fresh = entry && now - entry.fetchedAt < KEY_TTL_MS
  const knowsKid = entry?.keys.has(wantKid)
  const mayRetry = !entry || now - entry.lastAttemptAt > UNKNOWN_KID_REFETCH_MS

  // Refetch when the cache is cold, stale, or has been asked for a key it does not carry — that
  // last case is what makes key rotation propagate before the TTL expires, rather than causing a
  // day of failures after commitpress rotates.
  if (!entry || (!fresh && mayRetry) || (!knowsKid && mayRetry)) {
    if (entry) entry.lastAttemptAt = now
    const request = (async () => {
      try {
        const response = await fetchImpl(url, { headers: { accept: 'application/json' } })
        if (!response.ok) throw new Error(`${url} answered ${response.status}`)

        const document = (await response.json()) as { keys?: Jwk[] }
        const keys = new Map<string, Jwk>()
        for (const key of document.keys ?? []) {
          if (key.kid) keys.set(key.kid, key)
        }
        cache.set(url, { keys, fetchedAt: now, lastAttemptAt: now })
        return keys
      } catch (error) {
        // Stale-if-error: a temporary outage must not stop editors with cached keys.
        if (!entry) throw error
        return entry.keys
      }
    })()
    pendingKeys.set(url, request)
    try {
      return await request
    } finally {
      if (pendingKeys.get(url) === request) pendingKeys.delete(url)
    }
  }

  return entry.keys
}

/**
 * Verify a token and return its claims. Throws if it is not currently valid for this audience.
 *
 * Accepts a raw token or a full `Authorization` header, since the two arrive interchangeably
 * depending on the framework and getting it wrong produces a confusing "malformed token".
 */
export async function verifyCommitpressToken(
  authorization: string | null | undefined,
  options: VerifyOptions,
): Promise<CommitpressClaims> {
  const {
    audience,
    project,
    source,
    jwksUrl = COMMITPRESS_JWKS_URL,
    issuer = COMMITPRESS_ISSUER,
    now = Date.now,
    fetchImpl = fetch,
  } = options

  if (!audience) {
    throw new Error('verifyCommitpressToken requires an audience — see the docs on replay.')
  }

  const raw = (authorization ?? '').trim()
  const token = raw.toLowerCase().startsWith('bearer ') ? raw.slice(7).trim() : raw
  if (!token) throw new Error('No token supplied.')

  const parts = token.split('.')
  if (parts.length !== 3) throw new Error('Malformed token.')
  const [headerSegment, payloadSegment, signatureSegment] = parts as [string, string, string]

  let header: { alg?: string; kid?: string; typ?: string }
  let claims: CommitpressClaims
  try {
    header = decodeSegment(headerSegment) as typeof header
    claims = decodeSegment(payloadSegment) as CommitpressClaims
  } catch {
    throw new Error('Token header or payload is not valid JSON.')
  }

  if (header.alg !== ALG) {
    throw new Error(`Unsupported algorithm "${header.alg}"; only ${ALG} is accepted.`)
  }
  if (!header.kid) throw new Error('Token names no key.')

  const timestamp = now()
  const keys = await loadKeys(jwksUrl, fetchImpl, timestamp, header.kid)
  const jwk = keys.get(header.kid)
  if (!jwk) throw new Error(`Unknown signing key "${header.kid}".`)

  const publicKey = createPublicKey({ key: jwk as any, format: 'jwk' })

  // `ieee-p1363` is required and its absence is silent: JWS carries the raw r||s pair while Node
  // defaults to DER, so a verifier missing this flag rejects every genuine token and looks like a
  // key mismatch.
  const ok = verifySignature(
    'sha256',
    Buffer.from(`${headerSegment}.${payloadSegment}`),
    { key: publicKey, dsaEncoding: 'ieee-p1363' },
    Buffer.from(signatureSegment, 'base64url'),
  )
  if (!ok) throw new Error('Signature does not verify.')

  // Everything below is checked only after the signature, because until then the claims are
  // attacker-controlled text and a "helpful" error about them leaks how far a forgery got.
  const seconds = Math.floor(timestamp / 1000)

  if (claims.iss !== issuer) {
    throw new Error(`Token issuer "${claims.iss}" is not ${issuer}.`)
  }
  if (claims.aud !== audience) {
    throw new Error(`Token audience "${claims.aud}" is not ${audience}.`)
  }
  if (project && claims.project !== project) {
    throw new Error(`Token is for project "${claims.project}", not ${project}.`)
  }
  if (source && claims.source !== source) {
    throw new Error(`Token is for data source "${claims.source}", not ${source}.`)
  }
  if (typeof claims.exp !== 'number' || seconds > claims.exp + CLOCK_SKEW) {
    throw new Error('Token has expired.')
  }
  if (typeof claims.iat === 'number' && claims.iat > seconds + CLOCK_SKEW) {
    throw new Error('Token was issued in the future.')
  }

  return claims
}
