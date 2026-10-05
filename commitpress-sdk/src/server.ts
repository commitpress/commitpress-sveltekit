/**
 * Server-only entry point: `@commitpress/sdk/server`.
 *
 * Separate from the main entry because this reaches for `node:crypto`, and the main entry is
 * imported by things that get bundled for a browser. A verifier pulled into a client bundle is at
 * best a build error and at worst a polyfill quietly shipping crypto nobody needs.
 */
export {
  verifyCommitpressToken,
  resetCommitpressKeyCache,
  COMMITPRESS_JWKS_URL,
  COMMITPRESS_ISSUER,
} from './identity.js'
export type { CommitpressClaims, VerifyOptions } from './identity.js'
