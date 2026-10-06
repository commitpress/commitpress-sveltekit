import { readPreviewPath } from '@commitpress/sdk-node/preview';
import config from '../../../commitpress.config.json';

export const locales = config.content.intl.locales;
export type Locale = typeof locales[number];
export const defaultLocale = config.content.intl.default_locale;

function isLocale(value?: string | null): value is Locale {
  return typeof value === 'string' && locales.includes(value);
}

export function readRoute(path: string, requestedLocale?: string | null) {
  const segments = path.split('/').filter(Boolean);
  const prefix = isLocale(segments[0]) ? segments.shift() as Locale : defaultLocale;
  const locale = isLocale(requestedLocale) ? requestedLocale : prefix;
  return { locale, path: segments.join('/') };
}

export function readPreviewRoute(path: string, requestedLocale?: string | null) {
  const target = readPreviewPath(path);
  const route = readRoute(target.path, requestedLocale);
  return { ...route, kind: target.kind };
}

export function isPreviewPath(path: string) {
  return path === '/preview' || path.startsWith('/preview/');
}

export function routeLocale(url: URL): Locale {
  if (isPreviewPath(url.pathname)) {
    return readPreviewRoute(url.pathname.slice('/preview'.length), url.searchParams.get('locale')).locale;
  }
  return readRoute(url.pathname).locale;
}

export function pageHref(slug: string, locale: Locale) {
  const route = slug === 'index' ? '' : slug;
  const encoded = route.split('/').map(encodeURIComponent).join('/');
  const prefix = locale === defaultLocale ? '' : '/' + locale;
  return encoded ? prefix + '/' + encoded : prefix || '/';
}

export function entryHref(collectionSlug: string, entrySlug: string, locale: Locale) {
  return pageHref(collectionSlug + '/' + entrySlug, locale);
}
