/**
 * The project half of the commitpress data-source handshake.
 *
 * Bookings are mutable records and were never going to live in git — but that was never the
 * obstacle. Only the *source definition* is committed, at `__commitpress__/data/bookings.json`;
 * the records stay in SQLite here and the editor's browser talks to this deployment directly.
 * Commitpress signs a short-lived assertion of who is asking and stays out of the path, which is
 * why there is no API key anywhere in this file: the verification is asymmetric, against keys
 * commitpress publishes.
 *
 * Two things about that are worth stating plainly, because both fail quietly:
 *
 * - **The audience is our own origin**, and a token minted for somebody else's endpoint is
 *   otherwise indistinguishable from one minted for ours. It comes from `event.url.origin`, which
 *   is only correct when `ORIGIN` is set on the host — the same variable whose absence makes every
 *   form POST fail CSRF. One setting, two symptoms.
 * - **Every call from the editor is cross-origin**, so a preflight has to be answered before the
 *   real request is ever sent. See `hooks.server.ts`; getting that wrong is the single most likely
 *   reason a correct setup looks broken.
 */
import { verifyCommitpressToken, type CommitpressClaims } from '@commitpress/sdk/server';
import { env } from '$env/dynamic/private';
import { json, type RequestEvent } from '@sveltejs/kit';

/** `owner/repo`. A token for a different project is refused even if it verifies. */
const PROJECT = env.COMMITPRESS_PROJECT || 'hjalmar/hejfoto-web';

/**
 * Which origin the editor is served from — the only one allowed to call these routes.
 *
 * CORS is not the security boundary here (the token is), but a browser will not let the editor
 * read a response without it, and a wildcard would let any page on the internet make an
 * unauthenticated probe and read the error.
 */
const EDITOR_ORIGIN = env.COMMITPRESS_ORIGIN || 'https://commitpress-production.up.railway.app';

/**
 * Overrides for a self-hosted commitpress. Both move together — a JWKS from one deployment and an
 * issuer string from another is a configuration that verifies nothing.
 */
const jwksUrl = env.COMMITPRESS_JWKS_URL || undefined;
const issuer = env.COMMITPRESS_ISSUER || undefined;

export function corsHeaders(origin: string | null): Record<string, string> {
	const allowed = origin === EDITOR_ORIGIN ? origin : EDITOR_ORIGIN;
	return {
		'access-control-allow-origin': allowed,
		// The response differs by origin, so a shared cache must not serve one origin's answer to
		// another. Cheap to get wrong and invisible until something in front of us caches.
		vary: 'Origin',
		'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS',
		'access-control-allow-headers': 'authorization, content-type',
		'access-control-max-age': '600'
	};
}

export class CmsError extends Error {
	constructor(
		readonly status: number,
		message: string
	) {
		super(message);
	}
}

/**
 * Authenticate a call from the editor.
 *
 * `can` is what the CMS *believes* the person may do, and it is explicitly advisory — so a write
 * is checked here as well rather than being taken on trust. Refusing someone commitpress would
 * have allowed is legitimate; the reverse is not.
 */
export async function requireEditor(
	event: RequestEvent,
	permission: 'data:read' | 'data:write'
): Promise<CommitpressClaims> {
	let claims: CommitpressClaims;

	try {
		claims = await verifyCommitpressToken(event.request.headers.get('authorization'), {
			audience: event.url.origin,
			project: PROJECT,
			...(jwksUrl ? { jwksUrl } : {}),
			...(issuer ? { issuer } : {})
		});
	} catch (cause) {
		// The reason is logged and not returned. A caller who cannot produce a valid token learns
		// only that this one was not valid, which is all they are entitled to know.
		console.warn('[cms] token rejected:', cause instanceof Error ? cause.message : cause);
		throw new CmsError(401, 'Unauthorized');
	}

	if (!claims.can.includes(permission)) {
		throw new CmsError(403, `This editor may not ${permission.split(':')[1]} records.`);
	}

	return claims;
}

/**
 * Run a handler with the CORS headers and the error contract applied.
 *
 * Wrapping rather than repeating: every one of these routes has to answer with the same headers on
 * the failure paths as on the success path, and a 401 the browser cannot read because it lacks
 * `access-control-allow-origin` surfaces in the editor as a network error rather than as "log in".
 */
export function handler(
	run: (event: RequestEvent) => Promise<unknown>
): (event: RequestEvent) => Promise<Response> {
	return async (event) => {
		const headers = corsHeaders(event.request.headers.get('origin'));

		try {
			const body = await run(event);
			return json(body ?? { ok: true }, { headers: { ...headers, 'cache-control': 'no-store' } });
		} catch (cause) {
			if (cause instanceof CmsError) {
				return json({ error: cause.message }, { status: cause.status, headers });
			}
			console.error('[cms] unhandled failure', cause);
			return json({ error: 'Internal error' }, { status: 500, headers });
		}
	};
}
