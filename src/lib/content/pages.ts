/**
 * The one mapping from a public URL to the content file behind it.
 *
 * Shared by the public router (`[...slug]`) and the preview target, because they have to agree:
 * preview is pointed at a URL and has to resolve it the way the site would, or it previews a
 * different page than the one being edited.
 *
 * There is nothing to keep it in step with any more. The CMS used to carry a `routes` block
 * declaring this same mapping a second time, which the two could disagree about; it now takes an
 * item's slug to be its path, which is exactly what this does in reverse.
 */

/** The content slug for a public path. `''` is the homepage. */
export function pageContentSlug(path: string): string {
	const clean = path.replace(/^\/+|\/+$/g, '');

	if (!clean) return 'content/pages/index';

	// Tolerated on purpose: with no `routes` declared the CMS falls back to sending the bare item
	// slug, and a future config might send a full content path. Accepting both means the preview
	// keeps working either way rather than resolving `content/pages/content/pages/index`.
	if (clean.startsWith('content/')) return clean;

	return `content/pages/${clean}`;
}

/**
 * The public path for a content slug — `pageContentSlug` read backwards.
 *
 * Needed because links now run the other way too: a gallery is a page, so building a link to one
 * starts from the item's slug rather than from a URL somebody typed. `index` is the homepage, and a
 * nested `index` is its folder, which is the same rule the forward direction applies.
 *
 * Encoded per segment rather than with one `encodeURI`, so the separators stay separators. A slug is
 * chosen in the editor and is usually tame, but nothing forces it to be: a `#` in one would
 * otherwise turn everything after it into a fragment and the link would quietly land elsewhere.
 */
export function pagePath(slug: string): string {
	const clean = slug
		.replace(/^content\/pages\//, '')
		.replace(/^\/+|\/+$/g, '')
		.replace(/(^|\/)index$/, '');

	return `/${clean.split('/').filter(Boolean).map(encodeURIComponent).join('/')}`;
}

/**
 * Whether a path is safe to turn into a filename.
 *
 * The slug arrives from a URL, and the SDK joins it under `__commitpress__/`, so `..` would walk
 * out of the content directory.
 */
export function isSafeContentPath(path: string): boolean {
	return !path.split('/').includes('..');
}
