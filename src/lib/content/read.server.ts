import { queryList, resolveLocale, isPublished } from '@commitpress/sdk-node';
import { error } from '@sveltejs/kit';
import { defaultLocale, locales, type Locale } from './locale';

type Translation = { locale: Locale; slug: string };

/** Look up a translated slug. Previews also accept the original file's slug. */
export async function readContent<T>(directory: string, slug: string, locale: Locale, preview = false) {
  const records = await queryList<T>(directory, undefined, { includeDrafts: true });
  const record = records.find(record => {
    const translatedSlug = record.locales?.[locale]?.slug;
    if (translatedSlug === slug) return true;
    if (locale === defaultLocale && !translatedSlug && record.slug === slug) return true;
    return preview && record.slug === slug;
  });

  const translations: Translation[] = [];
  if (!record || (locale !== defaultLocale && !record.locales?.[locale])) {
    if (preview) return { file: null, translations };
    error(404, 'Page not found');
  }

  const file = resolveLocale(record, locale, defaultLocale);
  if (!preview && !isPublished(file)) error(404, 'Page not found');

  for (const language of locales) {
    if (language !== defaultLocale && !record.locales?.[language]) continue;
    const translation = resolveLocale(record, language, defaultLocale);
    if (preview || isPublished(translation)) {
      translations.push({ locale: language, slug: translation.slug });
    }
  }

  return { file, translations };
}
