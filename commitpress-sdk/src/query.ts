import fs from 'fs/promises'
import path from 'path'
import { liveContent } from './blocks.js'
import { assertSupportedFormat, isPublished, type ContentFile } from './types.js'
import { resolveDataDirectory } from './paths.js'

/**
 * How much of the repository a read may see.
 *
 * `includeDrafts` is off by default, everywhere, and that default is the whole safety property: a
 * site build that says nothing about drafts does not get them. Forgetting to think about drafts
 * therefore fails towards publishing too little rather than too much. A preview build is the one
 * place that should turn it on.
 *
 * `includeOff` is the escape hatch for the rows an editor switched off, and it is off by default for
 * the same shape of reason: a loop that renders every element of an array cannot hide one, so a read
 * that returned them would have every site rendering parked rows until each of them wrote a filter.
 * It is **not** implied by `includeDrafts` — a draft is a page that is not ready, a switched-off row
 * is one somebody took down on purpose, and a preview is meant to show the second as taken down.
 */
export interface QueryOptions {
  includeDrafts?: boolean
  includeOff?: boolean
  /** BCP 47 locale to resolve. There is deliberately no implicit language negotiation. */
  locale?: string
  /** Default locale used by legacy files and by locale-aware files' base content. */
  defaultLocale?: string
}

function mergeLocalized(base: unknown, patch: unknown): unknown {
  if (Array.isArray(patch)) {
    const source = Array.isArray(base) ? base : []
    return patch.map((value, index) => mergeLocalized(source[index], value))
  }
  if (!patch || typeof patch !== 'object') return patch
  const source = base && typeof base === 'object' && !Array.isArray(base) ? base as Record<string, unknown> : {}
  const result: Record<string, unknown> = { ...source }
  for (const [key, value] of Object.entries(patch as Record<string, unknown>)) {
    result[key] = mergeLocalized(source[key], value)
  }
  return result
}

/** Resolve one explicit locale without fallback. */
export function resolveLocale<T>(
  file: ContentFile<T>,
  requested?: string,
  defaultLocale = 'en',
): ContentFile<T> {
  if (!requested) return file
  const canonical = Intl.getCanonicalLocales(requested)[0]
  const fallbackDefault = Intl.getCanonicalLocales(defaultLocale)[0]
  const variant = file.locales?.[canonical]

  if (!variant) {
    if (canonical !== fallbackDefault) {
      throw new Error(`Locale "${canonical}" does not exist for "${file.slug}".`)
    }
    return { ...file, locale: { requested: canonical, resolved: canonical, slug: file.slug } }
  }

  return {
    ...file,
    slug: variant.slug,
    status: variant.status,
    published_at: variant.published_at,
    last_edited: variant.last_edited,
    content: mergeLocalized(file.content, variant.content) as T,
    locale: { requested: canonical, resolved: canonical, slug: variant.slug },
  }
}

async function readJson<T>(filePath: string): Promise<T> {
  const raw = await fs.readFile(filePath, 'utf-8')
  return JSON.parse(raw) as T
}

async function contentPath(root: string, slug: string): Promise<string> {
  const dataDir = await resolveDataDirectory(root)
  if (!slug || path.isAbsolute(slug) || slug.includes('\\') ||
      slug.split('/').some(part => !part || part === '.' || part === '..')) {
    throw new Error(`Invalid content path: ${slug}`)
  }
  const target = path.resolve(dataDir, slug)
  if (!target.startsWith(dataDir + path.sep)) throw new Error(`Invalid content path: ${slug}`)
  const realRoot = await fs.realpath(dataDir)
  const realTarget = await fs.realpath(target)
  if (!realTarget.startsWith(realRoot + path.sep)) throw new Error(`Content path escapes data directory: ${slug}`)
  return realTarget
}

/**
 * Read one item, check it is a shape this SDK understands, and drop the rows switched off in it.
 *
 * Separate from `query` so `queryList` gets the same version check without the draft filtering — a
 * list decides what to keep once, over the whole set. The off-row filter belongs here rather than
 * beside that decision because it is per-file either way, and because a path that forgot it would
 * be a listing that renders rows the single-item read hides.
 */
async function readContentFile<T>(
  filePath: string,
  label: string,
  includeOff: boolean,
): Promise<ContentFile<T>> {
  const file = await readJson<ContentFile<T>>(filePath)
  assertSupportedFormat(file, label)
  return includeOff ? file : { ...file, content: liveContent(file.content) }
}

