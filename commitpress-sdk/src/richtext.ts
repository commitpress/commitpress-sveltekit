/**
 * Rendering a richtext field.
 *
 * A richtext value is a document, not an HTML string — a ProseMirror tree stored as JSON, which is
 * what lets the CMS validate prose against a schema instead of committing whatever the editor
 * posted. See `docs/richtext-and-embedded-blocks.md` in the CMS repository for why.
 *
 * The consequence for a site is that the value cannot go straight into `{@html}` any more, so this
 * module ships in the same release as the type that stops being `string`:
 *
 * ```ts
 * import { richtext, richtextText } from '@commitpress/sdk-node/richtext'
 *
 * const body = richtext(page.content.body)
 * const description = richtextText(page.content.body).slice(0, 155)
 * ```
 *
 * ## Why the renderer is here rather than imported from the CMS
 *
 * The CMS owns the format: which nodes and marks a stored document may contain is declared in its
 * `richtext-doc.ts` and enforced on save, so a document reaching a site has already been held to
 * that list. What a site needs is the other half — the same tree walked into HTML — and this
 * package ships to sites on its own cadence, from its own repository. So the walk is written here,
 * and `check:richtext` in the CMS asserts the two agree node for node: prose that renders one way
 * in the editor and another on the page is worth a test rather than a shared import across a
 * submodule boundary.
 *
 * ## No DOM
 *
 * A pure tree walk, for the same reason the CMS's is: ProseMirror's own serialiser needs a
 * `document`, sites render on the server, and neither of us is adding jsdom for a `<p>`.
 *
 * The one import is `blocks.js`, which is itself dependency-free. An embedded block is stored as a
 * multiblock row, off blocks included — so the module that already knows how to read one is the
 * module that reads one here, rather than a second copy of `$off:` in a second file that can come
 * to disagree with the first.
 */
import { blockEntry } from './blocks.js'

/** A mark on a run of text — `bold`, `italic`, and the rest of what the field offered. */
export interface RichtextMark {
  type: string
  attrs?: Record<string, unknown>
}

/**
 * One node of the document.
 *
 * Loose on purpose: every consumer switches on `type`, and what a document is actually held to is
 * the CMS's validation on save rather than a discriminated union restated in a second place.
 */
export interface RichtextNode {
  type: string
  attrs?: Record<string, unknown>
  content?: RichtextNode[]
  marks?: RichtextMark[]
  text?: string
}

/**
 * A row embedded between two paragraphs, keyed by the control it is.
 *
 * Exactly a multiblock row, because that is what it is stored as: `{ figure: { image: '…' } }`.
 */
export type RichtextBlocks = Record<string, unknown>

/**
 * The stored value of a richtext field.
 *
 * `Blocks` names what the field's schema declares it may embed, and typegen fills it in — a field
 * declaring `figure` and `pullquote` is a `RichtextDoc<{ figure: FigureBlock; pullquote: … }>`. That
 * is what makes `richtext()`'s `blocks` argument checkable: a renderer missing for a control the
 * schema offers is a compile error, and one written for a control the schema stopped offering is
 * another. A document with no parameter — one read by hand, or from a field declaring no controls —
 * accepts any renderer map and requires none.
 *
 * `_blocks` is never present in a stored file and nothing reads it. TypeScript needs the parameter
 * to appear somewhere in the shape to infer it at a call site, and an optional property that no
 * document carries is the cheapest place to put it: it changes no runtime value and refuses no
 * document, because every field on it is optional.
 */
export interface RichtextDoc<Blocks extends RichtextBlocks = Record<string, any>> {
  type: 'doc'
  content?: RichtextNode[]
  readonly _blocks?: Blocks
}

/**
 * Whether a value is a richtext document.
 *
 * Worth having because the value comes out of a JSON file this package does not control, and
 * because a site being upgraded reads content written both ways for as long as the migration takes:
 * `isRichtextDoc(value) ? richtext(value) : value` is the one-line bridge.
 */
export function isRichtextDoc(value: unknown): value is RichtextDoc {
  return typeof value === 'object' && value !== null && (value as RichtextDoc).type === 'doc'
}

/**
 * Whether the document says nothing.
 *
 * A site cannot ask this with `{#if page.body}`, because an empty document is an object and every
 * object is truthy — so the empty editor renders `<p></p>` and the section around it draws its
 * heading and its padding for content nobody wrote. An empty document is one paragraph holding
 * nothing, which is what the editor normalises to, and a few of those is what pressing enter twice
 * and walking away produces.
 */
