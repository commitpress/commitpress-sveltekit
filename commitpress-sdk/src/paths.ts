import fs from 'fs/promises'
import path from 'path'

export const DEFAULT_DATA_DIRECTORY = '__commitpress__'

function assertRelativeConfigPath(value: string, name: string): void {
  if (path.isAbsolute(value) || path.win32.isAbsolute(value) || /^[a-zA-Z]:/.test(value) ||
      value.split(/[\\/]/).some(segment => segment === '..') || value.includes('\0')) {
    throw new Error(`Invalid ${name}: path must stay inside the project.`)
  }
}

async function assertInsideProject(projectRoot: string, dataDir: string): Promise<void> {
  const realProject = await fs.realpath(projectRoot)
  let existing = dataDir
  while (true) {
    try {
      const realExisting = await fs.realpath(existing)
      const relative = path.relative(realProject, realExisting)
      if (relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) {
        throw new Error('Configured data directory escapes the project.')
      }
      return
    } catch (error: any) {
      if (error?.code !== 'ENOENT') throw error
      const parent = path.dirname(existing)
      if (parent === existing) throw error
      existing = parent
    }
  }
}

export interface IntlConfig {
  defaultLocale: string
  locales: string[]
}

/**
 * Read and canonicalize the project's optional internationalization declaration.
 *
 * `content.intl` since config v2, which grouped the keys by what reads them. Absent means a
 * single-locale project, and that is also what a v1 config now produces — the SDK does not read the
 * old flat spelling, because "silently single-locale" and "correctly single-locale" are
 * indistinguishable to the caller and only one of them is what the author asked for. A v1 config is
 * refused by the CMS on open, which is where that gets said out loud.
 */
export async function resolveIntlConfig(projectRoot = process.cwd()): Promise<IntlConfig | undefined> {
  try {
    const raw = await fs.readFile(path.join(projectRoot, 'commitpress.config.json'), 'utf8')
    const config = JSON.parse(raw) as { content?: { intl?: { default_locale?: string; locales?: string[] } } }
    const intl = config.content?.intl
    if (!intl?.default_locale || !intl.locales?.length) return undefined
    return {
      defaultLocale: Intl.getCanonicalLocales(intl.default_locale)[0]!,
      locales: intl.locales.map(locale => Intl.getCanonicalLocales(locale)[0]!),
    }
  } catch (error: any) {
    if (error?.code === 'ENOENT') return undefined
    throw error
  }
}

/** Resolve the CMS data directory from a project root and its committed config. */
export async function resolveDataDirectory(projectRoot = process.cwd()): Promise<string> {
  const absoluteRoot = path.resolve(projectRoot)
  try {
    const raw = await fs.readFile(path.join(absoluteRoot, 'commitpress.config.json'), 'utf8')
    // `root` stays at the top level in v2; `directory` moved under `content`.
    const config = JSON.parse(raw) as { root?: string; content?: { directory?: string } }
    const root = config.root || '.'
    const directory = config.content?.directory || DEFAULT_DATA_DIRECTORY
    assertRelativeConfigPath(root, 'root')
    assertRelativeConfigPath(directory, 'content.directory')
    const dataDir = path.resolve(absoluteRoot, root, directory)
    await assertInsideProject(absoluteRoot, dataDir)
    return dataDir
  } catch (error: any) {
    if (error?.code !== 'ENOENT') throw error
    const dataDir = path.resolve(absoluteRoot, DEFAULT_DATA_DIRECTORY)
    await assertInsideProject(absoluteRoot, dataDir)
    return dataDir
  }
}
