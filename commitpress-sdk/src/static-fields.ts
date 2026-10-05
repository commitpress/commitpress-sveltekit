/**
 * Static fields: the controls commitpress declares itself and merges into every schema of a kind.
 *
 * Some fields are not the schema author's to decide. Every page has a `<title>`, a meta description
 * and an answer to whether crawlers should index it — that is true of the first page of the first
 * repository and of every page after it, so making each author add an `seo` group by hand means
 * every repository has a slightly different one, half of them are missing it, and nothing that
 * *reads* content can rely on it being there. `components/head.svelte` has rendered these tags since
 * the beginning; what was missing was anything putting the fields in front of an editor.
 *
 * ## They are merged, never written
 *
 * Nothing here is ever committed into anyone's schema file. The declaration is applied on read, so
 * changing it changes every page in every repository at once, an author cannot delete a field
 * commitpress needs, and adding one does not mean a mass commit across repositories we may not even
 * have write access to. It is the same rule `content/migrations.ts` follows: upcast in memory, and
 * let the file be rewritten only when someone was saving it anyway.
 *
 * ## Why this lives in the SDK
 *
 * There are two readers of a content repository and only one of them is the editor. A site build
 * reads the same files through `@commitpress/sdk`, and `generate.ts` produces its types by reading
 * the schema documents off disk — so a field the editor injects and the generator does not is a
 * field that exists in the content and is missing from the type describing it. One declaration,
 * imported by both. The SDK is where it can live: `commitpress` (the workspace package the app uses)
 * already depends on the SDK, so the SDK is the leaf and the only place with no cycle.
 *
 * ## Collisions
 *
 * A schema that already declares a field of the same name keeps its own. That is not politeness, it
 * is the only safe answer: content is stored under the field's *name*, so replacing an authored
 * `seo` group with this one would re-interpret values somebody else's schema defined — and any
 * subkey the two do not share would be rejected by `parseContent` as undeclared on the next save,
 * which is to say silently dropped. `shadowedStaticFields` reports the overlap so the schema editor
 * can say what happened rather than leaving it to be discovered.
 */
import type { Control } from './schema.js'

/**
 * Prefixes the uuid of every static field.
 *
 * uuids are what `content/drift.ts` uses to tell a renamed field from a deleted one, so a static
 * field needs one that is stable across every repository and every render — a generated uuid would
 * make each load look like a different field. The prefix is also what guarantees it can never
 * collide with the `crypto.randomUUID()` values the schema builder writes.
 */
export const STATIC_FIELD_UUID_PREFIX = 'commitpress:'

/**
 * Typed as `Control` while still carrying the keys the strict schema language requires.
 *
 * The interfaces in `schema.ts` are the *reader's* view — they hold the keys that decide what type a
 * control produces and nothing else — but a static field has to be a complete, valid schema
 * document, because it is merged into one. The index signature is what lets the literal carry
 * `pattern`, `placeholder`, `rows` and the rest without TypeScript rejecting them as excess. What
 * actually proves these documents valid is `check:content`, which runs the whole set through the
 * editor's zod union and the published JSON Schema.
 */
const control = <T extends Control>(declaration: T & Record<string, unknown>): Control =>
  declaration as Control

/**
 * Page metadata.
 *
 * ## What each field is for
 *
 * Two audiences, and they want different things. A **search result** wants `title` and
 * `description` — one line each, written to be scanned. A **link preview** in Slack, iMessage,
 * LinkedIn or a feed wants a picture and often a different sentence, because a shared link is read
 * in a conversation rather than in a list of ten results. So the social three — `social_image`,
 * `social_title`, `social_description` — are *overrides* rather than a second copy: left empty they
 * fall back to the search pair, which is the right answer for most pages and the reason this group
 * is still short for anyone who does not care.
 *
 * `og_type` is the one structural field. `website` describes a page; `article` describes a piece of
 * writing with a date, which is what makes a preview show when it was published.
 *
 * ## The image
 *
 * This used to say a social image field could not exist, because an image control stores an asset
 * *id* and nothing could turn one into the absolute URL `og:image` demands. That is answered now:
 * `assets.ts` resolves an id against the media store's public base — the catalogue is committed in
 * `__commitpress__/media/images/index.json`, so it is one file read at the same root `query` uses,
 * and the alt text and real dimensions come with it. A site whose media is not reachable without a
 * login still cannot use it, which is a property of that site's storage rather than of this field.
 *
 * ## Nothing here is required
 *
 * A static field is added to schemas that already exist, and content written against them already
 * exists too — making one required would refuse to republish every page in every repository until
 * somebody filled it in.
 */
