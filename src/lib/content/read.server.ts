import { resolveLocale, isPublished } from '@commitpress/sdk-node';
import { queryList, type ContentListMap } from '../../commitpress.generated';
import { error } from '@sveltejs/kit';
import { defaultLocale, locales, type Locale } from './locale';

type Translation = { locale: Locale; slug: string };

/** Look up a translated slug. Previews also accept the original file's slug. */
export async function readContent<K extends keyof ContentListMap>(directory: K, slug: string, locale: Locale, preview = false) {
  const records = await queryList(directory, { includeDrafts: true });
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

  // Locale resolution preserves the schema and content shape; the SDK's return
  // type widens schema to string, so retain the generated discriminated union here.
  const file = resolveLocale<ContentListMap[K]['content']>(record, locale, defaultLocale) as ContentListMap[K];
  if (!preview && !isPublished(file)) error(404, 'Page not found');

  for (const language of locales) {
    if (language !== defaultLocale && !record.locales?.[language]) continue;
    const translation = resolveLocale<ContentListMap[K]['content']>(record, language, defaultLocale);
    if (preview || isPublished(translation)) {
      translations.push({ locale: language, slug: translation.slug });
    }
  }

  return { file, translations };
}
