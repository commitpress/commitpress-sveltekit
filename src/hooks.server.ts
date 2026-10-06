import type { Handle } from '@sveltejs/kit';
import { routeLocale } from '$lib/content/locale';

export const handle: Handle = async ({ event, resolve }) => {
  const locale = routeLocale(event.url);
  return resolve(event, {
    transformPageChunk: ({ html }) => html.replace('<html lang="en">', '<html lang="' + locale + '">'),
  });
};
