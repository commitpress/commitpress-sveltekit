/**
 * Reading the media library from a site build.
 *
 * Until now the SDK had no notion of an asset at all. An image control produces a bare `string` —
 * the asset id — and nothing in the SDK could turn one into something an `<img>` can use, which is
 * the reason `static-fields.ts` still has no social image field. So a template that wanted a picture
 * had to assemble a URL from a storage layout it should not know about, and had no access to the
 * dimensions, the alt text or the renditions the library already records.
 *
 * What makes this cheap is that the catalogue is content. `media/images/index.json` is committed
 * beside `content/` in the same `__commitpress__` folder `query` reads, so this is one more file read
 * at the same root — no API, no network, no build step. That is a deliberate property of the asset
 * service (see the note on folders in the app's `content/media`): the bytes may live in a bucket, but
 * the catalogue is always in git.
 *
 * ## Folders
 *
 * Folders are strings on each manifest, not directories — `headers`, `galleries/2024`. That means a
 * folder query is a filter over a list already in memory, which is what lets a folder be rendered as
 * a gallery without the library and the page keeping two copies of the same set.
 *
 * **An asset may be in several folders at once.** `folders` is the list; `folder` is its first entry
 * and is what an index written before this carried. Reading `folders` is what a listing does, so the
 * same photograph filed in `galleries/2024` and in `press` appears in both without the library
 * holding two copies of it. An index with only `folder` reads as a one-element list, so nothing has
 * to be migrated.
 *
 * One limit worth knowing before building a page on a folder: **it has no published state.** Every
 * other read in this SDK defaults drafts-off (see `query.ts`), and an asset has no equivalent — so a
 * folder rendered as a gallery shows whatever is filed there the moment it is uploaded.
 *
 * ## Order
 *
 * `sort: 'stored'` is the order the library holds them in, which is upload order. An author-chosen
 * sequence is **not** in the library: it is held by whichever gallery field points at the folder, in
 * that page's own content file, so two galleries over one folder may disagree and arranging one does
 * not require permission to reorganise the media library. `gallery()` below is the call that reads
 * both halves — pass it the field's value and it answers the images in the author's order.
 */
import fs from 'fs/promises'
import path from 'path'
import { resolveDataDirectory } from './paths.js'
import {
  imageAlt,
  imageId,
  imageRendition,
  type ImageObject,
  type ImageValue,
} from './image.js'
import {
  galleryFolder,
  galleryOption,
  galleryOrder,
  isWithinAssetFolder,
  normaliseAssetFolder,
  GALLERY_GRID,
  GALLERY_FULL,
  type GalleryValue,
} from './gallery.js'

/** Where the catalogue sits under the content root. Mirrors `INDEX_PATH` in the app. */
const INDEX_SEGMENTS = ['media', 'images', 'index.json'] as const

/** The config file the public base is read from, when a caller does not pass one. */
const CONFIG_FILENAME = 'commitpress.config.json'

/**
 * How far up from the content root to look for the config.
 *
 * The config is not reliably beside `__commitpress__`: `config.root` may point the content folder at
 * a subdirectory while the config stays at the repository root. Walking up a few levels finds it in
 * both layouts, and a bounded walk cannot wander into someone's home directory looking for a file.
 */
const CONFIG_SEARCH_DEPTH = 3

/**
 * The index versions this build understands.
 *
 * The same reasoning as `SUPPORTED_CONTENT_FORMAT`: an index written by a newer commitpress read with
 * older assumptions does not fail, it silently yields a library missing whatever the new key meant.
 */
const SUPPORTED_INDEX_VERSION = 1

export interface AssetFocalPoint {
  x: number
  y: number
}

/** One rendition, with its URL resolved. */
export interface AssetVariant {
  /** As declared in `images.sizes` — `thumb`, `card`, `wide` by default. */
  name: string
  url: string
  width: number
  height: number
  bytes: number
}

