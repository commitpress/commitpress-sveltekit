import { error } from '@sveltejs/kit';
import { loadPage } from '$lib/content/pages.server';
import { loadEntry } from '$lib/content/notes.server';
import { loadRoute } from '$lib/content/routes.server';
import { readPreviewRoute } from '$lib/content/locale';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, url }) => {
  const { kind, path, locale } = readPreviewRoute(params.path ?? '', url.searchParams.get('locale'));

  if (kind === 'globals') {
    if (path !== 'site') error(404, 'Global not found');
    return { ...await loadPage('index', locale, { preview: true }), global: true };
  }

  if (kind === 'collections') {
    const [collection, ...slug] = path.split('/');
    if (collection !== 'notes') error(404, 'Collection not found');
    return { ...await loadEntry(slug.join('/'), locale, { preview: true }), global: false };
  }

  if (kind !== 'pages') error(404, 'Unsupported preview');
  return { ...await loadRoute(path, locale, { preview: true }), global: false };
};
