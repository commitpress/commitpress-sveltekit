import { loadRoute } from '$lib/content/routes.server';
import { readRoute } from '$lib/content/locale';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
  const { path, locale } = readRoute(params.slug ?? '');
  return loadRoute(path, locale);
};