export function richtextIsEmpty(doc: unknown): boolean {
  if (!isRichtextDoc(doc)) return true
  return !(doc.content ?? []).some(saysSomething)
}

function saysSomething(node: RichtextNode): boolean {
  if (node.type === 'text') return (node.text ?? '').trim().length > 0
  if (node.type === 'paragraph') return (node.content ?? []).some(saysSomething)
  // Everything else is something by existing: a rule between two empty paragraphs is a document
  // that says something, and so is a block holding a picture and no words.
  return true
}

const BLOCK_LEVEL = new Set([
  'paragraph',
  'heading',
  'blockquote',
  'bulletList',
  'orderedList',
  'codeBlock',
  'horizontalRule',
  'embed',
])

/**
 * The prose as plain text.
 *
 * For a meta description, an excerpt, a search index — anywhere the words are wanted and the markup
 * is not. Paragraphs are separated by a blank line and list items by a single one, because a
 * five-item list read as five paragraphs is most of an excerpt spent on one list.
 */
export function richtextText(doc: unknown): string {
  if (!isRichtextDoc(doc)) return ''
  const parts: string[] = []

  /** `tight` while inside a list item, whose wrapping paragraph is punctuation rather than prose. */
  const walk = (nodes: RichtextNode[] | undefined, tight = false): void => {
    for (const node of nodes ?? []) {
      if (node.type === 'text') parts.push(node.text ?? '')
      else if (node.type === 'hardBreak') parts.push('\n')
      else if (node.type === 'listItem') {
        walk(node.content, true)
        parts.push('\n')
      } else {
        walk(node.content)
        if (tight) continue
        if (BLOCK_LEVEL.has(node.type)) parts.push('\n\n')
      }
    }
  }

  walk(doc.content)
  return parts.join('').replace(/\n{3,}/g, '\n\n').trim()
}

/**
 * Escaped for a text position and for an attribute value alike.
 *
 * One function rather than two, quoting more than a text position strictly needs, because the
 * alternative is a decision at every call site about which one this is, and an injection when that
 * decision goes wrong.
 */
const escape = (text: string): string =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

const MARK_TAGS: Record<string, string> = {
  bold: 'strong',
  italic: 'em',
  strike: 's',
  underline: 'u',
  code: 'code',
}

/**
 * How a mark becomes a tag.
 *
 * `link` is the only one with an attribute behind it. Recheck the scheme because content can be
 * imported or edited outside the CMS. `rel` is written for `_blank` and only for
 * `_blank`, because that is the target where omitting it hands the opener away.
 */
function wrapMark(mark: RichtextMark, inner: string): string {
  if (mark.type === 'link') {
    const href = String(mark.attrs?.href ?? '').trim()
    const relative = href.startsWith('#') || href.startsWith('/') ||
      href.startsWith('./') || href.startsWith('../')
    if (!href || /[\u0000-\u001f\u007f]/.test(href) || href.startsWith('//') ||
        (!relative && !/^(https?:\/\/|mailto:|tel:)/i.test(href))) return inner
    const target = mark.attrs?.target === '_blank' ? ' target="_blank" rel="noopener noreferrer"' : ''
    return `<a href="${escape(href)}"${target}>${inner}</a>`
  }
  const tag = MARK_TAGS[mark.type]
  return tag ? `<${tag}>${inner}</${tag}>` : inner
}

/**
 * How each kind of embedded block is drawn.
 *
 * One renderer per control the field declares, keyed by the control's name. The row it is handed is
 * the stored value of that control — an `imageField`'s asset id, a group's object — so `picture()`,
 * `gallery()` and the rest of this package take it as it stands.
 */
export type RichtextBlockRenderers<Blocks extends RichtextBlocks> = {
  [Name in keyof Blocks]: (row: Blocks[Name], name: Name) => string
}

export interface RichtextRenderOptions<Blocks extends RichtextBlocks> {
  blocks: RichtextBlockRenderers<Blocks>
}

