import fs from 'fs/promises'
import path from 'path'
import { resolveDataDirectory } from './paths.js'
import { ORIENTATION_POSITIONS } from './schema.js'
import type { Control } from './schema.js'
import { mergeStaticFields } from './static-fields.js'

// --- Helpers ---

function toPascalCase(str: string): string {
  const identifier = str
    .replace(/[-_/](.)/g, (_, c: string) => c.toUpperCase())
    .replace(/^(.)/, (_, c: string) => c.toUpperCase())
  if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(identifier)) {
    throw new Error(`Invalid schema name for generated type: ${JSON.stringify(str)}`)
  }
  return identifier
}

function ind(level: number): string {
  return '  '.repeat(level)
}

// --- Core type mapper ---

function controlToType(
  control: Control,
  level = 0,
  blockTypes?: Map<string, string>,
): string {
  const i = ind(level)

  switch (control.type) {
    case 'input':
      return ['int', 'float', 'number'].includes(control.valueType)
        ? 'number'
        : 'string'

    case 'textarea':
      return 'string'

    /**
     * A document, not a string.
     *
     * Prose is stored as a ProseMirror tree so that the CMS can validate it, and so that a schema's
     * own fields can sit between its paragraphs. The type is imported from the SDK rather than
     * written out here for the reason `NavigationItem` is: a recursive shape cannot be spelled
     * inline, and emitting one per field would give every repository its own
     * structurally-identical-but-nominally-separate document type.
     *
     * The change is deliberately load-bearing at the call site. A site that was writing
     * `{@html page.body}` stops compiling rather than printing `[object Object]` into the page, and
     * what it moves to is `richtext(page.body)`.
     *
     * A field declaring `controls` writes them into the document's own type, so `richtext()`'s
     * `blocks` argument is checked against the schema: a renderer missing for a control the schema
     * offers is a compile error, and one left behind for a control the schema stopped offering is
     * another. That is the same property the image-slot types were generated for, and the same
     * `blockTypes` map `multiblock` registers its variants in — an embedded block is a multiblock
     * row, so the emitted `…Block` types are the same types.
     */
    case 'richtext': {
      const controls = control.controls ?? []
      if (!controls.length) return 'RichtextDoc'
      const entries = controls
        .map(c => {
          const typeName = toPascalCase(c.name) + 'Block'
          blockTypes?.set(typeName, `export type ${typeName} = ${controlToType(c, 0, blockTypes)}`)
          return `${JSON.stringify(c.name)}: ${typeName}`
        })
        .join('; ')
      return `RichtextDoc<{ ${entries} }>`
    }

    case 'boolean':
      return 'boolean'

    /**
     * An asset id — or, where the field offers alternates, either an id or an object naming one
     * per slot.
     *
     * The union is the honest reading and not a hedge: both shapes are written by the same field
     * today, because a responsive field with only its default picked stores the bare id, so a type
     * committing to the object would be wrong for most of the pages using it. The slots are emitted
     * as declared keys rather than an index signature, which is the whole reason this is worth
     * generating at all: a site reading `hero.mobile` stops compiling when the schema stops
     * offering `mobile`, and `picture()` in the SDK takes either shape.
     *
     * Every slot is optional — an alternate is by definition the case somebody may not have filled
     * in — while `src` is not, because a stored object always names the default. The parser refuses
     * to write one that does not.
     *
     * `renditions` widens it the same way and only where the schema declares it: the pins are a key
     * beside the ids, keyed by slot, so a field offering them can hold an object where a field that
     * does not never will. `alt` is the third of these — a description written for this placement,
     * keyed by slot exactly as the pins are, present only where the schema offers the override.
     * Every id stays an id in all of these shapes, which is what lets anything that resolves an
     * image by matching ids keep working — `imageId()` is the convenience, not the requirement,
     * `imageRendition()` is how a site asks for the pin, and `imageAlt()` for the description.
     */
    case 'image': {
      const slots = control.multiple ? [] : (control.breakpoints ?? [])
      const pins = !control.multiple && control.renditions === true
      const described = !control.multiple && control.alt === true
      if (!slots.length && !pins && !described) return 'string'

      /** `src` and every alternate, each optional — the shape both keyed maps take. */
      const perSlot = ['src', ...slots.map(slot => slot.name)]
        .map(name => `${JSON.stringify(name)}?: string`)
        .join('; ')

      const keys = slots.map(slot => `${JSON.stringify(slot.name)}?: string`)
      if (pins) keys.push(`renditions?: { ${perSlot} }`)
      if (described) keys.push(`alt?: { ${perSlot} }`)

      return `string | { src: string; ${keys.join('; ')} }`
    }

    /**
     * A folder, and optionally the order its images are shown in.
     *
     * A union rather than one shape because both really occur in stored content: a bare string is
     * every gallery written before ordering existed, and the object is what the field writes now.
     * Emitted structurally rather than as an imported alias — nothing else this generator produces
     * imports from the SDK, and a generated file that suddenly needed one would break every build
     * resolving these types without the package.
     *
     * The union is also the useful pressure. A site doing `assets({ folder: page.gallery })` no
     * longer type-checks, and that call was silently discarding the author's ordering; `gallery()`
     * in the SDK takes this value as it stands and answers the images in order.
     *
     * A field declaring `options` also carries the mark chosen per image, and it is emitted as the
     * **literal union the schema declares** rather than `string` — the same treatment `select` gets,
     * for the better reason: a site switches on these words to decide a layout, and a mistyped case
     * in that switch is a branch that simply never runs. `galleryImages()` resolves the same value
     * onto each image as `option`.
     */
    case 'gallery': {
      const marks = control.options?.length
        ? `; options?: Record<string, ${control.options.map(o => JSON.stringify(o.value)).join(' | ')}>`
        : ''
      return `string | { folder: string; order?: string[]${marks} }`
    }

    /**
     * Narrowed to the positions the field actually offers, the same way `select` is narrowed to its
     * options: a site switches on this value to pick a layout, and a branch for a position the
     * editor cannot produce is a branch that never runs.
     *
     * An empty — or absent — `selectedPositions` is all nine, not none. Every orientation field
     * written before the schema builder grew its picker carries no list at all, and reading that as
     * "no positions" would generate a type no value can satisfy. Filtered through the canonical
     * order so the union reads the same whatever order a schema names them in, and so a position
     * outside the nine can never reach the generated file.
     */
    case 'orientation': {
      const offered = control.selectedPositions?.length
        ? ORIENTATION_POSITIONS.filter(position => control.selectedPositions!.includes(position))
        : ORIENTATION_POSITIONS
      return (offered.length ? offered : ORIENTATION_POSITIONS).map(p => `'${p}'`).join(' | ')
    }

    case 'link':
      if (control.valueType === 'any') {
        return "{ type: 'internal' | 'external' | 'data'; href: string; label?: string; target?: '_blank' | '_self' }"
      }
      if (control.valueType === 'external') {
        return "{ href: string; label?: string; target?: '_blank' | '_self' }"
      }
      return "{ href: string; label?: string }"

    case 'collection':
      return 'string'

    // The item type is imported from the SDK rather than written out here — see `NavigationItem`
    // in types.ts. Emitting the object literal per field would give every repository its own
    // structurally-identical-but-nominally-separate menu type, and a recursive one cannot be
    // written inline at all.
    case 'navigation':
      return 'NavigationItem[]'

    case 'datetime':
      return 'string'

    case 'file':
      return control.multiple ? 'string[]' : 'string'

    case 'select': {
      const item = control.options?.length
        ? control.options.map(o => JSON.stringify(o.value)).join(' | ')
        : 'string'
      return control.multiple ? `Array<${item}>` : item
    }

    case 'group': {
      const fields = (control.controls || [])
        .map(c => `${i}  ${JSON.stringify(c.name)}${c.required && !c.visibleWhen ? '' : '?'}: ${controlToType(c, level + 1, blockTypes)}`)
        .join('\n')
      const obj = `{\n${fields}\n${i}}`
      return control.multiple ? `Array<${obj}>` : obj
    }

    case 'multiblock': {
      const variants = (control.controls || [])
        .map(c => {
          const typeName = toPascalCase(c.name) + 'Block'
          const resolved = controlToType(c, 0, blockTypes)
          // Register as a named exported block type
          blockTypes?.set(typeName, `export type ${typeName} = ${resolved}`)
          return `${i}  | { ${JSON.stringify(c.name)}: ${typeName} }`
        })
        .join('\n')
      return `Array<\n${variants}\n${i}>`
    }

    default:
      return 'unknown'
  }
}

