/**
 * Answers the CORS preflight for the commitpress data-source routes.
 *
 * Every call the editor makes is cross-origin and carries an `Authorization` header, which puts it
 * firmly outside the "simple request" rules — so the browser sends `OPTIONS` first and never sends
 * the real request if that goes unanswered. SvelteKit will 405 an `OPTIONS` unless a route exports
 * a handler for it, and the failure surfaces in the editor as an opaque network error rather than
 * as anything mentioning CORS.
 *
 * Done here rather than per route so a route added later cannot forget it.
 */
import { corsHeaders } from '$lib/cms/api.server';
import type { Handle } from '@sveltejs/kit';
import { readRoute, readPreviewRoute } from '$lib/content/locale';

export const handle: Handle = async ({ event, resolve }) => {
	if (event.request.method === 'OPTIONS' && event.url.pathname.startsWith('/api/cms/')) {
		return new Response(null, {
			status: 204,
			headers: corsHeaders(event.request.headers.get('origin'))
		});
	}

	const preview = event.url.pathname.startsWith('/preview');
	const path = preview ? event.url.pathname.replace(/^\/preview\/?/, '') : event.url.pathname;
	const { locale } = preview ? readPreviewRoute(path, event.url.searchParams.get('locale')) : readRoute(path);
	return resolve(event, {
		transformPageChunk: ({ html }) => html.replace('<html lang="en">', `<html lang="${locale}">`)
	});
};
