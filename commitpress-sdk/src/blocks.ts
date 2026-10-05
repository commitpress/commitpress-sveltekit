/**
 * Rows an editor has switched off, and reading a block out of a multiblock.
 *
 * The CMS can switch one row off without deleting it: the content stays in the file and is not
 * meant for the site — the same decision as unpublishing a page, one level down. It is stored two
 * ways, because the two shapes it applies to are not the same shape.
 *
 * **A block** is a one-key object naming which variant it is, so there is a name to change:
 *
 * ```json
 * [{ "hero": { … } }, { "$off:plans": { … } }]
 * ```
 *
 * Which means **a site that does nothing already does the right thing**. Every renderer of a
 * multiblock looks each key up in a table of components, so a block that is off finds no component
 * and draws nothing — on sites built before this existed, with no upgrade of this package and no
 * code change. Nothing below is needed to hide one.
 *
 * **An item of a repeating group** has no name to change. It is a bare object of that group's
 * fields in an array of its siblings, so it is marked from the inside:
 *
 * ```json
 * "cards": [{ "title": "Basic" }, { "title": "Old", "$off": true }]
 * ```
 *
 * Nothing can hide a row like that from a loop that renders every element of an array — so a site
 * would have had to filter every one of its own loops, and until it did, the switch was a control
 * that silently did nothing to the page. It was the one half of the feature that was not free at
 * the far end, and "free at the far end" is the whole reason the block spelling is what it is.
 *
 * So **`query` and `queryList` drop them on the way out** (see `liveContent`, applied there). What a
 * site reads is what it should render, in every loop it already has, with no upgrade of its own
 * code. `liveItems` below is still exported for content that did not come through a read — values
 * posted into a preview frame, say — and `{ includeOff: true }` gets the unfiltered file back for a
 * caller that wants to draw the parked rows.
 *
 * Off *blocks* are left in place by that filter, deliberately: they already draw nothing, and
 * dropping them would renumber the siblings after them — which is what `data-commitpress-section`
 * paths are built from, so a preview's click-to-edit would start opening the wrong section.
 *
 * ```ts
 * import { liveItems, blockEntry } from '@commitpress/sdk/blocks'
 *
 * for (const card of liveItems(cardsFromSomewhereElse)) { … }
 *
 * for (const block of page.content.sections) {
 *   const found = blockEntry(block)
 *   // `found.off` is the override a preview build wants — the same shape of decision
 *   // `includeDrafts` is. A preview that hides what was switched off cannot show what
 *   // turning it back on would look like.
 *   if (!found || (found.off && !preview)) continue
 *   render(components[found.name], found.value)
 * }
 * ```
 */

/**
 * What a block's key is prefixed with while it is off.
 *
 * `$` and `:` are not legal in a block name — every name in a schema document matches `^[a-z_]+$` —
 * so no schema can ever declare a block this collides with.
 */
export const OFF_BLOCK_PREFIX = '$off:'

/** The key an item of a repeating group carries while it is off. Not a field, for the same reason. */
export const OFF_MARKER = '$off'

/** One block, read. */
export interface BlockEntry<T = unknown> {
  /** The variant's name as the schema declares it, with no prefix on it either way. */
  name: string
  /** Its content, which is the same whether the block is on or off. */
  value: T
  /** Whether an editor has switched it off. */
  off: boolean
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * Read a block, or `undefined` for something that is not one.
 *
 * `undefined` rather than a throw: this walks content out of a repository this package does not
 * control, and one malformed item in a list is a section to skip rather than a reason to fail a
 * whole build.
 */
export function blockEntry<T = unknown>(block: unknown): BlockEntry<T> | undefined {
  if (!isPlainObject(block)) return undefined

  const [key] = Object.keys(block)
  if (!key) return undefined

  const off = key.startsWith(OFF_BLOCK_PREFIX)

  return {
    name: off ? key.slice(OFF_BLOCK_PREFIX.length) : key,
    value: block[key] as T,
    off,
  }
}

/** Whether a value is an item of a repeating group that has been switched off. */
const isItemOff = (item: unknown): boolean =>
  isPlainObject(item) && item[OFF_MARKER] === true

/** Whether this block or repeating-group item has been switched off. */
export function isOff(item: unknown): boolean {
  if (!isPlainObject(item)) return false
  if (item[OFF_MARKER] === true) return true
  return Object.keys(item).some(key => key.startsWith(OFF_BLOCK_PREFIX))
}

/**
 * A list with the rows switched off dropped — blocks, group items, or a mixture.
 *
 * The element type is kept, because what comes back is a subset of what went in: every element is
 * one of the values that was already there.
 */
export const liveItems = <T>(items: readonly T[]): T[] => items.filter(item => !isOff(item))

/**
 * A whole content value with the switched-off repeating-group items dropped, at any depth.
 *
 * This is what makes the group half of the feature free at the far end: `query` and `queryList` run
 * it over every file they return, so a site's `{#each block.items as item}` renders what an editor
 * left switched on without knowing any of this exists.
 *
 * Only the `$off` marker is acted on. An off *block* is a renamed key that already resolves to no
 * component, and removing it from its array would renumber every sibling after it — see the note at
 * the top of this file.
 *
 * The walk is structural and needs no schema, because the marker is inside the row it is about: any
 * array element carrying `$off` is a row somebody parked, wherever in the tree it turns up. Objects
 * are rebuilt rather than mutated — the value belongs to the caller, and a read that quietly edited
 * the object it handed back would be a surprise the type does not admit to.
 */
export function liveContent<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.filter(item => !isItemOff(item)).map(item => liveContent(item)) as unknown as T
  }

  if (!isPlainObject(value)) return value

  const out: Record<string, unknown> = {}
  for (const [key, inner] of Object.entries(value)) out[key] = liveContent(inner)
  return out as T
}
