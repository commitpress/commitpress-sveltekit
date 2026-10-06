import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { ImageAsset, ImageManifest } from './assets';

function collectImageIds(value: unknown, ids = new Set<string>()): Set<string> {
  if (typeof value === 'string' && /^\d{10,}$/.test(value)) ids.add(value);
  else if (Array.isArray(value)) value.forEach(item => collectImageIds(item, ids));
  else if (value && typeof value === 'object') {
    Object.values(value).forEach(item => collectImageIds(item, ids));
  }
  return ids;
}

/** Resolve only referenced images. Read fresh descriptors so CMS crops appear immediately. */
export async function imageManifest(content: unknown): Promise<ImageManifest> {
  const media: ImageManifest = {};
  for (const id of collectImageIds(content)) {
    const file = path.join(process.cwd(), '__commitpress__', 'media', 'images', id, 'asset.json');
    try {
      media[id] = JSON.parse(await readFile(file, 'utf8')) as ImageAsset;
    } catch (cause) {
      if ((cause as NodeJS.ErrnoException).code !== 'ENOENT') throw cause;
    }
  }
  return media;
}
