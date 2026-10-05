import type { HomeContent, PageContent, CollectionContent, GalleryContent } from '../../commitpress.generated';

export const pageSchemas = ['home', 'page', 'collection', 'gallery'] as const;
export type PageSchema = typeof pageSchemas[number];
export type WebsitePageContent = HomeContent | PageContent | CollectionContent | GalleryContent;

/** The field group also identifies the layout in unsaved preview messages. */
export function pageSchema(content: WebsitePageContent): PageSchema {
  if ('home' in content) return 'home';
  if ('collection' in content) return 'collection';
  if ('gallery' in content) return 'gallery';
  return 'page';
}

export type PageSection = HomeContent['home'] &
  Partial<Pick<PageContent['page'], 'body' | 'next_page' | 'body_label'>> &
  Partial<Pick<GalleryContent['gallery'], 'gallery'>>;

export function pageSection(content: WebsitePageContent): PageSection | undefined {
  if ('home' in content) return content.home;
  if ('collection' in content) return content.collection;
  if ('gallery' in content) return content.gallery;
  return 'page' in content ? content.page : undefined;
}
