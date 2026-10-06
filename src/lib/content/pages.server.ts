import { gallery } from '@commitpress/sdk-node';
import { error } from '@sveltejs/kit';
import { imageManifest } from '$lib/media/assets.server';
import { pageSchemas, type WebsitePageContent } from './page-types';
import { pageHref, type Locale } from './locale';
import { readContent } from './read.server';
import { loadCards } from './notes.server';

export async function loadPage(slug: string, locale: Locale, { preview = false } = {}) {
  const { file, translations } = await readContent<WebsitePageContent>('content/pages', slug, locale, preview);
  if (file && !pageSchemas.some(schema => schema === file.schema)) error(404, 'Unsupported page schema');
  const page = file?.content ?? null;

  let cards: Awaited<ReturnType<typeof loadCards>> = [];
  if (preview || file?.schema === 'home' || file?.schema === 'collection') {
    cards = await loadCards(locale, file?.schema === 'collection' ? file.slug : undefined);
  }

  const galleryValue = page && 'gallery' in page ? page.gallery?.gallery : undefined;
  const galleryAssets = galleryValue ? await gallery(galleryValue) : [];
  const galleryIds = galleryAssets.map(asset => asset.id);

  return {
    kind: 'page' as const,
    page,
    entry: null,
    locale,
    cards,
    galleryIds,
    media: await imageManifest([page, cards, galleryIds]),
    alternates: translations.map(({ locale, slug }) => ({ locale, href: pageHref(slug, locale) })),
  };
}