/** One asset, with every URL resolved and its real dimensions attached. */
export interface Asset {
  id: string
  /** What it was uploaded as. Useful for a download name, not for a URL. */
  filename: string
  /** Empty means decorative, which is a real answer — do not substitute the filename. */
  alt: string
  /**
   * The primary folder — `folders[0]`. `''` is the root.
   *
   * Kept because it is what every build before multi-folder membership read. Filtering on it is a
   * bug now rather than merely narrow: an asset filed in `press` and `galleries/2024` has one of
   * them here and is genuinely in both. Use `folders`.
   */
  folder: string
  /** Every folder it is filed in, primary first. Always at least one entry. */
  folders: string[]
  /** The original's URL. */
  url: string
  width: number
  height: number
  bytes: number
  uploaded_at: number
  /** What a crop keeps in frame, in fractions. Absent means centre. */
  focal?: AssetFocalPoint
  variants: AssetVariant[]
}

export interface AssetOptions {
  /** Where `__commitpress__` is. Defaults to the working directory, as `query` does. */
  root?: string
  /**
   * The public base for the bytes, overriding `storage.public_url`.
   *
   * Either an absolute origin (a bucket or CDN host) or a site-relative path. Passing it is the
   * escape hatch for a site that serves media from somewhere its config cannot state — a per-branch
   * preview host, for instance.
   */
  baseUrl?: string
}

/** How a listing is ordered. See the note on folders above for why `stored` is the default. */
export type AssetSort = 'stored' | 'newest' | 'oldest' | 'filename'

export interface AssetQuery extends AssetOptions {
  /** Which folder to list. `''` or absent is the whole library. */
  folder?: string
  /** Whether nested folders are included. Off by default, which is what the library screen shows. */
  recursive?: boolean
  sort?: AssetSort
}

/** The catalogue as it is stored, before URLs are resolved. */
type RawVariant = {
  name?: unknown
  path?: unknown
  width?: unknown
  height?: unknown
  bytes?: unknown
}

type RawManifest = {
  id?: unknown
  filename?: unknown
  path?: unknown
  alt?: unknown
  folder?: unknown
  folders?: unknown
  width?: unknown
  height?: unknown
  bytes?: unknown
  uploaded_at?: unknown
  focal?: unknown
  variants?: unknown
}

type RawIndex = {
  version?: unknown
  folders?: unknown
  assets?: unknown
}

function num(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

/**
 * A folder path, cleaned up, and the containment test built on it.
 *
 * Both are deliberately forgiving rather than validating: the app is what refuses an unusable folder
 * name at the point one is created, and a reader's job is to answer for the name it was given.
 * Segments that could climb are dropped rather than rejected, because this string is compared
 * against stored folders and never joined onto a path.
 *
 * They live in `./gallery`, which has no `node:fs` in it, so a preview target can normalise a stored
 * folder without dragging the library reader into a browser bundle. Re-exported here because this is
 * where a reader looking for them expects to find them.
 */
export { normaliseAssetFolder, isWithinAssetFolder } from './gallery.js'

/**
 * Every folder one manifest is filed in, canonical: deduplicated, primary first, never empty.
 *
 * Mirrors `canonicalFolders` in the app, including the rule that the root drops out once anything
 * else is present — an asset filed in `press` is not also loose at the top level, and a root listing
 * that included every filed image would be a root listing nobody could use.
 */
function membership(manifest: RawManifest): string[] {
  const raw = Array.isArray(manifest.folders) ? manifest.folders : [manifest.folder]
  const seen = new Set<string>()

  for (const value of raw) {
    seen.add(normaliseAssetFolder(str(value)))
  }

  const filed = [...seen].filter(Boolean)
  return filed.length ? filed : ['']
}

/** Every ancestor of a folder, itself included: `a/b/c` → `a`, `a/b`, `a/b/c`. */
function lineage(folder: string): string[] {
  const segments = folder.split('/').filter(Boolean)
  return segments.map((_, position) => segments.slice(0, position + 1).join('/'))
}

/**
 * Join a store key onto the public base.
 *
 * One expression for both drivers, because a manifest's `path` is store-relative in both — with the
 * git driver the base names the folder in the repository, with S3 it names the bucket or the CDN in
 * front of it. Segments are encoded individually so a slash in the key stays a slash.
 */
function joinUrl(base: string, key: string): string {
  const encoded = key.split('/').filter(Boolean).map(encodeURIComponent).join('/')
  const trimmed = base.replace(/\/+$/, '')

  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) {
    return `${trimmed}/${encoded}`
  }
  return `${trimmed.startsWith('/') || trimmed === '' ? trimmed : `/${trimmed}`}/${encoded}`
}