const seo = control({
  uuid: `${STATIC_FIELD_UUID_PREFIX}seo`,
  type: 'group',
  name: 'seo',
  label: 'Page metadata',
  description: 'What this page says about itself to a browser and a crawler.',
  collapsed: true,
  multiple: false,
  required: false,
  presentation: '',
  min: 0,
  max: 0,
  controls: [
    control({
      uuid: `${STATIC_FIELD_UUID_PREFIX}seo.title`,
      type: 'input',
      name: 'title',
      label: 'Browser title',
      description: 'Shown in the tab and as the headline of a search result.',
      required: false,
      pattern: '',
      placeholder: '',
      valueType: 'string',
      localized: true,
    }),
    control({
      uuid: `${STATIC_FIELD_UUID_PREFIX}seo.description`,
      type: 'textarea',
      name: 'description',
      label: 'Meta description',
      description: 'The one-sentence summary a search result shows under the title.',
      required: false,
      rows: 3,
      resize: true,
      placeholder: '',
      localized: true,
    }),
    control({
      uuid: `${STATIC_FIELD_UUID_PREFIX}seo.social_image`,
      type: 'image',
      name: 'social_image',
      label: 'Social image',
      description:
        'The picture shown when this page is shared. Wide images work best — 1200×630 or larger.',
      required: false,
      multiple: false,
      // What may be *uploaded* through this field, matching every other image control commitpress
      // writes. It says nothing about what a scraper is served: the library stores webp — the
      // stored original included — so a card is webp whatever was uploaded. That is fine in every
      // previewer that matters today, and if it ever stops being fine it is one decision in the
      // uploader rather than a per-field accept list nobody would think to revisit.
      accept: ['jpg', 'jpeg', 'png'],
      // The whole library. A social image is usually the page's own hero rather than something
      // filed in a folder set aside for it, and a root folder here would hide it.
      rootFolder: '',
      escapeRootFolder: false,
      renditions: true,
    }),
    control({
      uuid: `${STATIC_FIELD_UUID_PREFIX}seo.social_title`,
      type: 'input',
      name: 'social_title',
      label: 'Social title',
      description: 'Overrides the browser title in a link preview. Empty uses the browser title.',
      required: false,
      pattern: '',
      placeholder: '',
      valueType: 'string',
      localized: true,
    }),
    control({
      uuid: `${STATIC_FIELD_UUID_PREFIX}seo.social_description`,
      type: 'textarea',
      name: 'social_description',
      label: 'Social description',
      description:
        'Overrides the meta description in a link preview — room for a sentence that reads well in a chat. Empty uses the meta description.',
      required: false,
      rows: 3,
      resize: true,
      placeholder: '',
      localized: true,
    }),
    control({
      uuid: `${STATIC_FIELD_UUID_PREFIX}seo.og_type`,
      type: 'select',
      name: 'og_type',
      label: 'Page kind',
      description:
        'What this page is, for a link preview. An article is a piece of writing with a date; anything else is a page.',
      required: false,
      // `website` first, so the empty value and the first option agree — a reader treats an unset
      // field as a page, which is what the overwhelming majority of them are.
      options: [
        { label: 'Page', value: 'website' },
        { label: 'Article', value: 'article' },
      ],
    }),
    control({
      uuid: `${STATIC_FIELD_UUID_PREFIX}seo.no_index`,
      type: 'boolean',
      name: 'no_index',
      label: 'Hide from search and sitemaps',
      description: 'Adds a noindex robots tag and omits the page from sitemaps. The page stays public.',
    }),
    control({
      uuid: `${STATIC_FIELD_UUID_PREFIX}seo.exclude_from_sitemap`,
      type: 'boolean',
      name: 'exclude_from_sitemap',
      label: 'Exclude from sitemap',
      description:
        'Keeps this published page out of sitemap queries. This does not make the page private.',
    }),
  ],
})

/**
 * kind → the fields commitpress adds to every schema of it.
 *
 * `pages` and `collections`. This used to be `pages` alone, with a note saying that a collection
 * entry usually has a URL too and deserves the same group — what it did not have was anything
 * rendering its `<head>`, since the public catch-all serves pages and a collection entry is
 * rendered by the consumer's own routes. That is now answered by the first consumer to do it: the
 * commitpress documentation is a `docs` collection served at `/docs/*`, and a documentation page
 * needs a browser title and a meta description exactly as much as a marketing page does. The
 * consumer's routes read `content.seo` for their own entries the same way.
 *
 * `globals` and `blocks` are not addressable at all: a header, a footer or a reusable block has no
 * page metadata of its own, and offering it would be offering something with nowhere to go.
 */
export const STATIC_FIELDS: Readonly<Record<string, readonly Control[]>> = {
  pages: [seo],
  collections: [seo],
}

/** The static fields for a kind. An unknown kind has none, rather than being an error. */
export function staticFieldsFor(kind: string): readonly Control[] {
  return STATIC_FIELDS[kind] ?? []
}

/**
 * Names a schema declares itself that a static field of this kind would otherwise have provided.
 *
 * Non-empty means the author's field is being used and commitpress's is not — see the note on
 * collisions above.
 */
export function shadowedStaticFields(
  kind: string,
  components: readonly { name: string }[],
): string[] {
  const declared = new Set(components.map(component => component.name))
  return staticFieldsFor(kind)
    .filter(field => declared.has(field.name))
    .map(field => field.name)
}

/**
 * A schema's own components followed by the static fields for its kind.
 *
 * Appended, not prepended, and the order is load-bearing in two places: an editor reads a page's own
 * content before its metadata, and `content-index.ts` derives a listing row's title from the first
 * text field the schema declares — prepending would retitle every row in every listing with its SEO
 * title.
 */
export function mergeStaticFields(
  kind: string,
  components: readonly Control[],
): Control[] {
  const statics = staticFieldsFor(kind)
  if (!statics.length) {
    return [...components]
  }

  const declared = new Set(components.map(component => component.name))
  return [...components, ...statics.filter(field => !declared.has(field.name))]
}
