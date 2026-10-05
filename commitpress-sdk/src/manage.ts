import fs from 'fs/promises'
import type { Dirent } from 'fs'
import path from 'path'
import { isPublished, type ContentFile, type ContentStatus } from './types.js'
import { resolveDataDirectory } from './paths.js'

export interface ManageOptions {
  /**
   * Root directory of the repository containing `__commitpress__`.
   * Defaults to `process.cwd()`.
   */
  root?: string
}

export interface WriteContentOptions<T = unknown> extends ManageOptions {
  /**
   * Relative slug path (e.g. `'content/pages/product'` or `'content/collections/products/shoe-1'`).
   */
  slug: string
  /**
   * Schema name (e.g. `'marketing'` or `'products'`).
   */
  schema: string
  /**
   * Content fields payload object.
   */
  content: T
  /**
   * Live status (`'published'` | `'draft'`). Defaults to `'published'`.
   */
  status?: ContentStatus
  /**
   * Timestamp when published in ms.
   * If omitted and status is `'published'`, defaults to `Date.now()` (or preserves existing `published_at` if overwriting).
   */
  published_at?: number
  /**
   * Timestamp when last edited in ms. Defaults to `Date.now()`.
   */
  last_edited?: number
  /**
   * Envelope format version. Defaults to 3.
   */
  v?: number
  /**
   * Optional checksum or sha identifier.
   */
  checksum?: string
  /**
   * Whether to overwrite existing file if present. Defaults to `true`.
   */
  overwrite?: boolean
}

export interface BulkWriteItem<T = unknown> {
  slug: string
  schema: string
  content: T
  status?: ContentStatus
  published_at?: number
  last_edited?: number
  v?: number
  checksum?: string
}

export interface BulkWriteOptions extends ManageOptions {
  /**
   * Maximum concurrent file write operations.
   * Defaults to 50.
   */
  concurrency?: number
  /**
   * Fallback status if an item does not specify one. Defaults to `'published'`.
   */
  defaultStatus?: ContentStatus
  /**
   * Whether to overwrite existing files. Defaults to `true`.
   */
  overwrite?: boolean
  /**
   * Whether to halt bulk processing on the first error. Defaults to `false`.
   */
  stopOnError?: boolean
  /**
   * Progress callback after each item processed.
   */
  onProgress?: (written: number, total: number) => void
}

export interface BulkWriteResult {
  total: number
  written: number
  failed: number
  errors: Array<{ slug: string; error: string }>
}

/**
 * Normalizes a content slug by stripping leading slashes, `.json` extensions, and `__commitpress__/` prefixes.
 */
export function normalizeSlug(rawSlug: string): string {
  let cleaned = rawSlug.trim().replace(/\\/g, '/')
  if (cleaned.startsWith('/')) cleaned = cleaned.slice(1)
  if (cleaned.startsWith('__commitpress__/')) cleaned = cleaned.slice('__commitpress__/'.length)
  if (cleaned.endsWith('.json')) cleaned = cleaned.slice(0, -5)
  return cleaned
}

/**
 * Safely resolves a slug and root directory to an absolute file path within `__commitpress__`.
 * Prevents directory traversal outside `__commitpress__`.
 */
export function resolveContentPath(slug: string, root = process.cwd()): { normalizedSlug: string; filePath: string } {
  const normalizedSlug = normalizeSlug(slug)
  if (!normalizedSlug || normalizedSlug.includes('..')) {
    throw new Error(`Invalid slug "${slug}": Slugs must not be empty or contain directory traversal ("..").`)
  }

  const commitpressDir = path.resolve(root, '__commitpress__')
  const filePath = path.resolve(commitpressDir, `${normalizedSlug}.json`)

  if (!filePath.startsWith(commitpressDir + path.sep) && filePath !== commitpressDir) {
    throw new Error(`Invalid slug "${slug}": Resolved path is outside __commitpress__ directory.`)
  }

  return { normalizedSlug, filePath }
}

