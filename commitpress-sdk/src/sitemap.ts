import { queryList, resolveLocale, type QueryOptions } from './query.js'
import { resolveIntlConfig } from './paths.js'

export interface SitemapSeo {
  no_index?: boolean
  /** Absent means included, so content written before this setting existed keeps its URL. */
  exclude_from_sitemap?: boolean
}

export interface SitemapContent {
  seo?: SitemapSeo
}

export interface SitemapEntry {
  /** Absolute when `origin` was supplied, otherwise a root-relative URL. */
  url: string
  /** The content envelope's last edit time, expressed as an ISO date. */
  lastmod: string
  locale?: string
  alternates?: Record<string, string>
}

export interface SitemapOptions extends QueryOptions {
  /** Repository root. Defaults to `process.cwd()`, like `query`. */
  root?: string
  /** Public site origin, for example `https://example.com`. */
  origin?: string
  /** Append `/` to every URL except the home page. Off by default. */
  trailingSlash?: boolean
}

function pagePath(slug: string, trailingSlash: boolean): string {
  const clean = slug.replace(/^\/+|\/+$/g, '')
  if (!clean || clean === 'index') return '/'
  const pathname = `/${clean}`
  return trailingSlash ? `${pathname}/` : pathname
}

function absoluteUrl(pathname: string, origin?: string): string {
  if (!origin) return pathname
  return new URL(pathname, `${origin.replace(/\/$/, '')}/`).toString()
}

/**
 * Published pages offered to sitemap readers.
 *
 * A page marked `no_index` is omitted as well: a sitemap advertises the URLs a site wants search
 * engines to index, so including one while asking crawlers not to index it sends conflicting
 * signals. `exclude_from_sitemap` remains independently useful for an indexable page the author
 * does not want to promote through the sitemap.
 */
export async function sitemap(options: SitemapOptions = {}): Promise<SitemapEntry[]> {
  const {
    root = process.cwd(),
    origin,
    trailingSlash = false,
    includeDrafts = false,
    includeOff = false,
  } = options

  const intl = await resolveIntlConfig(root)
  const pages = await queryList<SitemapContent>('content/pages', root, {
    includeDrafts: intl ? true : includeDrafts,
    includeOff,
  })

  if (intl) {
    const entries: SitemapEntry[] = []
    for (const page of pages) {
      if (page.schema === 'redirect') continue
      const published = intl.locales.flatMap(locale => {
        try {
          const resolved = resolveLocale(page, locale, intl.defaultLocale)
          return includeDrafts || resolved.status === 'published' ? [resolved] : []
        } catch { return [] }
      }).filter(page => page.content.seo?.no_index !== true && page.content.seo?.exclude_from_sitemap !== true)
      const alternates = Object.fromEntries(published.map(item => [item.locale!.resolved, absoluteUrl(pagePath(`${item.locale!.resolved}/${item.slug}`, trailingSlash), origin)]))
      for (const item of published) entries.push({
        url: alternates[item.locale!.resolved]!,
        lastmod: new Date(item.last_edited).toISOString(),
        locale: item.locale!.resolved,
        alternates,
      })
    }
    return entries.sort((a, b) => a.url.localeCompare(b.url))
  }

  return pages
    .filter(
      page =>
        page.schema !== 'redirect' &&
        page.content.seo?.no_index !== true &&
        page.content.seo?.exclude_from_sitemap !== true,
    )
    .map(page => ({
      url: absoluteUrl(pagePath(page.slug, trailingSlash), origin),
      lastmod: new Date(page.last_edited).toISOString(),
    }))
    .sort((a, b) => a.url.localeCompare(b.url))
}

function xml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/** Render sitemap entries as a complete UTF-8 sitemap document. */
export function sitemapXml(entries: readonly SitemapEntry[]): string {
  const urls = entries
    .map(
      entry => {
        const alternates = Object.entries(entry.alternates ?? {}).map(([locale, url]) => `\n    <xhtml:link rel="alternate" hreflang="${xml(locale)}" href="${xml(url)}" />`).join('')
        return `  <url>\n    <loc>${xml(entry.url)}</loc>\n    <lastmod>${xml(entry.lastmod)}</lastmod>${alternates}\n  </url>`
      },
    )
    .join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">${urls ? `\n${urls}\n` : '\n'}</urlset>\n`
}
