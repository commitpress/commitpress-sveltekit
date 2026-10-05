export type Locale = 'en' | 'sv';
export const collectionSegment = (locale: Locale) => locale === 'sv' ? 'samling' : 'collection';
export function readRoute(path: string, requested?: string | null) {
  const parts = path.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean);
  const prefix = parts[0] === 'sv' || parts[0] === 'en' ? parts.shift() : undefined;
  const locale: Locale = requested === 'sv' || prefix === 'sv' ? 'sv' : 'en';
  return { locale, path: parts.join('/') };
}
export function localizedHref(slug: string, locale: Locale, collection = false) {
  const route = collection ? collectionSegment(locale) + '/' + slug : slug === 'index' ? '' : slug;
  return (locale === 'sv' ? '/sv' : '') + '/' + route.split('/').filter(Boolean).map(encodeURIComponent).join('/');
}
export function readPreviewRoute(path: string, requested?: string | null) {
  const parts = path.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean);
  if (['globals', 'collections', 'blocks'].includes(parts[0]) && ['en', 'sv'].includes(parts[1])) {
    const locale = parts.splice(1, 1)[0];
    return readRoute(parts.join('/'), requested || locale);
  }
  return readRoute(path, requested);
}