function assertConcurrency(concurrency: number): void {
  if (!Number.isSafeInteger(concurrency) || concurrency < 1) {
    throw new Error('Concurrency must be a positive integer.')
  }
}

/** Check the real parent after creation: a junction inside the repo must not redirect writes. */
async function assertManagedPath(filePath: string, dataDir: string): Promise<void> {
  const realRoot = await fs.realpath(dataDir)
  const realParent = await fs.realpath(path.dirname(filePath))
  if (realParent !== realRoot && !realParent.startsWith(realRoot + path.sep)) {
    throw new Error(`Content path escapes the configured data directory: ${filePath}`)
  }
  try {
    const entry = await fs.lstat(filePath)
    if (entry.isSymbolicLink()) throw new Error(`Content path is a symbolic link: ${filePath}`)
  } catch (error: any) {
    if (error?.code !== 'ENOENT') throw error
  }
}

/** Create one directory at a time, checking each before anything is created beneath it. */
async function ensureManagedParent(filePath: string, dataDir: string): Promise<void> {
  await fs.mkdir(dataDir, { recursive: true })
  const realRoot = await fs.realpath(dataDir)
  const relative = path.relative(dataDir, path.dirname(filePath))
  let current = dataDir
  for (const segment of relative ? relative.split(path.sep) : []) {
    current = path.join(current, segment)
    try {
      await fs.mkdir(current)
    } catch (error: any) {
      if (error?.code !== 'EEXIST') throw error
    }
    const realCurrent = await fs.realpath(current)
    if (!realCurrent.startsWith(realRoot + path.sep)) {
      throw new Error(`Content path escapes the configured data directory: ${filePath}`)
    }
  }
  await assertManagedPath(filePath, dataDir)
}

async function resolveConfiguredContentPath(slug: string, root: string) {
  const normalizedSlug = normalizeSlug(slug)
  if (!normalizedSlug || normalizedSlug.includes('..')) {
    throw new Error(`Invalid slug "${slug}": Slugs must not be empty or contain directory traversal ("..").`)
  }
  const dataDir = await resolveDataDirectory(root)
  const filePath = path.resolve(dataDir, `${normalizedSlug}.json`)
  if (!filePath.startsWith(dataDir + path.sep) && filePath !== dataDir) {
    throw new Error(`Invalid slug "${slug}": Resolved path is outside the configured data directory.`)
  }
  return { normalizedSlug, filePath, dataDir }
}

/**
 * Programmatically write (create or overwrite) a single content record.
 */
export async function writeContent<T = unknown>({
  slug,
  schema,
  content,
  status = 'published',
  root = process.cwd(),
  published_at,
  last_edited = Date.now(),
  v = 3,
  checksum,
  overwrite = true,
}: WriteContentOptions<T>): Promise<ContentFile<T>> {
  const { normalizedSlug, filePath, dataDir } = await resolveConfiguredContentPath(slug, root)

  await ensureManagedParent(filePath, dataDir)

  let existing: ContentFile<T> | null = null
  try {
    const raw = await fs.readFile(filePath, 'utf-8')
    existing = JSON.parse(raw) as ContentFile<T>
  } catch (error: any) {
    if (error?.code !== 'ENOENT') throw error
  }

  if (existing && !overwrite) {
    throw new Error(`Content file already exists at "${normalizedSlug}" and overwrite is false.`)
  }

  let finalPublishedAt = published_at
  if (status === 'published') {
    if (finalPublishedAt === undefined) {
      finalPublishedAt = existing?.published_at ?? Date.now()
    }
  } else {
    finalPublishedAt = existing?.published_at
  }

  const file: ContentFile<T> = {
    v,
    schema,
    slug: normalizedSlug,
    status,
    ...(finalPublishedAt !== undefined ? { published_at: finalPublishedAt } : {}),
    last_edited,
    ...(checksum !== undefined || existing?.checksum ? { checksum: checksum ?? existing?.checksum } : {}),
    content,
  }

  await fs.writeFile(filePath, JSON.stringify(file, null, 2), { encoding: 'utf-8', flag: overwrite ? 'w' : 'wx' })

  return file
}