/** Read the config's `assets.storage.public_url`, from the content root or the nearest ancestor holding one. */
async function configuredBaseUrl(root: string): Promise<string | undefined> {
  let directory = path.resolve(root)

  for (let level = 0; level <= CONFIG_SEARCH_DEPTH; level += 1) {
    try {
      const raw = await fs.readFile(path.join(directory, CONFIG_FILENAME), 'utf-8')
      const config = JSON.parse(raw) as { assets?: { storage?: { public_url?: unknown } } }
      const publicUrl = config.assets?.storage?.public_url
      return typeof publicUrl === 'string' && publicUrl ? publicUrl : undefined
    } catch {
      const parent = path.dirname(directory)
      if (parent === directory) return undefined
      directory = parent
    }
  }

  return undefined
}

/**
 * Where the bytes are served from, or a refusal.
 *
 * Throwing rather than emitting a relative path and hoping is the same call `query` makes on a draft:
 * an asset with no resolvable URL renders as a broken image on a page nobody checks, while a build
 * that stops is a build someone fixes. The message has to carry the fix, because this is the one
 * error a first-time user of the feature will hit.
 */
async function resolveBaseUrl(options: AssetOptions, root: string): Promise<string> {
  const base = options.baseUrl ?? (await configuredBaseUrl(root))

  if (base === undefined) {
    throw new Error(
      'Cannot build asset URLs: the media store has no public base.\n' +
        `Add "storage": { "public_url": "…" } to ${CONFIG_FILENAME} — the path or origin the bytes ` +
        'are served from. With the git driver they are committed to the repository, so it is ' +
        'wherever the site exposes "__commitpress__/media/images"; with the s3 driver it is the ' +
        'bucket or CDN origin. Or pass { baseUrl } to this call.',
    )
  }

  return base
}

function toAsset(manifest: RawManifest, base: string): Asset {
  const variants = Array.isArray(manifest.variants) ? (manifest.variants as RawVariant[]) : []
  const focal = manifest.focal as { x?: unknown; y?: unknown } | undefined
  const folders = membership(manifest)

  return {
    id: str(manifest.id),
    filename: str(manifest.filename),
    // Defaulted rather than required: an index written before either key existed is still a library
    // this has to be able to read, and the root folder is exactly where those assets belong.
    alt: str(manifest.alt),
    folder: folders[0]!,
    folders,
    url: joinUrl(base, str(manifest.path)),
    width: num(manifest.width),
    height: num(manifest.height),
    bytes: num(manifest.bytes),
    uploaded_at: num(manifest.uploaded_at),
    focal:
      focal && typeof focal.x === 'number' && typeof focal.y === 'number'
        ? { x: focal.x, y: focal.y }
        : undefined,
    variants: variants.map(variant => ({
      name: str(variant.name),
      url: joinUrl(base, str(variant.path)),
      width: num(variant.width),
      height: num(variant.height),
      bytes: num(variant.bytes),
    })),
  }
}

type Library = { folders: string[]; assets: Asset[] }

/**
 * The whole library, resolved.
 *
 * Not exported: every caller wants either a listing or one asset, and handing out the raw set invites
 * a page to filter it by a key that is not part of this contract.
 */
