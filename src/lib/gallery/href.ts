/**
 * The folder galleries live under.
 *
 * A prefix rather than "every folder", because the library also holds working folders — `hero`,
 * `headers` — that are page furniture rather than a gallery anyone would browse. Publishing those as
 * galleries would put the site's own chrome on a public index.
 *
 * It lives here rather than in `galleries.server.ts` because `galleryPath` below is imported from
 * components, which cannot reach a server module.
 */
export const GALLERY_ROOT = 'galleries';

/**
 * A folder as the editor stored it, expressed relative to `galleries/`.
 *
 * The `gallery` control writes the **full** library path — `galleries/brollop/anna-erik` — because
 * that is the path that keeps meaning the same folder if a schema's root is ever edited. Everything
 * downstream works in paths relative to `GALLERY_ROOT`, since that is also what the URL carries, so
 * this is where the two meet. The bare form is accepted as well: it is what a hand-typed value
 * looked like before the control existed, and both name the same folder.
 *
 * Idempotent on purpose — a value that has already been made relative passes through unchanged, so
 * every caller can normalise without knowing which form it was given. It is also what makes the
 * folder a usable *key*: the link lookup and the pages it is matched against have to agree on one
 * spelling of the same folder.
 */
export function galleryPath(stored: string): string {
	const clean = (stored ?? '').trim().replace(/^\/+|\/+$/g, '');
	if (clean === GALLERY_ROOT) return '';
	return clean.startsWith(`${GALLERY_ROOT}/`) ? clean.slice(GALLERY_ROOT.length + 1) : clean;
}

/**
 * ## Where the URL went
 *
 * There used to be a `galleryHref` here that turned a folder into `/galleri/<folder>`, and a pair of
 * routes under `/galleri` to receive it. Both are gone: a gallery is now a **page** in the CMS
 * written against the `gallery` schema, and its URL is that page's slug like any other page's.
 *
 * So a folder no longer implies a URL, and a link to a gallery cannot be built from a folder path
 * alone — it has to be looked up against the pages that exist, which is what `pages.server.ts` does.
 * A folder no page points at is simply not addressable.
 *
 * The blocks stopped asking either question. A `gallery` tile now carries a link the editor picked
 * in the CMS, so the URL arrives already resolved and no folder is involved in getting there. What
 * `galleryPath` is still for is the gallery page's own field — the one folder whose photographs the
 * page publishes.
 */
