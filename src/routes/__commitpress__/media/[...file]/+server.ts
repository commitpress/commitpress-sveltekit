import { error } from '@sveltejs/kit';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import path from 'node:path';
import type { RequestHandler } from './$types';

const mediaDir = path.resolve(process.cwd(), '__commitpress__', 'media');

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

	const filePath = path.resolve(mediaDir, requested);
	if (filePath !== mediaDir && !filePath.startsWith(mediaDir + path.sep)) {
		throw error(404, 'Not found');
	}

	const contentType = CONTENT_TYPES[path.extname(filePath).toLowerCase()];
	if (!contentType) throw error(404, 'Not found');

	const stats = await stat(filePath).catch(() => null);
	if (!stats?.isFile()) throw error(404, 'Not found');

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
			etag
		}
	});
};

function cacheControl(contentType: string): string {
	return contentType === 'application/json'
		? 'public, max-age=0, must-revalidate'
		: 'public, max-age=31536000, immutable';
}
