/**
 * So a platform health check does not have to render a page to learn the process is up.
 *
 * A route rather than middleware on a custom server, so it answers the same way under `vite dev` and
 * in the deploy — see the note in `svelte.config.js` about why there is no longer a server wrapper.
 */
import type { RequestHandler } from './$types';

export const GET: RequestHandler = () =>
	new Response('ok', { headers: { 'content-type': 'text/plain' } });
