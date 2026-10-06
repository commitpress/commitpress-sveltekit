import { queryList } from '@commitpress/sdk-node';
import { error } from '@sveltejs/kit';
import { loadPage } from './pages.server';
import { loadEntry } from './notes.server';
import { defaultLocale, type Locale } from './locale';
import type { WebsitePageContent } from './page-types';

/** Resolve public paths entirely from content slugs. */
export async function loadRoute(path: string, locale: Locale, { preview = false } = {}) {
  const slug = path || 'index';
  const pages = await queryList<WebsitePageContent>('content/pages', undefined, {
    locale,
    defaultLocale,
    includeDrafts: preview,
  });

  if (pages.some(page => page.slug === slug)) return loadPage(slug, locale, { preview });

  // Entry URLs live beneath their collection page's translated slug.
  const collection = pages
    .filter(page => page.schema === 'collection')
    .sort((a, b) => b.slug.length - a.slug.length)
    .find(page => path.startsWith(page.slug + '/'));
  if (collection) {
    const entrySlug = path.slice(collection.slug.length + 1);
    return loadEntry(entrySlug, locale, { collectionSlug: collection.slug, preview });
  }

  if (preview) return loadPage(slug, locale, { preview });
  error(404, 'Page not found');
}