function schemaToInterface(
  schemaJson: any,
  kind: string,
  name: string,
  blockTypes: Map<string, string>,
): string {
  // The same merge the editor applies on read. Without it a static field would exist in the content
  // and be missing from the type describing it, and a site reading `content.seo` would be told the
  // property does not exist — see `static-fields.ts`.
  const components: Control[] = mergeStaticFields(kind, schemaJson.blocks?.components ?? [])
  const interfaceName = toPascalCase(name) + 'Content'

  const fields = components
    .map(c => `  ${JSON.stringify(c.name)}${c.required && !c.visibleWhen ? '' : '?'}: ${controlToType(c, 1, blockTypes)}`)
    .join('\n')

  return `export interface ${interfaceName} {\n${fields}\n}`
}

// --- File discovery ---

async function readSchemas(
  schemaDir: string,
  blockTypes: Map<string, string>,
  /** Filled with `schema name -> interface name`, in the spelling a content file's `schema` uses. */
  schemaNames?: Map<string, string>,
): Promise<Map<string, string>> {
  const interfaces = new Map<string, string>()

  let schemaTypes: string[]
  try {
    schemaTypes = await fs.readdir(schemaDir)
  } catch (error: any) {
    if (error?.code === 'ENOENT') return interfaces
    throw error
  }

  for (const schemaType of schemaTypes) {
    const typeDir = path.join(schemaDir, schemaType)
    const stat = await fs.stat(typeDir)
    if (!stat.isDirectory()) continue

    const files = await fs.readdir(typeDir)
    for (const file of files) {
      if (!file.endsWith('.json')) continue
      const name = file.replace('.json', '')
      const raw = await fs.readFile(path.join(typeDir, file), 'utf-8')
      try {
        const schema = JSON.parse(raw)
        schemaNames?.set(name, toPascalCase(name) + 'Content')
        interfaces.set(
          toPascalCase(name) + 'Content',
          // `schemaType` is the directory — `pages`, `collections` — which is the kind the static
          // fields are keyed on.
          schemaToInterface(schema, schemaType, name, blockTypes),
        )
      } catch (error) {
        throw new Error(`Invalid schema ${schemaType}/${file}: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
  }

  return interfaces
}

/**
 * Every content file, at any depth, with the schema it was written against.
 *
 * Recursive because a slug may contain slashes: `content/pages/brollop/frida-och-marcus` is a page
 * nested under a folder in the editor, and the item's own `slug` field carries those separators. A
 * flat read would leave it out of `ContentMap` and — worse — leave its schema out of
 * `AnyContentFile`, so a site that reads it by a runtime slug would be told the schema it is
 * looking at cannot exist. Same gap `queryList` had, in the other half of the SDK.
 *
 * The prefix is built from the walk rather than from the file's `slug` field so that the key here
 * is the path `query()` will actually resolve; the two agree today, and if they ever stop, the
 * generated map should still describe the filesystem.
 */
async function readContentSlugs(
  contentDir: string,
): Promise<Array<{ slug: string; schemaName: string }>> {
  const entries: Array<{ slug: string; schemaName: string }> = []

  async function walk(dir: string, prefix: string): Promise<void> {
    let found: import('fs').Dirent[]
    try {
      found = await fs.readdir(dir, { withFileTypes: true })
    } catch (error: any) {
      if (error?.code === 'ENOENT') return
      throw error
    }

    for (const entry of found) {
      if (entry.isDirectory()) {
        await walk(path.join(dir, entry.name), `${prefix}/${entry.name}`)
        continue
      }

      if (!entry.isFile() || !entry.name.endsWith('.json')) continue
      const slug = entry.name.replace('.json', '')

      try {
        const raw = await fs.readFile(path.join(dir, entry.name), 'utf-8')
        const { schema } = JSON.parse(raw)
        if (schema) {
          entries.push({ slug: `${prefix}/${slug}`, schemaName: schema })
        }
      } catch (error) {
        throw new Error(`Invalid content ${prefix}/${entry.name}: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
  }

  await walk(contentDir, 'content')

  return entries
}

// --- Generator entry point ---

/** The published name of this package, and the specifier a generated file falls back to. */
const DEFAULT_SDK_PACKAGE = '@commitpress/sdk-node'

/** Any name this SDK is depended on under. It is vendored under `@commitpress/sdk` downstream. */
const SDK_PACKAGE_PATTERN = /^@commitpress\/sdk(-node)?$/

/**
 * The specifier the generated file imports the SDK by.
 *
 * Read from the consuming project's `package.json` rather than written as a literal, because the
 * literal is only right for the repository this package is developed in. The SDK is not published,
 * so a site vendors a copy of it and gives it whatever name its workspace uses - `@commitpress/sdk`
 * in every project that vendored it before the monorepo package was renamed - and a generated file
 * importing `@commitpress/sdk-node` there names a package the project cannot resolve. Every type in
 * it then fails at the import line, which reads as the schemas being wrong rather than as one word.
 *
 * The project's declared dependency is the authority precisely because that is the name TypeScript
 * and the bundler will resolve: whatever this file emits has to be a name the *consumer* has, not
 * one this package knows about itself.
 */
async function sdkPackageSpecifier(from: string): Promise<string> {
  let directory = path.resolve(from)

  for (let level = 0; level <= 3; level += 1) {
    try {
      const raw = await fs.readFile(path.join(directory, 'package.json'), 'utf-8')
      const manifest = JSON.parse(raw) as Record<string, unknown>
      for (const field of ['dependencies', 'devDependencies', 'peerDependencies']) {
        const names = Object.keys((manifest[field] as Record<string, string> | undefined) ?? {})
        const match = names.find(name => SDK_PACKAGE_PATTERN.test(name))
        if (match) return match
      }
    } catch {
      // No manifest at this level, or an unreadable one: keep walking up.
    }

    const parent = path.dirname(directory)
    if (parent === directory) break
    directory = parent
  }

  return DEFAULT_SDK_PACKAGE
}

export async function generate(options: { root: string; output: string }) {
  const { root, output } = options
  const dataDir = await resolveDataDirectory(root)
  const schemaDir = path.join(dataDir, 'schema')
  const contentDir = path.join(dataDir, 'content')

  const blockTypes = new Map<string, string>()
  const schemaNames = new Map<string, string>()
  const [interfaces, slugs] = await Promise.all([
    readSchemas(schemaDir, blockTypes, schemaNames),
    readContentSlugs(contentDir),
  ])

  // Redirect is a built-in page type, so it has no schema JSON for readSchemas to discover.
  schemaNames.set('redirect', 'RedirectContent')
  interfaces.set('RedirectContent', "export interface RedirectContent { redirect: { destination: string; status?: '301' | '302' | '303' | '307' | '308' } }")

  const queryMapEntries = slugs
    .map(({ slug, schemaName }) => {
      const interfaceName = toPascalCase(schemaName) + 'Content'
      return `  ${JSON.stringify(slug)}: ${interfaces.has(interfaceName) ? interfaceName : 'unknown'}`
    })
    .join('\n')

  /**
   * The discriminated union: every schema the repository *declares*, not every one it currently
   * uses.
   *
   * Built from the content files until a repository proved the difference. A schema with no items
   * written against it yet — a `gallery` whose pages were all rebuilt as something else — dropped
   * out of the union, and the site's `if (file.schema === 'gallery')` branch stopped compiling:
   * TypeScript reported a comparison with no overlap, and every read inside the branch became a
   * property access on `never`. The schema was still in the repository and the editor still offered
   * it, so the next page created that way would have been rendered by code that no longer builds.
   *
   * The schema directory is the declaration and the content directory is a sample of it. `ContentMap`
   * is the one that has to follow the content, because it maps slugs that exist.
   */
  const uniqueSchemas = [
    ...schemaNames.entries(),
    // A content file naming a schema that is not in the schema directory. Rare and not this
    // function's to fix, but leaving it out of the union would be the same silent hole as above.
    ...slugs
      .filter(({ schemaName }) => !schemaNames.has(schemaName))
      .filter(({ schemaName }) => interfaces.has(toPascalCase(schemaName) + 'Content'))
      .map(({ schemaName }) => [schemaName, toPascalCase(schemaName) + 'Content'] as [string, string]),
  ].filter(([, iface], index, all) => all.findIndex(([, other]) => other === iface) === index)

  const anyContentFileEntries = uniqueSchemas
    .map(([name, iface]) => `  | (ContentFile<${iface}> & { schema: ${JSON.stringify(name)} })`)
    .join('\n')

  // Compute path from process.cwd() (where the app runs) to the root
  // Convention: app runs from the package directory (parent of output's src/)
  const appDir = path.dirname(path.dirname(output))
  const relativeFromCwd = path.relative(appDir, root).replace(/\\/g, '/')

  // The name the project depends on this package by, which is not always the name it is
  // published under. See `sdkPackageSpecifier`.
  const sdk = await sdkPackageSpecifier(path.dirname(output))

  // Imported only when something emitted actually names it: an unused type import is an error
  // under `noUnusedLocals`, and this file is generated into someone else's tsconfig.
  const emitted = [...blockTypes.values(), ...interfaces.values()]
  const extraTypes = ['NavigationItem', 'RichtextDoc'].filter(name =>
    emitted.some(text => text.includes(name)),
  )

  const lines = [
    `// Auto-generated by ${sdk} — do not edit`,
    `// Run: npx commitpress generate\n`,
    `import { query as _query, sitemap as _sitemap, type ContentFile, type SitemapOptions, type SitemapEntry${extraTypes
      .map(name => `, type ${name}`)
      .join('')} } from '${sdk}'`,
    `import { resolve } from 'path'\n`,
    `const __root = resolve(process.cwd(), ${JSON.stringify(relativeFromCwd)})\n`,
    ...[...blockTypes.values()],
    '',
    ...[...interfaces.values()],
    `\nexport type ContentMap = {\n${queryMapEntries}\n}\n`,
    `export type AnyContentFile =\n${anyContentFileEntries}\n`,
    `export function query<K extends keyof ContentMap>(slug: K, options?: import('${sdk}').QueryOptions): Promise<ContentFile<ContentMap[K]>>`,
    `export function query(slug: string, options?: import('${sdk}').QueryOptions): Promise<AnyContentFile>`,
    `export function query(slug: string, options = {}): Promise<AnyContentFile> {`,
    `  return _query(slug, __root, options) as Promise<AnyContentFile>`,
    `}`,
    `export function sitemap(options: Omit<SitemapOptions, 'root'> = {}): Promise<SitemapEntry[]> {`,
    `  return _sitemap({ ...options, root: __root })`,
    `}`,
    `export type { ContentFile }`,
  ]

  await fs.writeFile(output, lines.join('\n'), 'utf-8')
  console.log(`✓ Generated ${interfaces.size} type(s) → ${output}`)
}
