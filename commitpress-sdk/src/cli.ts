import { generate } from './generate.js'
import { transformAll } from './transform.js'
import { writeContent, deleteContent, bulkWrite, bulkDelete } from './manage.js'
import { releaseManifest, writeRelease } from './release.js'
import type { OutputFormat, ContentStatus } from './types.js'
import type { BulkWriteItem } from './manage.js'
import fs from 'fs/promises'
import path from 'path'

const args = process.argv.slice(2)
const command = args[0]

function getArg(flag: string): string | undefined {
  const i = args.indexOf(flag)
  return i !== -1 && args[i + 1] ? args[i + 1] : undefined
}

function hasFlag(flag: string): boolean {
  return args.includes(flag)
}

interface TransformConfig {
  format?: OutputFormat
  out?: string
  includeDrafts?: boolean
  keepEnvelope?: boolean
}

/**
 * As much of `commitpress.config.json` as the CLI reads, in the v2 layout.
 *
 * v2 grouped the keys by what reads them, and these two are the SDK's: `build.sdk` says where
 * generated types go, `build.transform` overrides the export defaults beneath it. Both used to sit
 * at the top level.
 */
interface CommitpressConfig {
  root?: string
  build?: {
    sdk?: {
      output?: string
      transform?: TransformConfig
    }
    transform?: TransformConfig
  }
}

async function resolveConfig(cwd: string): Promise<{ root: string; output: string; transformConfig: TransformConfig }> {
  const configPath = path.join(cwd, 'commitpress.config.json')

  try {
    const raw = await fs.readFile(configPath, 'utf-8')
    const config: CommitpressConfig = JSON.parse(raw)

    // SDK operations receive the project root and resolve both `root` and `directory` consistently.
    const root = cwd
    // `build.sdk` and `build.transform` since config v2, which grouped the keys by what reads them.
    const build = config.build
    const output = build?.sdk?.output
      ? path.resolve(cwd, build.sdk.output)
      : path.join(cwd, 'commitpress.generated.ts')

    const transformConfig: TransformConfig = {
      ...build?.sdk?.transform,
      ...build?.transform,
    }

    return { root, output, transformConfig }
  } catch {
    throw new Error(
      `Could not find commitpress.config.json in ${cwd}\n` +
      `Make sure you run this command from your project root.`,
    )
  }
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of process.stdin) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  }
  return Buffer.concat(chunks).toString('utf-8')
}

function parseJsonOrJsonL<T = any>(input: string): T[] {
  const trimmed = input.trim()
  if (!trimmed) return []
  if (trimmed.startsWith('[')) {
    return JSON.parse(trimmed) as T[]
  }
  const lines = trimmed.split(/\r?\n/).filter(line => line.trim().length > 0)
  return lines.map(line => JSON.parse(line) as T)
}

