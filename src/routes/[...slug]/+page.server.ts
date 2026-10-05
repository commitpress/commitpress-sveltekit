import { loadShowcase } from '$lib/content/showcase.server';
import { readRoute } from '$lib/content/locale';
import type { PageServerLoad } from './$types';
export const load: PageServerLoad = async ({ params }) => {
  const route = readRoute(params.slug ?? '');
  return loadShowcase(route.path, route.locale);
};
