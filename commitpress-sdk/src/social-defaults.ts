import { query } from './query.js'
import type { ImageValue } from './image.js'

export interface SocialDefaults {
  image?: ImageValue
  title?: string
  description?: string
}

/** Read Commitpress's fixed site-wide social defaults record. */
export async function socialDefaults(root = process.cwd()): Promise<SocialDefaults> {
  try {
    const file = await query<{ social?: SocialDefaults }>('content/globals/social-defaults', root)
    return file.content.social ?? {}
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {}
    throw error
  }
}
