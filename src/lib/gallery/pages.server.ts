/**
 * The pages that publish a gallery.
 *
 * A gallery has two halves and they live in different places. The **photographs** are a folder in
 * the media library, as they always were — filing a photograph under `galleries/weddings/…` is still
 * the whole act of putting it in the gallery. What is new is that the folder no longer implies a
 * page: a gallery is published by writing a page against the `gallery` schema, whose one field names
 * the folder to read.
 *
 * That inverts how links are built. A folder used to be enough to construct a URL from; now it is a
 * key that has to be *matched against the pages that exist*, which is what this module does. The
 * consequences are worth stating, because they are the point of the design rather than side effects:
 *
 * - **The editor owns the URL.** It is the page's slug, so a gallery can sit at
 *   `/brollop/frida-och-marcus` — under the wedding page it belongs to — rather than in a parallel
 *   `/galleri/` tree that mirrored the library's folder names.
 * - **A gallery can be a draft.** Folders have no draft state; pages do. An unpublished gallery page
 *   is not listed and not addressable, and `queryList` drops it here without being asked to.
 * - **A folder with no page is not a gallery.** It is uploaded photographs and nothing else, and
 *   `galleryLinks` has no entry for it.
 *
 * Nothing renders through this at the moment: the `gallery` block's tiles carry a link the editor
 * picked rather than a folder to resolve, and the `galleries` block that did the folder→URL lookup
 * is gone from the schema. What remains is the lookup itself, which is the piece a folder-addressed
 * block would need again — `slugTitle` below is what the routes still use.
 */
import { galleryFolder, queryList, type ContentFile } from '@commitpress/sdk';
import { pagePath } from '$lib/content/pages';
import { galleryPath } from './href';
import type { GalleryContent } from '../../commitpress.generated';

/** The schema name, as the editor writes it into a content file's envelope. */
const GALLERY_SCHEMA = 'gallery';

/** Where the pages live, as `queryList` takes it. */
const PAGES = 'content/pages';

export interface GalleryPageRef {
	/** The content slug, which is also the page's public path: `brollop/frida-och-marcus`. */
	slug: string;
	/** That slug as a URL. */
	href: string;
	/** The library folder this page publishes, relative to `GALLERY_ROOT`. */
	folder: string;
	/** The page's own title, from its seo group, or the slug read as words. */
	title: string;
}

/**
 * A page's folder as a heading: `brollop/frida-och-marcus` → `Frida och marcus`.
 *
 * The last segment only, and deliberately dumb — it uppercases the first letter and stops, because
 * a page slugged `id-foto` should not become `Id Foto`. An editor who wants better than this writes
 * an seo title, which wins.
 */
export function slugTitle(slug: string): string {
	const last = slug.split('/').filter(Boolean).pop() ?? slug;
	const words = last.replace(/[-_]+/g, ' ').trim();
	return words.charAt(0).toUpperCase() + words.slice(1);
}

function isGalleryPage(file: ContentFile<unknown>): file is ContentFile<GalleryContent> {
	return file.schema === GALLERY_SCHEMA;
}

/**
 * Every published gallery page.
 *
 * Read on demand rather than cached, matching how the rest of the site reads content: `query()`
 * goes to disk on every request, so an edit committed by the CMS is live on the next one without a
 * restart. The cost is a read of the pages directory for a page that carries a gallery block — a
 * dozen small files, on the same disk the page itself was just read from.
 */
export async function galleryPages(): Promise<GalleryPageRef[]> {
	const files = await queryList<unknown>(PAGES);

	return files.filter(isGalleryPage).flatMap((file) => {
		// `groups_flatten_singles` is off for this group, so the field is `gallery.gallery`: the group
		// named `gallery` holding the control named `gallery`. Both are optional in the generated type
		// because neither is required in the schema — a page saved before the folder was picked has the
		// group but no value in it. `galleryFolder` reads the folder out of both stored shapes; see
		// the note on it in `loadGalleryFolder`.
		const folder = galleryPath(galleryFolder(file.content.gallery?.gallery));
		if (!folder) return [];

		return [
			{
				slug: file.slug,
				href: pagePath(file.slug),
				folder,
				title: file.content.seo?.title || slugTitle(file.slug)
			}
		];
	});
}

/**
 * Where each published folder is addressable, keyed by folder.
 *
 * The shape the blocks need: they hold a folder and want a URL, and a lookup that misses is exactly
 * the "no page publishes this folder" case they have to handle anyway.
 *
 * Two pages naming one folder is not an error — an editor may legitimately republish the same set
 * somewhere else — so the first one wins and the second simply does not become the link target.
 * Nothing here needs to detect it; the folder is still reachable.
 */
export async function galleryLinks(): Promise<Record<string, string>> {
	const pages = await galleryPages();

	const links: Record<string, string> = {};
	for (const page of pages) {
		links[page.folder] ??= page.href;
	}

	return links;
}
