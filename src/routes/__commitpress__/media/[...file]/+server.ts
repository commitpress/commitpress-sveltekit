/**
 * Serves the commitpress media directory.
 *
 * `__commitpress__/media` is written by the CMS, so it lives outside `static/` — a file committed by
 * the editor must not have to be copied into the build to become reachable. That also puts it
 * outside everything this stack serves by default: Vite's dev server only serves `static/`, and the
 * production adapter only serves what `vite build` emitted.
 *
 * This is a route rather than middleware on the Express server in `server.ts` because that server
 * does not exist in dev — `vite dev` never loads it. Mounting it there would serve these images in
 * the deploy and 404 them locally, which reads as a broken image path rather than a missing route.
 * A route is handled the same way in both modes, so there is one definition and it cannot drift.
 */
import { error } from '@sveltejs/kit';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import path from 'node:path';
import type { RequestHandler } from './$types';

/**
 * Anchored to `process.cwd()`, matching the generated commitpress query, which resolves its own
 * `__root` as `resolve(process.cwd(), '')`. Content reads already depend on the process running
 * from the repo root; using the same anchor means the two cannot disagree about where the repo is.
 */
const mediaDir = path.resolve(process.cwd(), '__commitpress__', 'media');

/**
 * Only what the CMS actually writes into this directory: the image variants it generates, plus the
 * `asset.json` beside them. An allow-list rather than a general mime lookup, so a file that lands
 * here by accident is not handed to a browser with an inviting content type.
 */
const CONTENT_TYPES: Record<string, string> = {
	'.webp': 'image/webp',
	'.jpg': 'image/jpeg',
	'.jpeg': 'image/jpeg',
	'.png': 'image/png',
	'.svg': 'image/svg+xml',
	'.json': 'application/json'
};

export const GET: RequestHandler = async ({ params, request }) => {
	const requested = params.file;
	if (!requested) throw error(404, 'Not found');

	// The path segment is user input, so resolve first and confirm the result is still inside the
	// media directory. `..` in a URL is normalised by most clients but not all, and never by a
	// handwritten request — without this check it would read any file the process can reach.
	const filePath = path.resolve(mediaDir, requested);
	if (filePath !== mediaDir && !filePath.startsWith(mediaDir + path.sep)) {
		throw error(404, 'Not found');
	}

	const contentType = CONTENT_TYPES[path.extname(filePath).toLowerCase()];
	if (!contentType) throw error(404, 'Not found');

	const stats = await stat(filePath).catch(() => null);
	if (!stats?.isFile()) throw error(404, 'Not found');

	// Strong rather than weak, because SvelteKit's own 304 shortcut compares the request's value
	// against this one after stripping a `W/` from the *request* alone — so a weak tag here can never
	// match what a browser echoes back. Answered before the stream is opened, which is the other half
	// of doing it here: a `Response` built around a `createReadStream` and then discarded in favour of
	// a 304 leaves the descriptor open until it is collected.
	const etag = `"${stats.size}-${Math.floor(stats.mtimeMs)}"`;
	const cache = cacheControl(contentType);

	if (request.headers.get('if-none-match') === etag) {
		return new Response(null, { status: 304, headers: { etag, 'cache-control': cache } });
	}

	return new Response(Readable.toWeb(createReadStream(filePath)) as ReadableStream, {
		headers: {
			'content-type': contentType,
			'content-length': String(stats.size),
			'cache-control': cache,
			...(contentType === 'image/svg+xml' ? { 'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox" } : {}),
			// So revalidating the descriptor costs a 304 rather than a re-download. Free, since the
			// stat it is built from has already happened.
			etag
		}
	});
};

/**
 * How long a file under `media/` may be held, which depends entirely on whether the CMS ever
 * rewrites it in place.
 *
 * **`asset.json` is rewritten**, and this header used to say it was not. Re-cropping calls the CMS's
 * `replaceRenditions`, which writes new renditions and a new descriptor under the *same* asset id —
 * so `immutable` here meant a browser that had once loaded the descriptor kept the old list of
 * variants for a year. In the editor's live preview that is a re-crop appearing to do nothing: the
 * component fetches the descriptor for a freshly picked id, gets the cached one back, resolves the
 * pin against it and renders the picture that was there before. No request fails, so nothing says
 * why.
 *
 * The image files stay long-lived, because `mediaUrl` now stamps every rendition URL with the
 * asset's revision (`?v=`) — see `assetRevision` in `$lib/media/assets`. That is what makes the
 * claim true rather than merely asserted: a re-cut rendition is a different URL, so the bytes at any
 * one URL genuinely never change.
 */
function cacheControl(contentType: string): string {
	return contentType === 'application/json'
		? 'public, max-age=0, must-revalidate'
		: 'public, max-age=31536000, immutable';
}