/**
 * Render a document to HTML.
 *
 * The output is the markup the editor showed the person who wrote it: semantic tags, no classes and
 * no wrapper, so a site styles it with its own rules on its own container.
 *
 * ```svelte
 * <div class="prose">{@html richtext(page.content.body)}</div>
 * ```
 *
 * Text is escaped on the way out — a document holds text, never markup — so nothing an author can
 * type reaches the page as HTML. A node outside the set renders as nothing rather than throwing:
 * this is a renderer, and a page missing a paragraph beats a page that is a stack trace.
 *
 * ## Embedded blocks
 *
 * A field may declare `controls`, and a document may then hold those fields between its paragraphs.
 * Say how to draw each one:
 *
 * ```ts
 * richtext(page.content.body, {
 *   blocks: {
 *     figure: row => `<figure>${picture(row.image)}<figcaption>${row.caption}</figcaption></figure>`,
 *   },
 * })
 * ```
 *
 * Two rules, and they point in opposite directions on purpose:
 *
 * - **Called with no `blocks` at all, blocks render as nothing.** That is the right answer for an
 *   excerpt, a meta description, a search index — the callers that want the words and not the
 *   furniture — and `richtextText` is the same reading of the same document.
 * - **Called with `blocks`, a block with no renderer in it throws.** A site that has opted into
 *   drawing blocks and left one out has a bug, and an empty gap where a photograph should be is a
 *   bug found by a reader rather than by a build. The same argument `blocks.ts` makes about drafts.
 *
 * The type is what should catch it first: typegen writes the declared controls into the document's
 * own type, so a missing renderer is a compile error before it is ever a thrown one. The throw is
 * for the untyped call — a document read by hand, a `JSON.parse` — where there was no type to check.
 *
 * A block an editor has **switched off** renders as nothing and never reaches a renderer, which is
 * the same thing `liveContent` does for the rows of a multiblock.
 */
export function richtext<Blocks extends RichtextBlocks>(
  doc: RichtextDoc<Blocks> | null | undefined,
  options: RichtextRenderOptions<Blocks>,
): string
// The fallback, and the reason the throw above exists: a document with no type on it — read by
// hand, `JSON.parse`d, arrived over an API — has no declared controls to check a renderer map
// against, so it is checked at render time instead.
export function richtext(doc: unknown, options?: RichtextRenderOptions<any>): string
export function richtext(doc: unknown, options?: RichtextRenderOptions<any>): string {
  if (!isRichtextDoc(doc)) return ''
  return renderContent(doc.content, options)
}

const renderContent = (
  nodes: RichtextNode[] | undefined,
  options?: RichtextRenderOptions<any>,
): string => (nodes ?? []).map(node => renderNode(node, options)).join('')

function renderNode(node: RichtextNode, options?: RichtextRenderOptions<any>): string {
  switch (node.type) {
    case 'text': {
      // Marks apply outermost-first in array order, which is the order they are stored in and
      // therefore the order that round-trips.
      let out = escape(node.text ?? '')
      for (const mark of [...(node.marks ?? [])].reverse()) out = wrapMark(mark, out)
      return out
    }

    case 'hardBreak':
      return '<br>'

    case 'horizontalRule':
      return '<hr>'

    case 'paragraph':
      return `<p>${renderContent(node.content, options)}</p>`

    case 'heading': {
      const level = Number(node.attrs?.level) || 1
      return `<h${level}>${renderContent(node.content, options)}</h${level}>`
    }

    case 'blockquote':
      return `<blockquote>${renderContent(node.content, options)}</blockquote>`

    case 'bulletList':
      return `<ul>${renderContent(node.content, options)}</ul>`

    case 'orderedList': {
      const start = Number(node.attrs?.start) || 1
      return `<ol${start === 1 ? '' : ` start="${start}"`}>${renderContent(node.content, options)}</ol>`
    }

    case 'listItem':
      return `<li>${renderContent(node.content, options)}</li>`

    case 'codeBlock': {
      const language = node.attrs?.language
      const attr =
        typeof language === 'string' && language ? ` class="language-${escape(language)}"` : ''
      // A code block's children are text and its marks mean nothing inside one, so it renders its
      // text rather than its content: `**bold**` in a code sample is four characters.
      const text = (node.content ?? []).map(child => escape(child.text ?? '')).join('')
      return `<pre><code${attr}>${text}</code></pre>`
    }

    /**
     * A schema-declared field embedded in the prose — a figure, a pull quote, a callout.
     *
     * `attrs.row` is a multiblock row and is read as one, so a block an editor switched off is a
     * renamed key that draws nothing, with no upgrade and no change on the site's side.
     */
    case 'embed': {
      if (!options) return ''
      const entry = blockEntry(node.attrs?.row)
      if (!entry || entry.off) return ''
      const render = options.blocks[entry.name]
      if (!render) {
        throw new Error(
          `richtext(): no renderer for the embedded block "${entry.name}". Add one to \`blocks\`, or call richtext() without \`blocks\` to render the prose alone.`,
        )
      }
      return render(entry.value, entry.name)
    }

    default:
      return ''
  }
}
