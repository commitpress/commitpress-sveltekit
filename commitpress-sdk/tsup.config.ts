import { defineConfig } from 'tsup'

export default defineConfig([
  {
    // `preview`, `image`, `blocks`, `richtext` and `gallery` are browser code and the others are
    // not, but none of them imports anything, so they cost nothing to build alongside them. Keeping
    // them separate *entries* is what matters: bundling any of them into `index` would drag
    // `node:fs` into every site that only wanted the overlay, or only wanted to read an image
    // field's value, or only wanted to know whether a block had been switched off while rendering
    // one — or, for `richtext`, only wanted to turn a field's document into the paragraphs it says,
    // or, for `gallery`, only wanted to put the photographs it already has into the order the
    // editor just posted.
    entry: {
      index: 'src/index.ts',
      server: 'src/server.ts',
      preview: 'src/preview.ts',
      image: 'src/image.ts',
      blocks: 'src/blocks.ts',
      richtext: 'src/richtext.ts',
      gallery: 'src/gallery.ts',
    },
    format: ['cjs', 'esm'],
    dts: true,
    clean: true,
    splitting: false,
  },
  {
    entry: { cli: 'src/cli.ts' },
    format: ['esm'],
    banner: { js: '#!/usr/bin/env node' },
    splitting: false,
  },
])
