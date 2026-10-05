/**
 * Reading what an `image` field holds — without touching a disk.
 *
 * ## Why this is its own entry point
 *
 * These exports lived in `assets.ts` until now, and `assets.ts` opens with `import fs from
 * 'fs/promises'`. That is correct for the rest of it — resolving an asset means reading the
 * catalogue — and fatal for these: the value shape is what a *component* has to read, and a
 * component runs in a browser as well as on a server. A site importing `imageId` from the root
 * entry drags `node:fs` into its client bundle, so the first thing every site did instead was
 * hand-roll `typeof v === 'string' ? v : v?.src` — a second spelling of the shape, in a codebase
 * whose whole argument for storing pins beside the ids is that there should only be one.
 *
 * So it is `@commitpress/sdk/image`, on exactly the grounds `./preview` is a separate entry: this
 * module imports nothing at all, which is what makes it safe to bundle anywhere. The root entry
 * still re-exports every name here, so nothing that already imports them has to move.
 *
 * ## The shape
 *
 * A bare asset id is every image field ever written, and still what a field offering neither
 * alternates nor pinned renditions stores:
 *
 * ```json
 * "hero": "1785755463222"
 * ```
 *
 * The object appears only once an editor has actually used one of those features — an alternate
 * picture for a slot the schema declared, or a rendition pinned for a slot:
 *
 * ```json
 * "hero": { "src": "1785755463222", "mobile": "1785755821617" }
 * "hero": { "src": "1785755463222", "renditions": { "src": "card" } }
 * "hero": { "src": "1785755463222", "alt": { "src": "Anna on the jetty, from the west" } }
 * ```
 *
 * `alt` is an **override** of the asset's own description and only appears where a schema turned it
 * on and somebody wrote one — the library is where alt text lives. See `imageAlt`.
 *
 * **The ids stay ids in both shapes**, and that is the property everything else rests on: a reader
 * that resolves an image field by matching an id — a manifest collector walking a page's content,
 * say — keeps finding the asset whether or not anybody has pinned anything. `imageId` is the
 * convenience, not the requirement.
 */

/** The key the default picture is stored under, and the one `renditions` and `alt` key it by. */
const DEFAULT_SLOT = 'src'

/** The two keys beside the ids that are not pictures. */
const RENDITIONS_KEY = 'renditions'
const ALT_KEY = 'alt'

/**
 * What an `image` field holds, in the object shape.
 *
 * See the note above for when this is written and when a bare string is. Both are current; a field
 * is not migrated from one to the other.
 */
export interface ImageObject {
  /** The default picture's asset id. */
  src?: string
  /**
   * Which rendition each slot is pinned to, `src` for the default — present only on a field whose
   * schema offers it and only where somebody has chosen one.
   */
  renditions?: Record<string, string | undefined>
  /**
   * What each slot is described as *here*, `src` for the default — present only on a field whose
   * schema offers it and only where somebody wrote one.
   *
   * An override of the asset's own `alt`, never the storage for it. See `imageAlt`.
   */
  alt?: string | Record<string, string | undefined>
  /** One asset id per alternate slot the schema declared. */
  [slot: string]: string | Record<string, string | undefined> | undefined
}

export type ImageValue = string | ImageObject | null | undefined

/**
 * A slot's asset id, or `''` — never the `renditions` or `alt` entries, which are not pictures.
 *
 * `alt` is excluded by name rather than by type, because it is the one reserved key that may
 * legitimately hold a *string*: a hand-written content file is allowed to say
 * `"alt": "Anna on the jetty"`, and without this line that sentence would be read as an asset id.
 */
function slotId(value: ImageObject, slot: string): string {
  if (slot === ALT_KEY || slot === RENDITIONS_KEY) return ''
  const held = value[slot]
  return typeof held === 'string' ? held.trim() : ''
}

/**
 * The asset id an image field names, for a slot or for the default.
 *
 * Falling back to the default is the whole semantics of a slot: an alternate that was not filled in
 * means "the default is fine here", never "show nothing here". A site keying straight into
 * `value.mobile` gets `undefined` and renders a hole; this never does.
 *
 * What it answers is an **asset id and nothing else**, whatever else the value carries — which is
 * why a pinned rendition is stored beside the ids rather than on them. Anything that resolves an
 * image field by matching an id keeps working when somebody pins one, including the many readers
 * that never call this function at all.
 */
export function imageId(value: ImageValue, slot?: string): string {
  if (!value) return ''
  if (typeof value === 'string') return value.trim()

  if (slot && slot !== DEFAULT_SLOT) {
    const alternate = slotId(value, slot)
    if (alternate) return alternate
  }

  return slotId(value, DEFAULT_SLOT)
}

/**
 * The rendition an image field pins for a slot or for the default, or `''` for none.
 *
 * `''` is the common answer and means *the site decides* — most pictures are never pinned, and a
 * site's own preference (`pickVariant(item, 'wide', 'card')`) is the right default for those. Pass
 * this in front of that preference and the two compose: the editor's pick wins where there is one.
 *
 * ```ts
 * const item = await asset(imageId(page.hero))
 * const file = pickVariant(item, imageRendition(page.hero), 'wide', 'card')
 * ```
 *
 * It answers for **the picture that slot actually shows**, which is the only reading that stays
 * consistent with `imageId`. A slot nobody filled in shows the default, so it answers the default's
 * pin — the two describe one reference, and splitting them would put a phone-sized rendition under a
 * laptop-sized picture. A slot with a picture of its own and no pin is unpinned: inheriting a size
 * chosen for a *different* photograph is a guess rather than a decision.
 */
export function imageRendition(value: ImageValue, slot?: string): string {
  if (!value || typeof value === 'string') return ''

  const pinned = value.renditions
  if (!pinned || typeof pinned !== 'object') return ''

  const key = slot && slot !== DEFAULT_SLOT && slotId(value, slot) ? slot : DEFAULT_SLOT
  const name = pinned[key]

  return typeof name === 'string' ? name.trim() : ''
}

/**
 * What a slot is described as *in this field*, or `''` when nothing was written here.
 *
 * `''` is the common answer and means **use the asset's own `alt`**, which is where alt text lives:
 * one photograph, one description, written in the media library and improved for every page at once.
 * Only a field whose schema turns the override on can hold anything else, and only where an editor
 * looking at this page decided the library's sentence did not describe what this placement shows —
 * a pinned `thumb` is often a different crop, and an alternate is a different photograph.
 *
 * ```ts
 * const item = await asset(imageId(page.hero))
 * const alt = imageAlt(page.hero) || item.alt
 * ```
 *
 * `picture()` does exactly that for you and hands back assets already carrying the right sentence,
 * so a template rendering `hero.img.alt` needs to know none of this.
 *
 * It resolves per slot the way `imageRendition` does, and for the same reason: a slot with no
 * picture of its own shows the default, so it is described by the default's override. A slot with
 * its own picture and no override of its own is not described by the default's — that sentence is
 * about a different photograph, and inheriting it would be worse than the asset's own.
 */
export function imageAlt(value: ImageValue, slot?: string): string {
  if (!value || typeof value === 'string') return ''

  const described = value.alt
  if (!described) return ''

  const key = slot && slot !== DEFAULT_SLOT && slotId(value, slot) ? slot : DEFAULT_SLOT

  // A bare string describes the default picture. Nothing the editor writes takes that shape, but a
  // hand-written content file may, and reading it is a line.
  if (typeof described === 'string') {
    return key === DEFAULT_SLOT ? described.trim() : ''
  }

  const said = described[key]
  return typeof said === 'string' ? said.trim() : ''
}