/**
 * Programmatically update an existing content record by applying an updater function.
 */
export async function updateContent<T = unknown>(
  slug: string,
  updater: (existing: ContentFile<T>) => Partial<ContentFile<T>> | T,
  options: ManageOptions = {},
): Promise<ContentFile<T>> {
  const { normalizedSlug, filePath, dataDir } = await resolveConfiguredContentPath(slug, options.root ?? process.cwd())
  await assertManagedPath(filePath, dataDir)

  let raw: string
  try {
    raw = await fs.readFile(filePath, 'utf-8')
  } catch (error: any) {
    if (error?.code === 'ENOENT') throw new Error(`Cannot update content "${normalizedSlug}": file does not exist.`)
    throw error
  }

  const existing = JSON.parse(raw) as ContentFile<T>
  const updated = updater(existing)

  let newFile: ContentFile<T>
  if (typeof updated === 'object' && updated !== null && 'content' in (updated as object)) {
    const patch = updated as Partial<ContentFile<T>>
    newFile = {
      ...existing,
      ...patch,
      slug: normalizedSlug,
      last_edited: patch.last_edited ?? Date.now(),
    }
  } else {
    newFile = {
      ...existing,
      content: updated as T,
      last_edited: Date.now(),
    }
  }

  await fs.writeFile(filePath, JSON.stringify(newFile, null, 2), 'utf-8')
  return newFile
}

/**
 * Programmatically delete a content record by slug.
 * Returns true if deleted, false if file did not exist.
 */
export async function deleteContent(slug: string, options: ManageOptions = {}): Promise<boolean> {
  const { filePath, dataDir } = await resolveConfiguredContentPath(slug, options.root ?? process.cwd())
  try {
    await assertManagedPath(filePath, dataDir)
  } catch (error: any) {
    if (error?.code === 'ENOENT') return false
    throw error
  }
  try {
    await fs.unlink(filePath)
    return true
  } catch (err: any) {
    if (err.code === 'ENOENT') return false
    throw err
  }
}

/**
 * High-performance bulk write (create/update) operation with concurrent worker pool processing.
 */
export async function bulkWrite<T = unknown>(
  items: BulkWriteItem<T>[],
  options: BulkWriteOptions = {},
): Promise<BulkWriteResult> {
  const {
    root = process.cwd(),
    concurrency = 50,
    defaultStatus = 'published',
    overwrite = true,
    stopOnError = false,
    onProgress,
  } = options
  assertConcurrency(concurrency)

  const result: BulkWriteResult = {
    total: items.length,
    written: 0,
    failed: 0,
    errors: [],
  }

  if (items.length === 0) return result

  let currentIndex = 0
  let activeCount = 0
  let isHalted = false

  return new Promise((resolve) => {
    const next = () => {
      if ((isHalted || currentIndex >= items.length) && activeCount === 0) {
        return resolve(result)
      }

      while (!isHalted && activeCount < concurrency && currentIndex < items.length) {
        const item = items[currentIndex++]
        activeCount++

        writeContent({
          slug: item.slug,
          schema: item.schema,
          content: item.content,
          status: item.status ?? defaultStatus,
          published_at: item.published_at,
          last_edited: item.last_edited,
          v: item.v,
          checksum: item.checksum,
          root,
          overwrite,
        })
          .then(() => {
            result.written++
            onProgress?.(result.written + result.failed, items.length)
          })
          .catch((err) => {
            result.failed++
            const errorMsg = err.message ?? String(err)
            result.errors.push({ slug: item.slug, error: errorMsg })
            onProgress?.(result.written + result.failed, items.length)
            if (stopOnError) {
              isHalted = true
            }
          })
          .finally(() => {
            activeCount--
            next()
          })
      }
    }

    next()
  })
}