if (command === 'generate') {
  const cwd = getArg('--cwd') ?? process.cwd()
  const outputOverride = getArg('--output')

  resolveConfig(cwd)
    .then(({ root, output }) => generate({ root, output: outputOverride ?? output }))
    .catch(err => {
      console.error(err.message ?? err)
      process.exit(1)
    })
} else if (command === 'transform') {
  const cwd = getArg('--cwd') ?? process.cwd()

  resolveConfig(cwd)
    .then(async ({ root, transformConfig }) => {
      const format = (getArg('--format') || getArg('-f') || transformConfig.format || 'markdown') as OutputFormat
      const outDir = getArg('--out') || getArg('-o') || transformConfig.out || './dist-static'
      const includeDrafts = hasFlag('--include-drafts') || transformConfig.includeDrafts || false
      const keepEnvelope = hasFlag('--keep-envelope') || transformConfig.keepEnvelope || false

      console.log(`Transforming content in ${root} to format: ${format}...`)
      const files = await transformAll({
        root,
        outDir: path.resolve(cwd, outDir),
        format,
        includeDrafts,
        keepEnvelope,
      })
      console.log(`✓ Transformed ${files.length} file(s) → ${outDir}`)
    })
    .catch(err => {
      console.error(err.message ?? err)
      process.exit(1)
    })
} else if (command === 'write') {
  const cwd = getArg('--cwd') ?? getArg('--root') ?? process.cwd()
  const slug = getArg('--slug') || getArg('-s')
  const schema = getArg('--schema')
  const dataArg = getArg('--data') || getArg('-d')
  const status = (getArg('--status') ?? 'published') as ContentStatus

  if (!slug || !schema) {
    console.error('Error: --slug and --schema are required for write command.')
    process.exit(1)
  }

  resolveConfig(cwd)
    .then(async ({ root }) => {
      let rawData = ''
      if (!dataArg || dataArg === '-') {
        rawData = await readStdin()
      } else if (dataArg.startsWith('{') || dataArg.startsWith('[')) {
        rawData = dataArg
      } else {
        rawData = await fs.readFile(path.resolve(cwd, dataArg), 'utf-8')
      }

      const content = JSON.parse(rawData)
      const file = await writeContent({
        root,
        slug,
        schema,
        content,
        status,
      })
      console.log(`✓ Wrote content item "${file.slug}" (${file.status})`)
    })
    .catch(err => {
      console.error(err.message ?? err)
      process.exit(1)
    })
} else if (command === 'bulk') {
  const cwd = getArg('--cwd') ?? getArg('--root') ?? process.cwd()
  const fileArg = getArg('--file') || getArg('-f')
  const concurrencyArg = getArg('--concurrency') || getArg('-c')
  const status = (getArg('--status') ?? 'published') as ContentStatus
  const stopOnError = hasFlag('--stop-on-error')
  const concurrency = concurrencyArg ? parseInt(concurrencyArg, 10) : 50

  resolveConfig(cwd)
    .then(async ({ root }) => {
      let rawInput = ''
      if (!fileArg || fileArg === '-') {
        rawInput = await readStdin()
      } else {
        rawInput = await fs.readFile(path.resolve(cwd, fileArg), 'utf-8')
      }

      const items = parseJsonOrJsonL<BulkWriteItem>(rawInput)
      console.log(`Starting bulk write for ${items.length} item(s) (concurrency: ${concurrency})...`)

      const result = await bulkWrite(items, {
        root,
        concurrency,
        defaultStatus: status,
        stopOnError,
        onProgress: (done, total) => {
          if (total > 100 && done % 50 === 0) {
            process.stdout.write(`Progress: ${done}/${total}\r`)
          }
        },
      })

      console.log(`✓ Bulk write complete: ${result.written} written, ${result.failed} failed (total: ${result.total})`)
      if (result.errors.length > 0) {
        console.error('Errors encountered:')
        for (const err of result.errors.slice(0, 10)) {
          console.error(`  - [${err.slug}]: ${err.error}`)
        }
        if (result.errors.length > 10) {
          console.error(`  ... and ${result.errors.length - 10} more error(s)`)
        }
        process.exit(1)
      }
    })
    .catch(err => {
      console.error(err.message ?? err)
      process.exit(1)
    })
} else if (command === 'delete') {
  const cwd = getArg('--cwd') ?? getArg('--root') ?? process.cwd()
  const slug = getArg('--slug') || getArg('-s')
  const fileArg = getArg('--file') || getArg('-f')

  if (!slug && !fileArg) {
    console.error('Error: Either --slug or --file is required for delete command.')
    process.exit(1)
  }

  resolveConfig(cwd)
    .then(async ({ root }) => {
      if (slug) {
        const deleted = await deleteContent(slug, { root })
        if (deleted) {
          console.log(`✓ Deleted content item "${slug}"`)
        } else {
          console.log(`Notice: Content item "${slug}" did not exist`)
        }
      } else if (fileArg) {
        let rawInput = ''
        if (fileArg === '-') {
          rawInput = await readStdin()
        } else {
          rawInput = await fs.readFile(path.resolve(cwd, fileArg), 'utf-8')
        }

        const items = parseJsonOrJsonL<any>(rawInput)
        const slugs = items.map(item => (typeof item === 'string' ? item : item.slug))

        console.log(`Starting bulk delete for ${slugs.length} item(s)...`)
        const res = await bulkDelete(slugs, { root })
        console.log(`✓ Bulk delete complete: ${res.deleted} deleted, ${res.failed} failed (total: ${res.total})`)
      }
    })
    .catch(err => {
      console.error(err.message ?? err)
      process.exit(1)
    })
} else if (command === 'release') {
  /**
   * Emit the release manifest the deployed site serves.
   *
   * Deliberately writes to stdout unless `--out` is given, because a build step is a pipeline and
   * `> dist/__commitpress/release.json` is the shortest correct thing to write in a Dockerfile, a
   * Makefile or a `package.json` script. `--out` exists because it also creates the directory,
   * which is the part everybody forgets.
   *
   * Failing loudly on an unknown commit is the point: a manifest that guesses would make the CMS
   * confidently wrong about what is live, which is worse than having no manifest at all.
   */
  const cwd = getArg('--cwd') ?? process.cwd()

  releaseManifest({
    cwd,
    commit: getArg('--commit'),
    branch: getArg('--branch'),
    release: getArg('--release'),
    environment: getArg('--environment'),
  })
    .then(async manifest => {
      const out = getArg('--out') || getArg('-o')
      if (!out) {
        process.stdout.write(`${JSON.stringify(manifest, null, 2)}
`)
        return
      }
      const written = await writeRelease(out, manifest)
      console.log(`✓ Wrote release manifest for ${manifest.commit.slice(0, 7)} to ${written}`)
    })
    .catch(err => {
      console.error(err.message ?? err)
      process.exit(1)
    })
} else {
  console.log(`
@commitpress/sdk

Commands:
  generate              Generate TypeScript types from your schemas
  transform             Transform content to static format (json, md/markdown, html, yaml)
  write                 Create or update a single content item
  bulk                  Bulk create/update content items from JSON or JSONL
  delete                Delete a content item or list of items
  release               Emit the release manifest the deployed site serves

Options for generate:
  --cwd    <path>       Project root containing commitpress.config.json (default: cwd)
  --output <path>       Output file path (default: ./commitpress.generated.ts)

Options for transform:
  --cwd    <path>       Project root containing commitpress.config.json (default: cwd)
  --format <fmt>        Target format: json, md, markdown, html, yaml (default: markdown)
  --out    <dir>        Destination directory for exported files (default: ./dist-static)
  --include-drafts      Include draft content files in static export (default: false)
  --keep-envelope       Retain full envelope metadata in clean JSON export (default: false)

Options for write:
  --slug   <slug>       Content slug path (e.g. content/collections/products/prod-1)
  --schema <schema>     Schema name (e.g. products)
  --data   <json|file>  JSON data string, file path, or "-" for stdin
  --status <status>     Content status: published (default) or draft

Options for bulk:
  --file   <file|->     JSON array or JSONL file path, or "-" for stdin (default: stdin)
  --concurrency <num>   Max concurrent write operations (default: 50)
  --status <status>     Default status for items without explicit status (default: published)
  --stop-on-error       Halt processing immediately on first failure

Options for release:
  --out    <path>       File, or directory to write __commitpress/release.json into.
                        Omit to print to stdout.
  --commit <sha>        The commit being built (default: the host's build variable, then git)
  --branch <name>       Override the branch name
  --release <id>        The host's own build id (default: the host's build variable)
  --environment <name>  e.g. production, preview

Options for delete:
  --slug   <slug>       Single content slug to delete
  --file   <file|->     JSON array or JSONL file containing slugs to delete

Examples:
  npx commitpress write --slug content/pages/promo --schema marketing --data '{"title":"Summer Sale"}'
  npx commitpress bulk --file ./products.json --concurrency 50
  cat products.jsonl | npx commitpress bulk --file -
  npx commitpress delete --slug content/collections/products/old-item
  npx commitpress release --out dist          # writes dist/__commitpress/release.json
`)
}
