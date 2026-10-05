import type { Handle } from '@sveltejs/kit';
import { readRoute, readPreviewRoute } from '$lib/content/locale';

export const handle: Handle = async ({ event, resolve }) => {
	const preview = event.url.pathname.startsWith('/preview');
	const path = preview ? event.url.pathname.replace(/^\/preview\/?/, '') : event.url.pathname;
	const { locale } = preview ? readPreviewRoute(path, event.url.searchParams.get('locale')) : readRoute(path);
	return resolve(event, {
		transformPageChunk: ({ html }) => html.replace('<html lang="en">', `<html lang="${locale}">`)
	});
};