/**
 * Bulk update existing items by applying an updater function.
 * Accepts an array of slugs or a folder/type path (e.g. `'content/collections/products'`).
 */
export async function bulkUpdate<T = unknown>(
  slugsOrType: string | string[],
  updater: (item: ContentFile<T>) => Partial<ContentFile<T>> | T,
  options: BulkWriteOptions = {},
): Promise<BulkWriteResult> {
  const root = options.root ?? process.cwd()

  let slugsToUpdate: string[] = []
  if (Array.isArray(slugsOrType)) {
    slugsToUpdate = slugsOrType
  } else {
    const { normalizedSlug: typeDir } = resolveContentPath(slugsOrType, root)
    const dirPath = path.join(await resolveDataDirectory(root), typeDir)

    async function walkDir(dir: string, base: string): Promise<string[]> {
      let entries: Dirent[] = []
      try {
        entries = await fs.readdir(dir, { withFileTypes: true })
      } catch (error: any) {
        if (error?.code === 'ENOENT') return []
        throw error
      }

      const acc: string[] = []
      for (const entry of entries) {
        const full = path.join(dir, entry.name)
        const rel = `${base}/${entry.name}`
        if (entry.isDirectory()) {
          acc.push(...(await walkDir(full, rel)))
        } else if (entry.isFile() && entry.name.endsWith('.json')) {
          acc.push(rel.slice(0, -5))
        }
      }
      return acc
    }

    slugsToUpdate = await walkDir(dirPath, typeDir)
  }

  const concurrency = options.concurrency ?? 50
  assertConcurrency(concurrency)
  const result: BulkWriteResult = {
    total: slugsToUpdate.length,
    written: 0,
    failed: 0,
    errors: [],
  }

  if (slugsToUpdate.length === 0) return result

  let currentIndex = 0
  let activeCount = 0

  return new Promise((resolve) => {
    const next = () => {
      if (currentIndex >= slugsToUpdate.length && activeCount === 0) {
        return resolve(result)
      }

      while (activeCount < concurrency && currentIndex < slugsToUpdate.length) {
        const slug = slugsToUpdate[currentIndex++]
        activeCount++

        updateContent<T>(slug, updater, { root })
          .then(() => {
            result.written++
            options.onProgress?.(result.written + result.failed, slugsToUpdate.length)
          })
          .catch((err) => {
            result.failed++
            result.errors.push({ slug, error: err.message ?? String(err) })
            options.onProgress?.(result.written + result.failed, slugsToUpdate.length)
          })
          .finally(() => {
            activeCount--
            next()
          })
      }
    }

    next()
  })
}

/**
 * Bulk delete items by array of slugs.
 */
export async function bulkDelete(
  slugs: string[],
  options: BulkWriteOptions = {},
): Promise<{ total: number; deleted: number; failed: number; errors: Array<{ slug: string; error: string }> }> {
  const { root = process.cwd(), concurrency = 50, onProgress } = options
  assertConcurrency(concurrency)

  let deleted = 0
  let failed = 0
  const errors: Array<{ slug: string; error: string }> = []

  let currentIndex = 0
  let activeCount = 0

  return new Promise((resolve) => {
    const next = () => {
      if (currentIndex >= slugs.length && activeCount === 0) {
        return resolve({ total: slugs.length, deleted, failed, errors })
      }

      while (activeCount < concurrency && currentIndex < slugs.length) {
        const slug = slugs[currentIndex++]
        activeCount++

        deleteContent(slug, { root })
          .then((wasDeleted) => {
            if (wasDeleted) deleted++
            onProgress?.(deleted + failed, slugs.length)
          })
          .catch((err) => {
            failed++
            errors.push({ slug, error: err.message ?? String(err) })
            onProgress?.(deleted + failed, slugs.length)
          })
          .finally(() => {
            activeCount--
            next()
          })
      }
    }

    next()
  })
}
