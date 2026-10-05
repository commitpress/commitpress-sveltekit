import { query } from '../commitpress.generated';
import { readRoute, readPreviewRoute } from '$lib/content/locale';
import { imageManifest } from '$lib/media/assets.server';
import type { LayoutServerLoad } from './$types';
export const load: LayoutServerLoad = async ({ url }) => {
  const preview = url.pathname.startsWith('/preview');
  const path = preview ? url.pathname.replace(/^\/preview\/?/, '') : url.pathname;
  const { locale } = preview ? readPreviewRoute(path, url.searchParams.get('locale')) : readRoute(path);
  const file = await query('content/globals/site', { locale, defaultLocale: 'en', includeDrafts: preview });
  return { site: file.content, siteMedia: await imageManifest(file.content), locale };
};
