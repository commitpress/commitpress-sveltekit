# Commitpress SvelteKit starter

A working CMS showcase with pages, a collection, an image library, English/Swedish content, and live preview.

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

Preview targets support pages, collection entries, and the site global, including `?locale=sv`. They receive live content, image descriptors, gallery folder membership, and section selections using the SDK's preview protocol.

## Make it your own

- Theme: `src/app.css`. Warm paper, forest green, editorial headings, and locally served brand fonts.
- Site globals: `__commitpress__/content/globals/site.json`.
- Pages: `__commitpress__/content/pages/`.
- Collection: `__commitpress__/content/collections/notes/`.
- Schemas: `__commitpress__/schema/`.
- Image files and descriptors: `__commitpress__/media/images/`.
- Route and locale resolution: `src/lib/content/showcase.server.ts`.
- Page rendering and example components: `src/lib/showcase/`.

English lives in each record's base `content`; Swedish overlays live in `locales.sv.content`, with independently translated slugs and publication states. The SDK resolves the requested locale without silently falling back to another language. The language switcher follows the equivalent page or entry.

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

## SDK and sample imagery

The SDK is vendored in `commitpress-sdk/`, retaining the local package name `@commitpress/sdk`. It includes locale-aware querying, rich text, managed assets, and the preview protocol. It must be synchronized deliberately with the upstream SDK when updating the CMS integration.

Sample photographs are stored locally with multiple WebP sizes and an alternate portrait crop. See [image credits](IMAGE-CREDITS.md) for their sources.
