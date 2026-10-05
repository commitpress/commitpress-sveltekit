/**
 * Resolving the asset ids a page references, at load time.
 *
 * The point of doing this on the server is that `<img>` needs its `src`, `width` and `height` in
 * the HTML that first paints. Resolving in the browser would mean a request per image after hydration,
 * and a hero that reserves no space until it lands.
 *
 * The SDK has no media API — it reads content, and an image field's content is the bare id — so the
 * descriptors are read off disk here, from the same directory the media route serves.
 */
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import type { ImageAsset, ImageManifest } from './assets';

/**
 * Anchored to `process.cwd()`, matching the media route and the generated query. All three have to
 * agree about where the repository is or they disagree about which file a URL means.
 */
const imagesDir = path.resolve(process.cwd(), '__commitpress__', 'media', 'images');

/**
 * What an asset id looks like: `Date.now()` at upload, so 13 digits today and 10 or more for as
 * long as this matters.
 *
 * Used to decide which strings in a page's content are worth a stat. The alternative is walking the
 * schema to find which fields are declared `image`, which means the walk has to be taught about
 * every nesting rule the schema language has, and re-taught whenever one changes. Matching the id
 * shape needs no schema at all, and a false positive costs one failed read and is then ignored —
 * whereas a schema walk that falls behind silently stops resolving a real field.
 */
const ASSET_ID = /^[0-9]{10,}$/;

/**
 * Successful reads only, keyed by id and **validated against the file's mtime**.
 *
 * This used to be a plain `id → asset` map held for the life of the process, on the grounds that an
 * asset's files never change because a re-crop is written under a new id. That is not what the CMS
 * does: `replaceRenditions` rewrites the renditions and the descriptor under the *same* id. So a
 * long-running server — the deploy, and a `vite dev` left open all afternoon — went on serving the
 * pre-crop descriptor to every render until it was restarted, which is the server-side half of a
 * re-crop appearing to do nothing.
 *
 * The stat is the price of correctness here and it is a small one: it is one syscall against a file
 * this was about to read anyway, and it saves the parse and the read on a hit.
 *
 * A *miss* is still not cached: in preview an id can be referenced before its upload has landed, and
 * a cached `null` would keep that image broken until a restart.
 */
const cache = new Map<string, { mtimeMs: number; asset: ImageAsset }>();

async function readImageAsset(id: string): Promise<ImageAsset | null> {
	// `id` reaches here from committed content, but it still ends up in a filesystem path, and the
	// same `..` argument the media route makes applies. The id shape check is the guard; this is the
	// belt to its braces.
	if (!ASSET_ID.test(id)) return null;

	const file = path.join(imagesDir, id, 'asset.json');

	const stats = await stat(file).catch(() => null);
	if (!stats?.isFile()) return null;

	const cached = cache.get(id);
	if (cached && cached.mtimeMs === stats.mtimeMs) return cached.asset;

	const raw = await readFile(file, 'utf8').catch(() => null);
	if (raw === null) return null;

	try {
		const asset = JSON.parse(raw) as ImageAsset;
		// A descriptor with no id is not one this can render, and `id` is what everything keys on.
		if (!asset?.id) return null;
		cache.set(id, { mtimeMs: stats.mtimeMs, asset });
		return asset;
	} catch {
		// A malformed descriptor is a broken image, not a broken page: the section falls back to what
		// it renders when a slide has no image at all.
		return null;
	}
}

/** Every id-shaped string anywhere in a content object. */
function collectImageIds(value: unknown, into: Set<string> = new Set()): Set<string> {
	if (typeof value === 'string') {
		if (ASSET_ID.test(value)) into.add(value);
		return into;
	}
	if (Array.isArray(value)) {
		for (const item of value) collectImageIds(item, into);
		return into;
	}
	if (value && typeof value === 'object') {
		for (const item of Object.values(value)) collectImageIds(item, into);
	}
	return into;
}

/**
 * The descriptors for every asset a page's content references.
 *
 * Ids that resolve to nothing are simply absent from the result — a reference to a deleted asset
 * renders as no image rather than as a broken one, and never as a failed page.
 */
export async function imageManifest(content: unknown): Promise<ImageManifest> {
	const ids = [...collectImageIds(content)];
	const assets = await Promise.all(ids.map(readImageAsset));

	const manifest: ImageManifest = {};
	ids.forEach((id, i) => {
		const asset = assets[i];
		if (asset) manifest[id] = asset;
	});

	return manifest;
}
