import { query, queryList, queryByLocaleSlug, gallery, resolveIntlConfig, isPublished, type ContentFile } from '@commitpress/sdk-node';
import { error } from '@sveltejs/kit';
import { imageManifest } from '$lib/media/assets.server';
import { collectionSegment, localizedHref, type Locale } from './locale';
import type { NotesContent } from '../../commitpress.generated';

import { pageSchemas, pageSection, type WebsitePageContent } from './page-types';

export async function loadShowcase(path: string, locale: Locale, preview = false, contentPath?: string) {
  const intl = await resolveIntlConfig();
  if (!intl?.locales.includes(locale)) throw error(404, 'Language not available');
  const options = { locale, defaultLocale: intl.defaultLocale, includeDrafts: preview };
  const isEntry = path.startsWith(collectionSegment(locale) + '/') || contentPath?.startsWith('content/collections/');
  const type = isEntry ? 'content/collections/notes' : 'content/pages';
  const slug = isEntry ? path.split('/').slice(1).join('/') : path || 'index';
  let file: ContentFile<WebsitePageContent | NotesContent>;
  if (contentPath) {
    try {
      file = await query<WebsitePageContent | NotesContent>(contentPath, undefined, options);
    } catch (cause) {
      if ((cause as { code?: string })?.code !== 'ENOENT') throw cause;
      try {
        file = await queryByLocaleSlug<WebsitePageContent | NotesContent>(type, contentPath.replace(type + '/', ''), undefined, options);
      } catch (missing) {
        if (missing instanceof Error && missing.message.startsWith('No published ')) throw error(404, 'Page not found');
        throw missing;
      }
    }
  } else {
    const items = await queryList<WebsitePageContent | NotesContent>(type, undefined, options);
    const match = items.find(item => item.slug === slug);
    if (!match) throw error(404, 'Page not found');
    file = match;
  }
  const entries = await queryList<NotesContent>('content/collections/notes', undefined, { ...options, includeDrafts: false });
  const cards = entries.map(entry => ({ ...entry.content.story, href: localizedHref(entry.slug, locale, true) }));
  const raw = (await queryList<WebsitePageContent | NotesContent>(type, undefined, { includeDrafts: preview })).find(item => item.slug === file.slug || item.locales?.[locale]?.slug === file.slug);
  const alternates = raw ? [
    ...(isPublished(raw) || preview ? [{ locale: 'en', href: localizedHref(raw.slug, 'en', isEntry) }] : []),
    ...(raw.locales?.sv && (raw.locales.sv.status === 'published' || preview) ? [{ locale: 'sv', href: localizedHref(raw.locales.sv.slug, 'sv', isEntry) }] : [])
  ] : [];
  const content = file.content;
  const page = pageSchemas.includes(file.schema as typeof pageSchemas[number]) ? content as WebsitePageContent : null;
  const entry = file.schema === 'notes' ? content as NotesContent : null;
  if (!page && !entry) throw error(404, 'Unsupported example');
  const field = page ? pageSection(page)?.gallery : undefined;
  const galleryAssets = field ? await gallery(field) : [];
  const media = await imageManifest([content, cards, galleryAssets.map(asset => asset.id)]);
  return { kind: entry ? 'entry' as const : 'page' as const, page, entry, cards, media, galleryIds: galleryAssets.map(asset => asset.id), alternates, locale };
}
