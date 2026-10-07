# Commitpress SvelteKit starter

A CMS starter with pages, a collection, an image library, English/Swedish content, and live preview.

The application renders Commitpress content and connects the editor to live previews. Its examples demonstrate CMS pages, blocks, collections, translations, and managed media. Fonts and sample images are served locally.

## Run locally

Requires Node 22+ and pnpm.

```sh
pnpm install
pnpm dev
```

Open http://localhost:5173. No database, mail provider, or CMS account is needed to explore the examples.

```sh
pnpm check
pnpm build
pnpm start
```

For a hosted Node deployment, set `ORIGIN` to the site's public origin. Deploy the project with `__commitpress__/` alongside the build: the SDK reads the content and media library from disk.

## Explore the examples

| Example | English | Swedish |
| --- | --- | --- |
| Home | / | /sv |
| Page with editable blocks | /pages | /sv/sidor |
| Nested page | /pages/a-quiet-corner | /sv/sidor/en-lugn-vra |
| Collection | /collection | /sv/samling |
| Collection entry | /collection/by-the-water | /sv/samling/vid-vattnet |
| Image library | /images | /sv/bilder |

The collection contains a draft at `content/collections/notes/not-yet`. Public routes hide it. Its preview is available at `/preview/collections/notes/not-yet`.

## Connect Commitpress

Connect this repository in Commitpress. The committed v2 config declares the content directory, locales, schemas, image settings, and preview target.

Run the starter while editing in the CMS. For a deployed preview, replace or supplement `editor.preview_urls` in `commitpress.config.json` with the deployed site's `/preview/` URL.

Preview targets support pages (`/preview/index`), collection entries (`/preview/collections/notes/by-the-water`), and the site global (`/preview/globals/site`), including `?locale=sv`. New items start with an empty preview until the editor posts their content. They receive live content, image descriptors, gallery folder membership, and section selections using the SDK's preview protocol.

The image CSP in `svelte.config.js` permits local images, data/blob images, `https://cms.commitpress.com`, and `https://commitpress-assets.up.railway.app`. Both hosted origins are needed because draft images redirect from the CMS to the isolated asset host. Development also permits HTTP loopback origins for a local CMS. For a self-hosted CMS, adjust these image origins to match the editor and its `ASSET_ORIGIN`; keep SDK preview message trust limited to the editor origin.

## Make it your own

- Theme: `src/app.css`. Warm paper, forest green, editorial headings, and locally served brand fonts.
- Site globals: `__commitpress__/content/globals/site.json`.
- Pages: `__commitpress__/content/pages/`.
- Collection: `__commitpress__/content/collections/notes/`.
- Schemas: `__commitpress__/schema/`.
- Image files and descriptors: `__commitpress__/media/images/`.
- Dynamic URL resolution: `src/lib/content/routes.server.ts`.
- Page loading: `src/lib/content/pages.server.ts`.
- Collection entries and cards: `src/lib/content/notes.server.ts`.
- Translation and publication lookup: `src/lib/content/read.server.ts`.
- Locale paths and links: `src/lib/content/locale.ts`.
- Page rendering and example components: `src/lib/showcase/`.

English lives in each record's base `content`; Swedish overlays live in `locales.sv.content`, with independently translated slugs and publication states. The SDK resolves the requested locale without silently falling back to another language. The language switcher follows the equivalent page or entry. Locales come from `commitpress.config.json`. Every public page is resolved by its content slug through one dynamic route. Collection-entry URLs use the collection page's translated slug followed by the entry's translated slug; renaming either in the CMS changes the URL without a code change.

Choose a page schema when creating a page in the CMS:

| Schema | Fields and behavior |
| --- | --- |
| Home | Introduction and cover, featured-page links, collection highlights, and a language note. Each section's copy and links are editable. |
| Page | Introduction, optional cover, rich text, next-page link, and reusable Intro, FAQ, and Call to action blocks. |
| Collection | Introduction followed by published Notes entries. |
| Gallery | Introduction and an ordered image folder with a full-screen viewer. |

Each schema has its own field group (`home`, `page`, `collection`, or `gallery`). The renderer and live preview use that group to identify the layout; there is no layout dropdown. Existing examples and their Swedish translations use the corresponding schema. The `notes` collection remains separate and uses structured rich text.

The site global contains the site name, tagline, home link, header/footer logos, browser icon, desktop/mobile navigation, language-switcher labels, footer copy, and interface labels. Logos and the browser icon use the CMS media library. Copyright copy can include `{year}` and `{name}` placeholders.

Visible copy and editorial links come from CMS content, including cover captions, entry back links, gallery controls, and error messages. Clearing an optional field or removing a homepage section removes it from the page; components do not restore hardcoded default copy. Layout, decorative symbols, and formatting remain part of the site design.

Run `pnpm cms:generate` after changing schemas. The production build regenerates the types automatically.

Server loaders import `query` and `queryList` from `src/commitpress.generated.ts`. Literal content paths infer the result type, so `queryList('content/collections/notes', { locale, defaultLocale })` returns typed notes without an explicit generic or root argument. Page lists return a union of schemas; check `file.schema` to narrow the content.

## SDK and sample imagery

The starter installs `@commitpress/sdk-node` from npm. It includes locale-aware querying, rich text, managed assets, and the preview protocol. Update it with `pnpm update @commitpress/sdk-node`.

Sample photographs are stored locally with multiple WebP sizes and an alternate portrait crop. See [image credits](IMAGE-CREDITS.md) for their sources.