async function readLibrary(options: AssetOptions): Promise<Library> {
  const root = options.root ?? process.cwd()
  const indexPath = path.join(await resolveDataDirectory(root), ...INDEX_SEGMENTS)

  let raw: string
  try {
    raw = await fs.readFile(indexPath, 'utf-8')
  } catch (error: any) {
    if (error?.code !== 'ENOENT') throw error
    // An empty library and a missing one are the same answer to "what is in it", and a repository
    // that has never had an upload has no index file at all.
    return { folders: [], assets: [] }
  }

  const index = JSON.parse(raw) as RawIndex
  const version = num(index.version, 1)

  if (version > SUPPORTED_INDEX_VERSION) {
    throw new Error(
      `The media library index is version ${version}; this SDK reads up to ` +
        `${SUPPORTED_INDEX_VERSION}. Update the commitpress SDK.`,
    )
  }

  const base = await resolveBaseUrl(options, root)
  const manifests = Array.isArray(index.assets) ? (index.assets as RawManifest[]) : []
  const declared = Array.isArray(index.folders) ? (index.folders as unknown[]) : []

  return {
    folders: declared.filter((value): value is string => typeof value === 'string'),
    assets: manifests.map(manifest => toAsset(manifest, base)),
  }
}

function sortAssets(assets: Asset[], sort: AssetSort): Asset[] {
  switch (sort) {
    case 'newest':
      return [...assets].sort((a, b) => b.uploaded_at - a.uploaded_at)
    case 'oldest':
      return [...assets].sort((a, b) => a.uploaded_at - b.uploaded_at)
    case 'filename':
      return [...assets].sort((a, b) => a.filename.localeCompare(b.filename))
    case 'stored':
      return assets
  }
}

/**
 * Every asset in a folder, or in the whole library.
 *
 * This is the call a gallery is built from: a folder is already "an ordered set of assets sharing a
 * name", which is the shape a gallery needs, so nothing has to be duplicated into a collection to
 * render one.
 */
export async function assets(query: AssetQuery = {}): Promise<Asset[]> {
  const { assets: all } = await readLibrary(query)
  const folder = normaliseAssetFolder(query.folder)

  // Every folder the asset is in, not only its primary one: being filed in two places is the whole
  // point, and a listing that read `folder` would show it in whichever happened to be written first.
  const matched = !folder
    ? // The whole library when no folder is named, but only the root's own assets when a caller has
      // asked for a non-recursive listing of it — otherwise `recursive: false` would silently mean
      // something different at the root than one level down.
      query.recursive === false
      ? all.filter(asset => asset.folders.includes(''))
      : all
    : all.filter(asset =>
        query.recursive
          ? asset.folders.some(filed => isWithinAssetFolder(filed, folder))
          : asset.folders.includes(folder),
      )

  return sortAssets(matched, query.sort ?? 'stored')
}

/**
 * What a `gallery` field holds, what folder it names, and how a sequence is applied to a list.
 *
 * All three live in `./gallery` — no `node:fs`, so a preview island can arrange the photographs it
 * already has from the value the editor just posted. See the note at the top of that file: the
 * reconciliation needs no library, and a site that could only do it on the server was a site whose
 * preview could never honour a reorder. Re-exported here because this is where a reader looking for
 * them expects to find them, and because `gallery()` below is built out of them.
 */
export {
  galleryFolder,
  galleryOrder,
  galleryOrderIds,
  galleryOption,
  galleryOptions,
  previewGallery,
  previewGalleryIds,
  GALLERY_GRID,
  GALLERY_FULL,
} from './gallery.js'
export type { GalleryValue } from './gallery.js'

/** One gallery image with both of its renditions already chosen. */
export interface GalleryImage {
  asset: Asset
  /** The tile. ~640px — see `GALLERY_GRID`. */
  grid: AssetVariant
  /** What sits behind the tile. ~1600px — see `GALLERY_FULL`. */
  full: AssetVariant
  /**
   * What the author marked this picture as, or `''` — one of the literals the field's schema
   * declares (`landscape`, `portrait`, whatever this project named).
   *
   * Resolved here rather than left to the caller because the alternative is `galleryOption(value,
   * image.asset.id)` written out at every use site, over a value the template has to keep hold of
   * alongside the images — and forgetting it fails the way the ordering used to: silently, with a
   * page that looks right and ignores a decision somebody made.
   */
  option: string
}

