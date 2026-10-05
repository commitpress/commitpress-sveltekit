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

The page schema keeps reusable blocks alongside a layout group. The /pages example demonstrates independently editable and reorderable sections; collection entries use structured rich text.

Run `pnpm cms:generate` after changing schemas. The production build regenerates the types automatically.

## SDK and sample imagery

The SDK is vendored in `commitpress-sdk/`, retaining the local package name `@commitpress/sdk`. It includes locale-aware querying, rich text, managed assets, and the preview protocol. It must be synchronized deliberately with the upstream SDK when updating the CMS integration.

Sample photographs are stored locally with multiple WebP sizes and an alternate portrait crop. See [image credits](IMAGE-CREDITS.md) for their sources.
