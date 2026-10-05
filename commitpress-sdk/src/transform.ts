import fs from 'fs/promises'
import path from 'path'
import { resolveDataDirectory } from './paths.js'
import type { ContentFile, OutputFormat, TransformOptions } from './types.js'
import { resolveLocale } from './query.js'
import { isPublished } from './types.js'
import { isRichtextDoc, richtext } from './richtext.js'

/**
 * Lightweight helper to convert HTML strings (from rich text fields) to Markdown.
 */
function markdownLink(href: string, label: string): string {
  const decoded = href.replace(/&(?:amp|lt|gt|quot|apos|#39|#(?:x[0-9a-f]+|[0-9]+));/gi, entity => {
    const named: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#39': "'" }
    const name = entity.slice(1, -1).toLowerCase()
    if (name in named) return named[name]!
    const number = name.startsWith('#x') ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10)
    return Number.isInteger(number) && number <= 0x10ffff && !(number >= 0xd800 && number <= 0xdfff)
      ? String.fromCodePoint(number) : entity
  }).trim()
  const safe = decoded && !/[\u0000-\u001f\u007f]/.test(decoded) &&
    !decoded.startsWith('//') && !/&(?:#[0-9]+|#x[0-9a-f]+|[a-z][a-z0-9]+);/i.test(decoded) &&
    (/^(#|\/(?!\/)|\.\/|\.\.\/)/.test(decoded) || /^(https?:\/\/|mailto:|tel:)/i.test(decoded))
  if (!safe) return label
  try {
    const destination = encodeURI(decoded).replace(/[()]/g, character =>
      `%${character.charCodeAt(0).toString(16).toUpperCase()}`)
    return `[${label.replace(/[\\\[\]]/g, '\\$&')}](${destination})`
  } catch {
    return label
  }
}

export function htmlToMarkdown(html: string): string {
  if (!html || typeof html !== 'string') return ''

  let md = html
    // Headings
    .replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, '\n# $1\n')
    .replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, '\n## $1\n')
    .replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, '\n### $1\n')
    .replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, '\n#### $1\n')
    .replace(/<h5[^>]*>([\s\S]*?)<\/h5>/gi, '\n##### $1\n')
    .replace(/<h6[^>]*>([\s\S]*?)<\/h6>/gi, '\n###### $1\n')
    // Bold / Italic / Code
    .replace(/<(?:b|strong)[^>]*>([\s\S]*?)<\/(?:b|strong)>/gi, '**$1**')
    .replace(/<(?:i|em)[^>]*>([\s\S]*?)<\/(?:i|em)>/gi, '*$1*')
    .replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, '`$1`')
    .replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, '\n```\n$1\n```\n')
    // Links
    .replace(/<a\s+[^>]*href=["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi,
      (_match, href: string, label: string) => markdownLink(href, label))
    // Lists
    .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, '- $1\n')
    .replace(/<\/?(?:ul|ol)[^>]*>/gi, '\n')
    // Paragraphs & Line Breaks
    .replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, '\n$1\n')
    .replace(/<br\s*\/?>/gi, '\n')
    // Remove remaining HTML tags
    .replace(/<[^>]+>/g, '')
    // Decode common HTML entities
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    // Clean up excessive blank lines
    .replace(/\n{3,}/g, '\n\n')

  return md.trim()
}

/**
 * Lightweight helper to serialize an object to YAML.
 */
export function stringifyYaml(data: unknown, indentLevel = 0): string {
  const indent = '  '.repeat(indentLevel)

  if (data === null || data === undefined) return 'null'
  if (typeof data === 'boolean' || typeof data === 'number') return String(data)
  if (typeof data === 'string') return JSON.stringify(data)

  if (Array.isArray(data)) {
    if (data.length === 0) return '[]'
    return data
      .map(item => {
        if (typeof item === 'object' && item !== null) {
          const formatted = stringifyYaml(item, indentLevel + 1)
          const trimmed = formatted.trimStart()
          return `${indent}- ${trimmed}`
        }
        return `${indent}- ${stringifyYaml(item, indentLevel + 1)}`
      })
      .join('\n')
  }

  if (typeof data === 'object') {
    const keys = Object.keys(data as Record<string, unknown>)
    if (keys.length === 0) return '{}'
    return keys
      .map(key => {
        const val = (data as Record<string, unknown>)[key]
        if (typeof val === 'object' && val !== null && !Array.isArray(val) && Object.keys(val).length > 0) {
          return `${indent}${JSON.stringify(key)}:\n${stringifyYaml(val, indentLevel + 1)}`
        }
        if (Array.isArray(val) && val.length > 0) {
          return `${indent}${JSON.stringify(key)}:\n${stringifyYaml(val, indentLevel + 1)}`
        }
        return `${indent}${JSON.stringify(key)}: ${stringifyYaml(val, indentLevel)}`
      })
      .join('\n')
  }

  return String(data)
}

/**
 * Convert content to Markdown with YAML frontmatter.
 */

