/**
 * What a `gallery` field holds, and how to put a list of photographs into the order it names.
 *
 * A module of its own, and the reason is the one thing the field could not do before: **be honoured
 * in a live preview**. `assets()` reads `media/images/index.json` with `node:fs`, so everything in
 * `assets.ts` is server-only — which is correct for resolving a folder into pictures, and fatal for
 * the one job a preview target has. The editor posts the form's current values into the frame and
 * the page re-renders them in the browser; a gallery arrives there as a folder and a list of ids,
 * and a site that could only reconcile those on the server had no choice but to keep showing the
 * order the last save had. That is the gap this file closes: the *reconciliation* needs no library
 * at all. It needs the photographs the page is already holding and the ids the editor just sent.
 *
 * So there is no `fs` here and there must not be. `gallery()` in `assets.ts` is this function with a
 * folder read in front of it, and a preview island is this function with the props it already has.
 * One rule, two callers, and they cannot come to disagree about what an order means — which matters
 * more than the duplication saved, because a preview that arranges a gallery differently from the
 * page it is previewing is worse than one that does not arrange it at all.
 */

/**
 * The renditions every image in a gallery folder has, by name.
 *
 * **Reserved, so they are the same name in every repository**, which is the property that makes them
 * worth having. Ordinary rendition names come out of each project's `images.sizes`, so a gallery
 * component naming one breaks on a project configured differently — the caveat `pickVariant` opens
 * with. These two are produced by commitpress itself for any folder marked as a gallery, so a
 * component can ask for them and be right anywhere.
 *
 * `grid` is ~640px for a tile; `full` is ~1600px for whatever is behind the tile. Neither is the
 * original, which is bounded at 4096 and encoded for being *re-cut from* rather than for being
 * served — see `GALLERY_RENDITIONS` in the app for the numbers and the argument.
 *
 * Names rather than an import of the app's constants, because this package cannot depend on the app.
 * They are asserted equal in the app's own tests.
 */
export const GALLERY_GRID = 'cp-grid'
export const GALLERY_FULL = 'cp-full'

/**
 * What a `gallery` field holds.
 *
 * Two shapes, and both are current. A bare string is a folder with no author-chosen order — what
 * every gallery field wrote before ordering existed, and still exactly what an unarranged gallery
 * means. The object adds `order`, a list of asset ids, when somebody has arranged one, and
 * `options`, one schema-declared literal per image, when the field declares any.
 *
 * Reading it by hand is the thing to avoid; `gallery()` takes either and answers images,
 * `galleryOrder()` below takes either and answers a sequence, and `galleryOption()` answers what
 * was chosen for one picture.
 */
export type GalleryValue =
  | string
  | { folder?: string; order?: string[]; sort?: 'newest' | 'uploaded' | 'date' | 'name' | 'manual'; direction?: 'asc' | 'desc'; options?: Record<string, string> }
  | null
  | undefined

/**
 * Folder normalisation, kept here rather than imported so this module stays free of `node:fs`.
 *
 * `assets.ts` re-exports this one rather than keeping a second copy: two spellings of "what is a
 * folder path" is exactly the drift that makes a gallery resolve in a build and not in a preview.
 */
export function normaliseAssetFolder(raw: string | null | undefined): string {
  if (!raw) return ''
  return String(raw)
    .split('/')
    .map(segment => segment.trim())
    .filter(segment => segment && segment !== '.' && segment !== '..')
    .join('/')
}

/** True for `folder` itself and anything nested below it. The root contains everything. */
export function isWithinAssetFolder(candidate: string, folder: string): boolean {
  if (!folder) return true
  return candidate === folder || candidate.startsWith(`${folder}/`)
}

/** The folder a gallery field points at, whichever shape it was stored in. `''` means unset. */
export function galleryFolder(value: GalleryValue): string {
  if (!value) return ''
  return normaliseAssetFolder(typeof value === 'string' ? value : value.folder)
}

/** The ids a gallery field names, in the author's order. Empty when nobody has arranged one. */
export function galleryOrderIds(value: GalleryValue): string[] {
  if (!value || typeof value === 'string' || !Array.isArray(value.order)) return []
  return value.order.filter((id): id is string => typeof id === 'string' && !!id)
}

/**
 * What each image was marked as, by asset id.
 *
 * The literals are the field's own — a schema declaring `options` on a gallery says which words
 * exist (`landscape`/`portrait`, `wide`/`inset`), and the editor offers exactly those. Nothing here
 * knows the list, on purpose: the page reads a word it already has a layout for, and a word the
 * schema stopped offering is dropped at save time rather than policed at read time. See the
 * `gallery` case in the app's `content-parser`.
 *
 * Keyed by id and not by position, for the same reason the order is a list of ids: an image
 * uploaded into the folder afterwards shifts every position and no id.
 *
 * A fresh object each call rather than the stored one, so a page cannot write through it into the
 * value it was handed.
 */
export function galleryOptions(value: GalleryValue): Record<string, string> {
  if (!value || typeof value === 'string' || !value.options) return {}
  const chosen: Record<string, string> = {}
  for (const [id, choice] of Object.entries(value.options)) {
    if (id && typeof choice === 'string' && choice) chosen[id] = choice
  }
  return chosen
}

/**
 * The literal chosen for one image, or `''` when nobody chose one.
 *
 * `''` rather than `undefined` because it is the answer a template compares against, and an unmarked
 * picture is the ordinary case rather than a missing one: a gallery where two photographs are marked
 * `portrait` and the other forty are not is what this feature looks like in use. A page decides what
 * an unmarked image gets, which is the layout it had before anybody marked anything.
 */
export function galleryOption(value: GalleryValue, id: string): string {
  if (!value || typeof value === 'string' || !value.options || !id) return ''
  const choice = value.options[id]
  return typeof choice === 'string' ? choice : ''
}