/**
 * Read one item by slug.
 *
 * A draft throws rather than returning nothing: the caller asked for a specific page by name, and
 * the honest answers are "here it is" or "this is not something you may render". A falsy return
 * would invite `?.content` and the page would build with silent holes in it.
 */
export async function query<T = unknown>(
  slug: string,
  root = process.cwd(),
  { includeDrafts = false, includeOff = false, locale, defaultLocale }: QueryOptions = {},
): Promise<ContentFile<T>> {
  const filePath = await contentPath(root, slug + '.json')
  const raw = await readContentFile<T>(filePath, slug, includeOff)
  const file = resolveLocale(raw, locale, defaultLocale)

  if (!includeDrafts && !isPublished(file)) {
    throw new Error(
      `"${slug}" is a draft and has not been published. ` +
        `Pass { includeDrafts: true } if this is a preview build.`,
    )
  }

  return file
}

/** Every `.json` under `dir`, at any depth, paired with the slug that resolves it. */
async function contentFilesIn(
  dir: string,
  type: string,
): Promise<Array<{ file: string; label: string }>> {
  const entries = await fs.readdir(dir, { withFileTypes: true })

  const nested = await Promise.all(
    entries.map(async entry => {
      const file = path.join(dir, entry.name)

      if (entry.isDirectory()) {
        return contentFilesIn(file, `${type}/${entry.name}`)
      }

      if (!entry.isFile() || !entry.name.endsWith('.json')) return []
      return [{ file, label: `${type}/${entry.name.replace('.json', '')}` }]
    }),
  )

  return nested.flat()
}

/**
 * Every item of a type, published only unless asked otherwise.
 *
 * Drafts are dropped from the list rather than throwing: a listing asks what exists to show, and
 * the answer to "what belongs on the blog index" is simply the posts that are published.
 *
 * Recursive, because an item's slug may contain slashes — a page filed under a folder in the editor
 * is `pages/brollop/frida-och-marcus`, and a listing that stopped at the top level would report the
 * folders as missing rather than as nested. The label each file is read under is the slug `query()`
 * would take, so a caller can round-trip between the two — joined with `/` rather than `path.join`
 * for exactly that reason, a slug being a URL path and not a filesystem one.
 */
export async function queryList<T = unknown>(
  type: string,
  root = process.cwd(),
  { includeDrafts = false, includeOff = false, locale, defaultLocale }: QueryOptions = {},
): Promise<ContentFile<T>[]> {
  const dir = await contentPath(root, type)
  const found = await contentFilesIn(dir, type)

  const rawResults = await Promise.all(
    found.map(({ file, label }) => readContentFile<T>(file, label, includeOff)),
  )

  const results = rawResults.flatMap(file => {
    try { return [resolveLocale(file, locale, defaultLocale)] }
    catch { return [] }
  })
  return includeDrafts ? results : results.filter(isPublished)
}

/** Find an item by the slug exposed by one locale rather than by its repository filename. */
export async function queryByLocaleSlug<T = unknown>(
  type: string,
  slug: string,
  root = process.cwd(),
  options: QueryOptions & { locale: string; defaultLocale: string },
): Promise<ContentFile<T>> {
  const items = await queryList<T>(type, root, options)
  const found = items.find(item => item.slug === slug)
  if (!found) throw new Error(`No published ${options.locale} content exists at "${slug}".`)
  return found
}

export function createTypedQuery<Map extends Record<string, unknown>>(
  root = process.cwd(),
  options: QueryOptions = {},
) {
  return function <K extends keyof Map>(
    slug: K & string,
    overrides: QueryOptions = {},
  ): Promise<ContentFile<Map[K]>> {
    return query<Map[K]>(slug, root, { ...options, ...overrides })
  }
}

export function createTypedCollections<Map extends Record<string, unknown>>(
  root = process.cwd(),
  options: QueryOptions = {},
) {
  return {
    list<K extends keyof Map>(
      name: K & string,
      overrides: QueryOptions = {},
    ): Promise<ContentFile<Map[K]>[]> {
      return queryList<Map[K]>(path.join('content', 'collections', name), root, {
        ...options,
        ...overrides,
      })
    },
    get<K extends keyof Map>(
      name: K & string,
      id: string,
      overrides: QueryOptions = {},
    ): Promise<ContentFile<Map[K]>> {
      return query<Map[K]>(path.join('content', 'collections', name, id), root, {
        ...options,
        ...overrides,
      })
    },
  }
}
