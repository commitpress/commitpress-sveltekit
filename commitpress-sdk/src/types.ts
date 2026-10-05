/**
 * Whether an item is live.
 *
 * Mirrors the editor's own two states. A site build reads `published` and nothing else unless it
 * explicitly asks otherwise — see `query.ts`.
 */
export type ContentStatus = 'draft' | 'published'

export interface ContentLocale<T = unknown> {
  slug: string
  status: ContentStatus
  published_at?: number
  last_edited: number
  /** Only values declared localized by the schema. Deep-merged over `content` on read. */
  content: Partial<T>
}

export interface ContentLocaleMeta {
  requested: string
  resolved: string
  slug: string
}

/**
 * One item of a `navigation` field.
 *
 * Declared here rather than emitted into each generated file because the shape is the *same in
 * every repository* — that is the whole reason the field type exists — and a type re-emitted per
 * project is a type a shared menu renderer cannot accept. The generator imports this one.
 *
 * `href` is absent on a parent that only opens a submenu. Whether a link is internal is read from
 * the href (`/about` is, `https://…` is not) rather than stored beside it.
 */
export interface NavigationItem {
  label: string
  href?: string
  target?: '_blank' | '_self'
  children?: NavigationItem[]
}

export interface ContentFile<T = unknown> {
  /**
   * The envelope format version this file was written in.
   *
   * Optional because files written before the marker existed do not carry it — absent means 1, and
   * will mean 1 permanently. The SDK reads content out of a repository it does not control, so this
   * is the only thing that tells it whether it is looking at a shape it understands: a file from a
   * newer commitpress read with older assumptions does not fail, it silently yields `undefined`
   * fields deep inside a site build.
   */
  v?: number
  schema: string
  slug: string
  /**
   * Whether this item is live.
   *
   * Optional because a v1 file predates the idea — and absent means *published*, because every file
   * written before drafts existed was written to be read. Do not test this field directly; use
   * `isPublished`, which keeps that rule in one place.
   */
  status?: ContentStatus
  /** When it most recently went live, if it ever has. */
  published_at?: number
  checksum?: string
  last_edited: number
  content: T
  /** Locale variants. Absent on pre-internationalization content. */
  locales?: Record<string, ContentLocale<T>>
  /** Present on an SDK result after a locale-aware read; never persisted by the CMS. */
  locale?: ContentLocaleMeta
}

/**
 * The envelope versions this SDK build understands.
 *
 * Kept here rather than derived from the package version on purpose: the SDK and the content format
 * move independently, and the only mapping worth maintaining is this one.
 */
export const SUPPORTED_CONTENT_FORMAT = { min: 1, max: 3 } as const

/** What an envelope with no `v` key is, permanently. Never change this. */
const LEGACY_CONTENT_FORMAT = 1

/**
 * Refuse a file this build cannot read correctly.
 *
 * This is the check the comment on `ContentFile.v` has always described and that nothing actually
 * performed: until now `query` read whatever JSON it found. A v2 envelope loaded by a v1-era SDK
 * therefore did not fail — it quietly returned an object with no `status`, and the site would have
 * rendered every unfinished draft in the repository as though it were finished.
 *
 * Throwing is the only safe answer. A build that stops is a build someone fixes; a build that
 * silently publishes drafts is one nobody notices until a reader does.
 */
export function assertSupportedFormat(
  file: Pick<ContentFile<unknown>, 'v'>,
  label: string,
): void {
  const version = typeof file.v === 'number' ? file.v : LEGACY_CONTENT_FORMAT

  if (version > SUPPORTED_CONTENT_FORMAT.max) {
    throw new Error(
      `${label} was written by a newer commitpress (content format v${version}); ` +
        `this SDK understands up to v${SUPPORTED_CONTENT_FORMAT.max}. Update the commitpress SDK.`,
    )
  }

  if (version < SUPPORTED_CONTENT_FORMAT.min) {
    throw new Error(
      `${label} is in content format v${version}, which this SDK no longer reads ` +
        `(minimum v${SUPPORTED_CONTENT_FORMAT.min}).`,
    )
  }
}

/**
 * Whether this item should appear on the site.
 *
 * Absent `status` means published — a file written before drafts existed was written to be read,
 * and treating it as a draft would take down every page of every site built from a repository that
 * has not been re-saved since, the moment the SDK was updated.
 */
export function isPublished(file: Pick<ContentFile<unknown>, 'status'>): boolean {
  return file.status === undefined || file.status === 'published'
}

/** Supported target export formats for static site deploys. */
export type OutputFormat = 'json' | 'markdown' | 'md' | 'html' | 'yaml'

/** Options for content transformation. */
export interface TransformOptions {
  format: OutputFormat
  includeDrafts?: boolean
  /** Directory containing __commitpress__ content folder. Default: process.cwd() */
  root?: string
  /** Destination directory for output files. */
  outDir?: string
  /** Keep full envelope metadata (schema, slug, checksum, etc.) in clean JSON export. Default: false */
  keepEnvelope?: boolean
  /** Resolve one explicit locale. Missing or unpublished variants are omitted. */
  locale?: string
  defaultLocale?: string
}