export function toMarkdown(file: ContentFile<any>): string {
  const meta: Record<string, unknown> = {
    schema: file.schema,
    slug: file.slug,
    status: file.status ?? 'published',
    ...(file.published_at ? { published_at: new Date(file.published_at).toISOString() } : {}),
    ...(file.last_edited ? { last_edited: new Date(file.last_edited).toISOString() } : {}),
  }

  const content = file.content ?? {}
  const bodyParts: string[] = []

  // Extract metadata and non-body fields for frontmatter
  if (typeof content === 'object' && content !== null) {
    for (const [key, val] of Object.entries(content)) {
      // A richtext field is prose by declaration rather than by looking like prose, so it needs no
      // heuristic — and it must not fall through to the frontmatter, where a document would be
      // written out as a page of YAML describing paragraph nodes. Rendered and then converted, so
      // there is one markdown mapping here rather than a second one written against the tree.
      if (isRichtextDoc(val)) {
        bodyParts.push(`## ${key}\n\n${htmlToMarkdown(richtext(val))}`)
      } else if (typeof val === 'string' && (val.includes('<p>') || val.includes('<h') || val.length > 200)) {
        bodyParts.push(`## ${key}\n\n${htmlToMarkdown(val)}`)
      } else {
        meta[key] = val
      }
    }
  }

  const frontmatter = stringifyYaml(meta)
  const body = bodyParts.join('\n\n')

  return `---\n${frontmatter}\n---\n\n${body}`.trim() + '\n'
}

/**
 * Convert content to static HTML.
 */
export function toHtml(file: ContentFile<any>): string {
  const content = file.content ?? {}
  const title = (content.seo?.title || content.title || file.slug) as string
  const description = (content.seo?.description || '') as string
  const escapeHtml = (value: unknown) => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')

  function renderValueToHtml(val: unknown, keyName = ''): string {
    // Ahead of the object branch, which would otherwise walk a document's own nodes as if `type`
    // and `content` were fields somebody declared.
    if (isRichtextDoc(val)) return richtext(val)
    if (typeof val === 'string') {
      return `<p>${escapeHtml(val)}</p>`
    }
    if (Array.isArray(val)) {
      return `<div class="list ${escapeHtml(keyName)}">${val.map(item => renderValueToHtml(item)).join('\n')}</div>`
    }
    if (typeof val === 'object' && val !== null) {
      return Object.entries(val)
        .map(([k, v]) => `<section class="field-${escapeHtml(k)}"><h3>${escapeHtml(k)}</h3>${renderValueToHtml(v, k)}</section>`)
        .join('\n')
    }
    return `<span>${escapeHtml(val)}</span>`
  }

  const bodyHtml = renderValueToHtml(content)

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  ${description ? `<meta name="description" content="${escapeHtml(description)}">` : ''}
  <meta name="generator" content="CommitPress SDK Static Export">
</head>
<body>
  <main data-schema="${escapeHtml(file.schema)}" data-slug="${escapeHtml(file.slug)}">
    <article>
      <h1>${escapeHtml(title)}</h1>
      ${bodyHtml}
    </article>
  </main>
</body>
</html>`
}

/**
 * Convert content to JSON.
 */
export function toJson(file: ContentFile<any>, keepEnvelope = false): string {
  return JSON.stringify(keepEnvelope ? file : file.content, null, 2) + '\n'
}

/**
 * Convert content to YAML.
 */
export function toYaml(file: ContentFile<any>): string {
  return stringifyYaml(file.content) + '\n'
}

/**
 * Transform a single ContentFile into specified output format.
 */
export function transformContentFile(
  file: ContentFile<any>,
  format: OutputFormat,
  options: { keepEnvelope?: boolean } = {},
): { content: string; extension: string } {
  const fmt = format.toLowerCase()

  switch (fmt) {
    case 'markdown':
    case 'md':
      return { content: toMarkdown(file), extension: '.md' }
    case 'html':
      return { content: toHtml(file), extension: '.html' }
    case 'yaml':
    case 'yml':
      return { content: toYaml(file), extension: '.yaml' }
    case 'json':
    default:
      return { content: toJson(file, options.keepEnvelope), extension: '.json' }
  }
}

/**
 * Recursively find all JSON content files under a directory.
 */
async function findContentFiles(dir: string): Promise<string[]> {
  const files: string[] = []

  let entries: import('fs').Dirent[]
  try {
    entries = (await fs.readdir(dir, { withFileTypes: true })) as any
  } catch (error: any) {
    if (error?.code === 'ENOENT') return files
    throw error
  }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      const subFiles = await findContentFiles(fullPath)
      files.push(...subFiles)
    } else if (entry.isFile() && entry.name.endsWith('.json')) {
      files.push(fullPath)
    }
  }

  return files
}

/**
 * Transform all repository content into the target format and output to destination directory.
 */
export async function transformAll(options: TransformOptions): Promise<Array<{ relativePath: string; absolutePath: string }>> {
  const root = options.root ? path.resolve(options.root) : process.cwd()
  const contentDir = path.join(await resolveDataDirectory(root), 'content')
  const outDir = options.outDir ? path.resolve(options.outDir) : path.join(root, 'dist-static')
  const includeDrafts = options.includeDrafts ?? false

  const filePaths = await findContentFiles(contentDir)
  const results: Array<{ relativePath: string; absolutePath: string }> = []

  for (const filePath of filePaths) {
    try {
      const raw = await fs.readFile(filePath, 'utf-8')
      const stored: ContentFile<any> = JSON.parse(raw)
      const file = resolveLocale(stored, options.locale, options.defaultLocale)

      if (!includeDrafts && !isPublished(file)) {
        continue
      }

      const relativeFromContent = path.relative(contentDir, filePath)
      const parsedPath = path.parse(relativeFromContent)

      const { content, extension } = transformContentFile(file, options.format, { keepEnvelope: options.keepEnvelope })
      const outRelativePath = path.join(parsedPath.dir, parsedPath.name + extension)
      const outAbsolutePath = path.join(outDir, outRelativePath)

      await fs.mkdir(path.dirname(outAbsolutePath), { recursive: true })
      await fs.writeFile(outAbsolutePath, content, 'utf-8')

      results.push({ relativePath: outRelativePath, absolutePath: outAbsolutePath })
    } catch (err) {
      throw new Error(`Failed to transform ${filePath}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  return results
}