/**
 * A gallery's images with the grid and full renditions resolved for each.
 *
 * The call a gallery page should make. `gallery()` answers assets and leaves picking a file to the
 * template, which is the step where the whole feature quietly fails to happen: the obvious thing to
 * write is `asset.url`, that is the 4096px master, and a grid of forty of them looks completely
 * correct while being the thing this exists to prevent. Nothing 404s and nothing is visibly wrong —
 * the page is just slow, which is the failure nobody attributes to the right cause.
 *
 * **Both fields always resolve**, via `pickVariant`, so a template never branches. An image smaller
 * than a rendition was never upscaled into one and falls back to the next best thing it has, ending
 * at the original — which for such an image is already small. An image in a folder that was marked
 * as a gallery only recently may have neither yet, and falls back the same way while the library
 * offers to cut them; a gallery that rendered nothing until somebody ran a rebuild would be a worse
 * answer than one that is briefly heavier than it should be.
 */
export async function galleryImages(
  value: GalleryValue,
  options: GalleryQuery = {},
): Promise<GalleryImage[]> {
  const found = await gallery(value, options)
  return found.map(asset => ({
    asset,
    // Neither name falls back to the other, in either direction. `GALLERY_FULL` used to stand behind
    // the grid, on the reasoning that a heavier tile beats no tile — but the two are cut in the same
    // pass, so "has `cp-full`, lacks `cp-grid`" is not a state the builder produces, and a fallback
    // that never fires is a fallback nothing tests. What it did instead was make the wrong file
    // *representable* here, in the one function whose job is to keep a 1600px master out of a 320px
    // tile. The original is the honest last resort for both, and for an image too small to have been
    // cut it is already small.
    grid: pickVariant(asset, GALLERY_GRID),
    // The other direction was never on: a tile-sized file blown up to fill a lightbox is worse than
    // the original, which is at least sharp.
    full: pickVariant(asset, GALLERY_FULL),
    option: galleryOption(value, asset.id),
  }))
}

export interface GalleryQuery extends AssetOptions {
  /** Whether nested folders are included. Off by default, as `assets()` is. */
  recursive?: boolean
}

/**
 * The images of a gallery field, in the order its author arranged them.
 *
 * This is the call a gallery page should make, rather than `assets({ folder })` over a folder path
 * pulled out of the field by hand — because doing that silently discards the ordering, and an
 * ordering nobody can see being dropped is the failure mode this function exists to prevent.
 *
 * **The stored order is a preference, never a filter**, and the two rules that follow from it are
 * the whole of the reconciliation:
 *
 *   - **Ids the folder no longer holds fall out.** The image was deleted, or refiled elsewhere; a
 *     gallery is not the place to discover that.
 *   - **Images the order does not mention are appended**, in the library's own order. They were
 *     uploaded after the arranging was done, and a gallery that silently omitted every photograph
 *     added since somebody last touched the page would be worse than one in the wrong order —
 *     wrong in a way nobody notices.
 *
 * An empty or unset value is an empty gallery rather than the whole library. `assets()` with no
 * folder means "everything" because a caller asked for everything; a *field* nobody filled in has
 * not asked for anything, and answering it with the entire media library is the one wrong answer.
 */
export async function gallery(
  value: GalleryValue,
  options: GalleryQuery = {},
): Promise<Asset[]> {
  const folder = galleryFolder(value)
  if (!folder) return []

  // The folder read is the half that needs a disk; `galleryOrder` is the half a browser can do, and
  // is the same call a preview target makes over the photographs it is already holding.
  return galleryOrder(value, await assets({ ...options, folder, sort: 'stored' }))
}

/**
 * What an `image` field holds, and how to read it.
 *
 * The shape, `imageId`, `imageRendition` and `imageAlt` live in `./image` — no `node:fs`, so a site
 * component can import them in a browser bundle. Re-exported here because this is where a reader
 * looking for them expects to find them, and because `picture()` below is built out of them.
 */
export { imageId, imageRendition, imageAlt } from './image.js'
export type { ImageObject, ImageValue } from './image.js'