/**
 * Put a list of things into the order a gallery field names.
 *
 * **The stored order is a preference, never a filter**, and the two rules that follow from it are
 * the whole of the reconciliation:
 *
 *   - **Ids the list no longer holds fall out.** The image was deleted, or refiled elsewhere; a
 *     gallery is not the place to discover that.
 *   - **Items the order does not mention are appended**, in the order they came in. They were
 *     uploaded after the arranging was done, and a gallery that silently omitted every photograph
 *     added since somebody last touched the page would be worse than one in the wrong order —
 *     wrong in a way nobody notices.
 *
 * Generic in what it is arranging, because the two callers do not arrange the same thing: the SDK
 * has `Asset`s and a site has whatever shape it turned them into. `identify` says which key on an
 * item is the asset id; it defaults to `id`, which is what both of those happen to call it.
 *
 * Returns the list unchanged — the same array, not a copy — when there is no order to apply, so a
 * page that nobody has arranged pays nothing for the call.
 */
export function galleryOrder<T>(
  value: GalleryValue,
  items: readonly T[],
  identify: (item: T) => string = item => String((item as { id?: unknown })?.id ?? ''),
): T[] {
  const order = galleryOrderIds(value)
  const spec = value && typeof value !== 'string' ? value : undefined
  const method = spec?.sort === 'newest' ? 'date' : spec?.sort ?? (order.length ? 'manual' : 'uploaded')
  const direction = spec?.sort === 'newest' ? 'desc' : spec?.direction ?? 'asc'
  if (method === 'uploaded') return direction === 'desc' ? [...items].reverse() : items as T[]
  if (method === 'date') {
    return [...items].sort((a, b) => {
      const stamp = (item: T) => Number((item as { uploaded_at?: unknown })?.uploaded_at) || 0
      return (stamp(a) - stamp(b)) * (direction === 'desc' ? -1 : 1)
    })
  }
  if (method === 'name') {
    const sorted = [...items].sort((a, b) => {
      const name = (item: T) => String((item as { filename?: unknown })?.filename ?? '').toLocaleLowerCase()
      return name(a).localeCompare(name(b)) * (direction === 'desc' ? -1 : 1)
    })
    return sorted
  }
  if (!order.length) return direction === 'desc' ? [...items].reverse() : items as T[]

  const byId = new Map<string, T>()
  for (const item of items) {
    const id = identify(item)
    // First wins: an id appearing twice is a library that has answered twice, and the order names
    // each id once. Letting the later one win would silently drop the earlier item entirely.
    if (id && !byId.has(id)) byId.set(id, item)
  }

  const named = order.map(id => byId.get(id)).filter((item): item is T => item !== undefined)
  const mentioned = new Set(named.map(identify))

  const arranged = [...named, ...items.filter(item => !mentioned.has(identify(item)))]
  return direction === 'desc' ? arranged.reverse() : arranged
}

/* ----------------------------------------------------------------------------------- previewing */

/**
 * The photographs a gallery names, resolved from what the *editor* posted rather than from disk.
 *
 * This is the other half of the reconciliation above, and it is the half that was missing. The
 * order travels in the value, so `galleryOrder()` could always arrange the pictures a preview
 * target was already holding — but the **folder** is a name, and turning a name into photographs is
 * a read of the media index. So the moment somebody *changed* the folder, or picked one for the
 * first time, a target had nothing to arrange: it was still holding the last saved folder's
 * pictures, and the preview only caught up at the next save and deploy.
 *
 * The editor knows the answer — it has the whole library open in the picker that made the pick — so
 * it now posts it: `PREVIEW_ASSETS` carries a `folders` map of folder path to the ids filed in it,
 * in the library's own stored order, alongside the asset descriptors themselves. Which makes this
 * function the browser twin of `gallery()` in the SDK's server half: same value, same ordering rule,
 * a posted map instead of a disk read.
 *
 * ## Why `null` rather than an empty list
 *
 * `null` means *the editor has not told us about this folder* — no preview session, an older editor,
 * or a payload that has not arrived yet — and the only correct response to it is for the page to go
 * on showing whatever it resolved on the server. An empty array means the editor did tell us and the
 * folder is empty, which a page should render as an empty gallery. Collapsing the two would make
 * every non-preview render of a gallery blank, which is a far worse failure than a preview that
 * lags.
 */
export function previewGalleryIds(
  value: GalleryValue,
  folders: Readonly<Record<string, readonly string[]>> | null | undefined,
): string[] | null {
  const folder = galleryFolder(value)
  // An unset field is an empty gallery and not an unknown one — the same answer `gallery()` gives,
  // and it needs no map to be right about it.
  if (!folder) return []
  const filed = folders?.[folder]
  if (!filed) return null

  const known = filed.filter((id): id is string => typeof id === 'string' && !!id)
  return galleryOrder(value, known, id => id)
}

/**
 * The same, as whatever the editor's asset descriptors are — the call a preview island makes.
 *
 * Generic in the descriptor so this module stays free of the payload's shape: the map is keyed by
 * asset id, which is the only thing the reconciliation needs to know about it. An id the map has no
 * entry for falls out rather than rendering a hole; that is a picture the editor listed and did not
 * describe, which it does for anything a preview grant cannot reach.
 */
export function previewGallery<T>(
  value: GalleryValue,
  assets: Readonly<Record<string, T>> | null | undefined,
  folders: Readonly<Record<string, readonly string[]>> | null | undefined,
): T[] | null {
  const ids = previewGalleryIds(value, folders)
  if (!ids) return null
  return ids
    .map(id => assets?.[id])
    .filter((asset): asset is T => asset !== undefined && asset !== null)
}
