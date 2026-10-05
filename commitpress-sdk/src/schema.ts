/**
 * The schema language, as the SDK reads it.
 *
 * These types were declared inside `generate.ts` and describe the same documents `v1.json` does —
 * structurally, and loosely: the generator only ever asks a control what type it produces, so it
 * carries the keys that answer that question and ignores the rest. The editor's zod union
 * (`$app/types/zod/schema-typed`) is the strict reading; this is the reader's one.
 *
 * They are here rather than in `generate.ts` because `static-fields.ts` needs them too, and pulling
 * them out of a module that imports `fs` is what keeps the static-field declaration a pure value
 * anything can import.
 */

export interface BaseControl {
  uuid: string
  type: string
  name: string
  label: string
  required: boolean
  visibleWhen?: FieldCondition | {
    match: 'all' | 'any'
    conditions: FieldCondition[]
  }
}

export interface FieldCondition {
    field: string
    operator: 'equals' | 'not_equals'
    value: string | number | boolean | Array<string | number | boolean>
}

export interface InputControl extends BaseControl {
  type: 'input'
  valueType: 'string' | 'int' | 'float' | 'number'
  min?: number
  max?: number
  step?: number
  minLength?: number
  maxLength?: number
  localized?: boolean
}

export interface TextareaControl extends BaseControl {
  type: 'textarea'
  minLength?: number
  maxLength?: number
  localized?: boolean
}

export interface RichtextControl extends BaseControl {
  type: 'richtext'
  localized?: boolean
  /**
   * The fields that may be embedded between this field's paragraphs, declared exactly as
   * `MultiblockControl` declares them — because an embedded block *is* a multiblock row, stored as
   * one. Optional, and absent on every richtext field written before schema v10.
   */
  controls?: Control[]
}

export interface BooleanControl extends Omit<BaseControl, 'required'> {
  type: 'boolean'
  localized?: boolean
  /**
   * Declared optional rather than inherited: a checkbox is always either ticked or not, so the
   * schema language does not offer `required` on one — see `isRequired` in `content-parser.ts`.
   */
  required?: never
}

export interface ImageControl extends BaseControl {
  type: 'image'
  multiple: boolean
  /**
   * The alternates this field offers beyond the default picture, if any.
   *
   * A slot name and a label, never a media query — the site owns its own breakpoints. Read by the
   * generator, which turns the names into keys on the emitted type, so a page reading
   * `hero.mobile` is checked against the schema that offered it.
   */
  breakpoints?: { name: string; label: string }[]
  /**
   * Whether an editor may pin which rendition of the asset each picture uses.
   *
   * Read by the generator for the same reason `breakpoints` is: a pinned rendition makes the stored
   * value an object, so the emitted type has to say so — and only for the fields that offer it,
   * which is the whole point of it being declared.
   */
  renditions?: boolean
  /**
   * Whether an editor may describe this placement of the picture, overriding the asset's own alt
   * text — for the fields where a pinned crop or an alternate shows something the library's one
   * sentence about the photograph does not cover.
   *
   * Read by the generator on the same grounds as the two above: an override makes the stored value
   * an object, so the emitted type has to say so, and only for the fields that offer it.
   */
  alt?: boolean
  localized?: boolean
}

/**
 * A media-library folder path — the field a gallery is addressed by.
 *
 * The reader carries none of the picker's settings: `rootFolder` says which folders an *author* may
 * choose between, and the value that reaches a site is a finished path either way.
 */
export interface GalleryControl extends BaseControl {
  type: 'gallery'
  localized?: boolean
  /**
   * The literals an editor may mark each image with — `landscape`/`portrait` and the like.
   *
   * Read by the generator for the reason `imageField`'s three keys are: declaring them changes the
   * stored value, which grows an `options` map, and the emitted type has to say so — as the literal
   * union rather than `string`, since a site switches on these words.
   */
  options?: Array<{ label: string; value: string }>
}

export interface LinkControl extends BaseControl {
  type: 'link'
  valueType: 'internal' | 'external' | 'data' | 'any'
  localized?: boolean
}

export interface SelectControl extends BaseControl {
  type: 'select'
  options: Array<{ label: string; value: string }>
  multiple?: boolean
  min?: number
  max?: number
  defaultValue?: string | string[]
  localized?: boolean
}

export interface GroupControl extends BaseControl {
  type: 'group'
  multiple: boolean
  controls: Control[]
}

export interface MultiblockControl extends BaseControl {
  type: 'multiblock'
  controls: Control[]
}

export interface CollectionControl extends BaseControl {
  type: 'collection'
  collections: string
  localized?: boolean
}

/**
 * The nine positions an orientation field can hold, in reading order.
 *
 * The same list the editor's control draws and the save path validates against; the order matters
 * because a generated union is filtered through it rather than through whatever order a schema
 * happens to name its positions in.
 */
export const ORIENTATION_POSITIONS = ['tl', 'tc', 'tr', 'ml', 'mc', 'mr', 'bl', 'bc', 'br'] as const

export type OrientationPosition = (typeof ORIENTATION_POSITIONS)[number]

export interface OrientationControl extends BaseControl {
  type: 'orientation'
  /**
   * Which of the nine grid positions the field offers. Empty — or absent, which every orientation
   * field written before the schema builder grew its picker is — means all nine, which is the same
   * reading the editor's own control gives it.
   */
  selectedPositions?: OrientationPosition[]
  localized?: boolean
}

export interface NavigationControl extends BaseControl {
  type: 'navigation'
  maxDepth: number
  valueType: 'internal' | 'external' | 'any'
  localized?: boolean
}

export interface DatetimeControl extends BaseControl {
  type: 'datetime'
  mode: 'date' | 'time' | 'datetime'
  min?: string
  max?: string
  defaultValue?: string
  defaultRelative?: {
    amount: number
    unit: 'minutes' | 'hours' | 'days' | 'weeks' | 'months' | 'years'
  }
  localized?: boolean
}

export interface FileControl extends BaseControl {
  type: 'file'
  accept: string[]
  multiple: boolean
  min: number
  max: number
  localized?: boolean
}

export type Control =
  | InputControl
  | TextareaControl
  | RichtextControl
  | BooleanControl
  | ImageControl
  | GalleryControl
  | LinkControl
  | SelectControl
  | GroupControl
  | MultiblockControl
  | CollectionControl
  | OrientationControl
  | NavigationControl
  | DatetimeControl
  | FileControl