/**
 * A slot's asset id, or `''` — never the `renditions` or `alt` entries, which are not pictures.
 *
 * The same guard `./image` states, for the same reason: `alt` may hold a string in a hand-written
 * content file, and a description read as an asset id resolves to nothing.
 */
function slotId(value: ImageObject, slot: string): string {
  if (slot === 'renditions' || slot === 'alt') return ''
  const held = value[slot]
  return typeof held === 'string' ? held.trim() : ''
}

/** One `<source>`: the slot it came from, the condition the site gave it, and the picture. */
export interface PictureSource {
  slot: string
  media: string
  asset: Asset
  /**
   * The file to point the `<source>` at: the rendition this slot was pinned to, else the first of
   * the caller's `prefer` list the asset has, else the original.
   */
  variant: AssetVariant
}

/** An image field resolved for a `<picture>`: the sources in order, and the fallback `<img>`. */
export interface Picture {
  /** The default image. Always present — a picture with no fallback is not one. */
  img: Asset
  /** The file to point the `<img>` at, resolved the same way `PictureSource.variant` is. */
  variant: AssetVariant
  /** In the order the caller's map declared them, which is the order a browser evaluates them. */
  sources: PictureSource[]
}

export interface PictureOptions extends AssetOptions {
  /**
   * The renditions this site would like, best first. `['wide', 'card']` reads as "wide if it has
   * one, else card, else the original".
   *
   * A preference rather than a requirement, for the reason `pickVariant` takes a list: variant names
   * come from the repository's own config, so a template naming one size breaks on a project
   * configured differently. **A rendition pinned in the editor outranks all of it** — that pin is
   * somebody looking at the page saying this picture belongs at that size, and this list is what a
   * template guessed for every picture it would ever hold.
   */
  prefer?: string[]
}

/**
 * An image field resolved into what a `<picture>` element needs.
 *
 * **The media conditions come from the caller**, and that is the design rather than an omission.
 * Where a site's breakpoints are is a fact about its stylesheet — it is already written down in
 * CSS, it changes when the design does, and a second copy inside a CMS schema is a second place to
 * edit with no way to tell which of the two is stale. So commitpress answers *which picture* and
 * the site says *when*:
 *
 * ```ts
 * const hero = await picture(page.hero, { mobile: '(max-width: 768px)' })
 * ```
 *
 * Two rules, and both are about what a `<picture>` already does:
 *
 *   - **A slot the value does not name is not a source.** The default covers it, which is exactly
 *     what an editor who left it empty asked for.
 *   - **Each asset carries the description this field gave it**, where the field's schema offers
 *     that and an editor wrote one — `img.alt` is the override if there is one and the asset's own
 *     sentence otherwise, so a template writing `alt={hero.img.alt}` needs to know nothing about
 *     the feature. See `imageAlt` in `./image`.
 *   - **An alternate naming a deleted asset is dropped, and a missing default throws.** The
 *     asymmetry is the point: falling back is what the element is for, so a lost alternate costs a
 *     source and nothing else — while a lost default is a page with a hole in it, and a build that
 *     stops is a build somebody fixes.
 *
 * Each entry carries a resolved `variant` as well as its asset, so the rendition an editor pinned
 * cannot be silently lost on the way to the page:
 *
 * ```ts
 * const hero = await picture(page.hero, { mobile: '(max-width: 768px)' }, { prefer: ['wide'] })
 * // <img src={hero.variant.url} width={hero.variant.width} …>
 * // {#each hero.sources as s}<source media={s.media} srcset={s.variant.url} />{/each}
 * ```
 */
