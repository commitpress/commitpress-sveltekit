import { execFile } from 'child_process'
import fs from 'fs/promises'
import path from 'path'
import { promisify } from 'util'

const run = promisify(execFile)

/**
 * The release manifest: how a built site tells commitpress which commit it is.
 *
 * A build writes this file into its output, the site serves it, and the CMS fetches it from the
 * live origin. That is the only way to know what the *public* can see — a deploy hook reports that
 * a build was asked for and a workflow run reports that one succeeded, but between a green build
 * and a served page sit a CDN, an atomic swap and a possible rollback.
 *
 * The reason it is a file rather than an API call is that it then works everywhere. Every host can
 * serve a static file; that is what a host is. No token, no callback, no per-host integration, and
 * a site behind a CDN reports staleness rather than hiding it, because the answer comes from the
 * same edge the reader is served by.
 */
export interface ReleaseManifest {
  schemaVersion: 1
  /** The commit the build was cut from. The only required field. */
  commit: string
  branch?: string
  /** ISO 8601. When the build ran, not when it went live — nothing in a build knows the latter. */
  builtAt: string
  /** Whatever the host calls a build. Displayed verbatim, never parsed. */
  release?: string
  environment?: string
}

/**
 * Where hosts put the commit, in the order they should be trusted.
 *
 * The host's own variable beats `git rev-parse` because a shallow or detached CI checkout is
 * routine and the host knows what it checked out. `git` is the fallback that makes this work in a
 * plain `npm run build` on somebody's laptop.
 */
const COMMIT_VARS = [
  'COMMITPRESS_COMMIT',
  'GITHUB_SHA',
  'VERCEL_GIT_COMMIT_SHA',
  'RAILWAY_GIT_COMMIT_SHA',
  'CF_PAGES_COMMIT_SHA',
  'COMMIT_REF', // Netlify
  'CI_COMMIT_SHA', // GitLab
  'BUILD_SOURCEVERSION', // Azure Pipelines
  'SOURCE_VERSION', // Heroku
  'RENDER_GIT_COMMIT',
]

const BRANCH_VARS = [
  'COMMITPRESS_BRANCH',
  'GITHUB_REF_NAME',
  'VERCEL_GIT_COMMIT_REF',
  'RAILWAY_GIT_BRANCH',
  'CF_PAGES_BRANCH',
  'BRANCH', // Netlify
  'CI_COMMIT_REF_NAME', // GitLab
  'RENDER_GIT_BRANCH',
]

const RELEASE_VARS = [
  'COMMITPRESS_RELEASE',
  'GITHUB_RUN_ID',
  'VERCEL_DEPLOYMENT_ID',
  'RAILWAY_DEPLOYMENT_ID',
  'DEPLOY_ID', // Netlify
  'CI_PIPELINE_ID', // GitLab
  'RENDER_SERVICE_ID',
]

const firstSet = (names: string[], env: NodeJS.ProcessEnv): string | undefined => {
  for (const name of names) {
    const value = env[name]?.trim()
    if (value) return value
  }
  return undefined
}

/** The commit, or nothing. A build that cannot name its commit must not invent one. */
async function resolveCommit(cwd: string, env: NodeJS.ProcessEnv): Promise<string | undefined> {
  const fromEnv = firstSet(COMMIT_VARS, env)
  if (fromEnv) return fromEnv
  try {
    const { stdout } = await run('git', ['rev-parse', 'HEAD'], { cwd })
    return stdout.trim() || undefined
  } catch {
    return undefined
  }
}

async function resolveBranch(cwd: string, env: NodeJS.ProcessEnv): Promise<string | undefined> {
  const fromEnv = firstSet(BRANCH_VARS, env)
  if (fromEnv) return fromEnv
  try {
    const { stdout } = await run('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd })
    const branch = stdout.trim()
    // A CI checkout is usually detached, and "HEAD" is not a branch name anybody wants displayed.
    return branch && branch !== 'HEAD' ? branch : undefined
  } catch {
    return undefined
  }
}

/**
 * Build the manifest.
 *
 * Explicit options beat the environment beats git, throughout — the same order for every field, so
 * a build with an unusual checkout can override exactly the one thing it knows better.
 */
export async function releaseManifest({
  cwd = process.cwd(),
  env = process.env,
  commit,
  branch,
  release,
  environment,
}: {
  cwd?: string
  env?: NodeJS.ProcessEnv
  commit?: string
  branch?: string
  release?: string
  environment?: string
} = {}): Promise<ReleaseManifest> {
  const resolved = commit || (await resolveCommit(cwd, env))
  if (!resolved) {
    throw new Error(
      'Could not determine the commit being built. Pass --commit <sha>, or set COMMITPRESS_COMMIT.',
    )
  }

  return {
    schemaVersion: 1,
    commit: resolved,
    branch: branch || (await resolveBranch(cwd, env)),
    builtAt: new Date().toISOString(),
    release: release || firstSet(RELEASE_VARS, env),
    environment: environment || env.COMMITPRESS_ENVIRONMENT || env.VERCEL_ENV || undefined,
  }
}

/** Where the file goes when `--out` names a directory rather than a file. */
export const RELEASE_FILENAME = path.join('__commitpress', 'release.json')

/**
 * Write it, creating the directory.
 *
 * `--out dist` and `--out dist/__commitpress/release.json` both do what the person meant: a path
 * with no `.json` on the end is treated as the output directory, which is the form nearly every
 * build script will use.
 */
export async function writeRelease(
  outPath: string,
  manifest: ReleaseManifest,
): Promise<string> {
  const target = outPath.endsWith('.json') ? outPath : path.join(outPath, RELEASE_FILENAME)
  await fs.mkdir(path.dirname(target), { recursive: true })
  await fs.writeFile(target, `${JSON.stringify(manifest, null, 2)}\n`, 'utf-8')
  return target
}
