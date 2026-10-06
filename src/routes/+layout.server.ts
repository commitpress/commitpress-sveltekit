import { query } from '../commitpress.generated';
import { defaultLocale, isPreviewPath, routeLocale } from '$lib/content/locale';
import { imageManifest } from '$lib/media/assets.server';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ url }) => {
  const locale = routeLocale(url);
  const file = await query('content/globals/site', {
    locale,
    defaultLocale,
    includeDrafts: isPreviewPath(url.pathname),
  });
  return { site: file.content, siteMedia: await imageManifest(file.content), locale };
};
