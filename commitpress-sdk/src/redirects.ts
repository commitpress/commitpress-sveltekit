import { query, queryList, type QueryOptions } from './query.js'
import { isPublished } from './types.js'

/** A published redirect page. Its slug is the old public path. */
export interface RedirectEntry {
  from: string
  to: string
  status: 301 | 302 | 303 | 307 | 308
}

function redirectStatus(value: unknown, from: string): RedirectEntry['status'] {
  if (value === undefined || value === '') return 301
  const status = Number(value)
  if (status === 301 || status === 302 || status === 303 || status === 307 || status === 308) return status
  throw new Error(`Redirect ${from} has an unsupported HTTP status.`)
}

function publicPath(slug: string): string {
  return slug === 'index' ? '/' : `/${slug.replace(/^\/+|\/+$/g, '')}`
}

function destination(value: unknown, from: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Redirect ${from} needs a destination.`)
  }
  const to = value.trim()
  if (!to.startsWith('/') && !/^https?:\/\//i.test(to)) {
    throw new Error(`Redirect ${from} must point to a root-relative path or an HTTP(S) URL.`)
  }
  if (to.startsWith('//') || /[\\\r\n]/.test(to)) {
    throw new Error(`Redirect ${from} has an invalid destination.`)
  }
  if (!to.startsWith('/')) {
    try { new URL(to) }
    catch { throw new Error(`Redirect ${from} has an invalid destination.`) }
  }
  if (to.split(/[?#]/)[0]!.replace(/\/+$/, '') === from.replace(/\/+$/, '')) {
    throw new Error(`Redirect ${from} points to itself.`)
  }
  return to
}

function entry(file: { schema: string; slug: string; content: unknown }): RedirectEntry | undefined {
  if (file.schema !== 'redirect') return undefined
  const from = publicPath(file.slug)
  const content = file.content as {
    redirect?: { destination?: unknown; status?: unknown }
    destination?: unknown
    status?: unknown
  } | null
  const fields = content?.redirect ?? content
  return {
    from,
    to: destination(fields?.destination, from),
    status: redirectStatus(fields?.status, from),
  }
}

/** Find a redirect for one request path. Draft redirect pages are ignored by default. */
export async function redirectForPath(
  pathname: string,
  root = process.cwd(),
  options: QueryOptions = {},
): Promise<RedirectEntry | undefined> {
  let slug: string
  try {
    slug = decodeURIComponent(pathname.split(/[?#]/)[0]!).replace(/^\/+|\/+$/g, '') || 'index'
  } catch {
    return undefined
  }
  if (slug.includes('\\') || slug.split('/').some(part => part === '.' || part === '..' || !part)) return undefined
  try {
    const file = await query(`content/pages/${slug}`, root, { ...options, includeDrafts: true })
    return (options.includeDrafts || isPublished(file)) ? entry(file) : undefined
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw error
  }
}

/** List redirects for framework route generation or static hosting configuration. */
export async function listRedirects(
  root = process.cwd(),
  options: QueryOptions = {},
): Promise<RedirectEntry[]> {
  try {
    const pages = await queryList('content/pages', root, options)
    return pages.flatMap(file => {
      const redirect = entry(file)
      return redirect ? [redirect] : []
    })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw error
  }
}
