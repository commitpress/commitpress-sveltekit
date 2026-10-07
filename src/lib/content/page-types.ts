import type { HomeContent, PageContent, GalleryContent, ContentListMap } from '../../commitpress.generated';

export const pageSchemas = ['home', 'page', 'collection', 'gallery'] as const;
export type PageSchema = typeof pageSchemas[number];
type WebsitePageFile = Extract<ContentListMap['content/pages'], { schema: PageSchema }>;
export type WebsitePageContent = WebsitePageFile['content'];

export function isWebsitePage(file: ContentListMap['content/pages']): file is WebsitePageFile {
  return pageSchemas.some(schema => schema === file.schema);
}

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