export async function picture(
  value: ImageValue,
  media: Record<string, string> = {},
  options: PictureOptions = {},
): Promise<Picture> {
  const src = imageId(value)
  if (!src) {
    throw new Error(
      'An image field with no image cannot be rendered as a <picture>. Check the field is filled ' +
        'in, or guard the call — an optional image is optional on the page too.',
    )
  }

  const { assets: all } = await readLibrary(options)
  const byId = new Map(all.map(item => [item.id, item]))

  const img = byId.get(src)
  if (!img) {
    throw new Error(
      `No asset "${src}" in the media library. An image field holds an asset id; if this came ` +
        'from one, the asset was deleted after the field was filled in.',
    )
  }

  const prefer = options.prefer ?? []

  /**
   * The asset as this field describes it.
   *
   * A field may override the description for a placement — see `imageAlt` — and the override is
   * applied *here*, on a copy, rather than left for the template to remember. Two reasons, and the
   * second is the one that matters: `hero.img.alt` is what every template already writes, so an
   * override the caller has to fetch separately is an accessibility feature that silently does
   * nothing on the pages that did not hear about it. And a copy rather than a mutation, because the
   * asset behind it is shared with every other reader of the library in this process — writing the
   * sentence onto it would describe one page's crop on every page in the build.
   */
  const described = (item: Asset, slot?: string): Asset => {
    const said = imageAlt(value, slot)
    return said ? { ...item, alt: said } : item
  }

  const sources: PictureSource[] = []
  for (const [slot, condition] of Object.entries(media)) {
    // Read off the value directly rather than through `imageId`, which falls back to the default —
    // a source repeating the fallback under a media condition is bytes for nothing.
    const id = value && typeof value !== 'string' ? slotId(value, slot) : ''
    if (!id) continue

    const found = byId.get(id)
    if (found) {
      sources.push({
        slot,
        media: condition,
        asset: described(found, slot),
        variant: pickVariant(found, imageRendition(value, slot), ...prefer),
      })
    }
  }

  return {
    img: described(img),
    variant: pickVariant(img, imageRendition(value), ...prefer),
    sources,
  }
}

/**
 * One asset by id.
 *
 * Throws rather than returning nothing, for the reason `query` does: the caller named a specific
 * image, and a falsy return invites `?.url` and a page that builds with a hole in it.
 *
 */
export async function asset(id: string, options: AssetOptions = {}): Promise<Asset> {
  const { assets: all } = await readLibrary(options)
  const found = all.find(candidate => candidate.id === id)

  if (!found) {
    throw new Error(
      `No asset "${id}" in the media library. An image field holds an asset id; if this came from ` +
        'one, the asset was deleted after the field was filled in.',
    )
  }

  return found
}

/**
 * Every folder the library knows about, sorted.
 *
 * Unions both sources and fills in ancestors, the same way the app's `allFolders` does: a folder
 * exists either because something is filed in it or because someone made it and has not filled it
 * yet, and an asset in `galleries/2024` puts `galleries` on the map whether or not anyone declared
 * it — so a tree built from this can never have a hole in the middle of it.
 */
export async function assetFolders(options: AssetOptions = {}): Promise<string[]> {
  const { folders, assets: all } = await readLibrary(options)
  const known = new Set<string>()

  for (const folder of [...folders, ...all.flatMap(item => item.folders)]) {
    for (const ancestor of lineage(normaliseAssetFolder(folder))) {
      known.add(ancestor)
    }
  }

  return [...known].sort((a, b) => a.localeCompare(b))
}

/**
 * The first rendition an asset actually has, by preference, falling back to the original.
 *
 * The reason this exists rather than `asset.variants.find(…)` at each call site: variant names come
 * from the repo config, so a template naming one size is a template that breaks on a repository
 * configured differently — and the old flat uploads in a long-lived library have variant names the
 * current uploader never produces. Asking for `'card', 'wide'` states a preference and cannot fail.
 *
 * Empty names are skipped rather than rejected, so an editor's pin can be put in front of a site's
 * preference without the call site branching on whether there is one:
 * `pickVariant(item, imageRendition(page.hero), 'wide')`. `''` is the ordinary answer from an
 * unpinned field, not an error.
 */
export function pickVariant(item: Asset, ...names: (string | undefined)[]): AssetVariant {
  for (const name of names) {
    if (!name) continue
    const found = item.variants.find(variant => variant.name === name)
    if (found) return found
  }

  return {
    name: 'original',
    url: item.url,
    width: item.width,
    height: item.height,
    bytes: item.bytes,
  }
}
