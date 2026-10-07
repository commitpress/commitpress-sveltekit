import { queryList } from '../../commitpress.generated';
import { error } from '@sveltejs/kit';
import { imageManifest } from '$lib/media/assets.server';
import { defaultLocale, entryHref, type Locale } from './locale';
import { readContent } from './read.server';

async function collectionPage(locale: Locale, preview = false) {
  const pages = await queryList('content/pages', {
    locale,
    defaultLocale,
    includeDrafts: preview,
  });
  return pages.find(page => page.schema === 'collection');
}

export async function loadCards(locale: Locale, collectionSlug?: string) {
  const parentSlug = collectionSlug ?? (await collectionPage(locale))?.slug;
  if (!parentSlug) return [];

  const entries = await queryList('content/collections/notes', {
    locale,
    defaultLocale,
  });
  return entries.map(entry => ({
    ...entry.content.story,
    href: entryHref(parentSlug, entry.slug, locale),
  }));
}

export async function loadEntry(slug: string, locale: Locale, {
  collectionSlug,
  preview = false,
}: { collectionSlug?: string; preview?: boolean } = {}) {
  const { file, translations } = await readContent('content/collections/notes', slug, locale, preview);
  if (file && file.schema !== 'notes') error(404, 'Unsupported collection schema');
  const entry = file?.content ?? null;

  const parentSlug = collectionSlug ?? (await collectionPage(locale, preview))?.slug;
  const parent = parentSlug
    ? await readContent('content/pages', parentSlug, locale, preview)
    : null;
  const alternates = [];
  for (const translation of translations) {
    const collection = parent?.translations.find(item => item.locale === translation.locale);
    if (collection) {
      alternates.push({
        locale: translation.locale,
        href: entryHref(collection.slug, translation.slug, translation.locale),
      });
    }
  }

  return {
    kind: 'entry' as const,
    entry,
    page: null,
    locale,
    cards: [],
    galleryIds: [],
    media: await imageManifest(entry),
    alternates,
  };
}
