/**
 * A gallery's photographs, read from the media library's folders.
 *
 * commitpress has no gallery content type and deliberately does not want one: a folder is already
 * "an ordered set of photographs sharing a name", which is the whole of what a gallery *contains*.
 * The SDK's `assets({ folder })` makes that set readable from a build, so nothing is copied into a
 * collection to mirror it. Filing a photograph under `galleries/weddings/frida-och-marcus` in the
 * CMS is the entire act of putting it in that gallery.
 *
 * What a folder is *not* is a page. Which folders are published, under what URL and title, is a
 * page written against the `gallery` schema — see `pages.server.ts`. This module answers only "what
 * is in this folder"; that one answers "is this folder a gallery anyone can reach".
 *
 * The division of labour is worth stating, because two things could each answer the whole question
 * and only one of them should:
 *
 * - **The SDK says which assets a folder holds, and in what order.** That is the new capability and
 *   the only thing read from it here.
 * - **`media/assets.server.ts` says how to render one.** It already reads the descriptors, already
 *   caches them, and `imageSources` already encodes which renditions this site is willing to serve
 *   (not `original` — see the note there). Rebuilding any of that from the SDK's resolved URLs would
 *   give this site a second, subtly different opinion about the same photograph.
 *
 * So the SDK's URLs are not used at all: its answer is a list of ids, and the existing pipeline turns
 * those into `srcset`s. `storage.public_url` in `commitpress.config.json` still has to be set,
 * because the SDK refuses to build a library it cannot address — it points at this site's own media
 * route, which is where `mediaUrl` points too, so the two cannot disagree.
 *
 * ## Two limits inherited from folders
 *
 * Both are upstream's, recorded here because they are visible to whoever edits the site:
 *
 * - **Order is upload order until a page arranges one.** The folder itself has no sequence and is
 *   asked for as `stored` below, which is exactly that; a curated order is held by the gallery
 *   *field*, in the page's own content file, and is applied here by `galleryOrder`. Two pages over
 *   one folder may therefore disagree, deliberately — arranging one is an editorial decision about
 *   that page rather than a write to the media catalogue.
 * - **There is no draft state.** Every other read in the SDK defaults drafts-off; an asset has no
 *   equivalent, so a photograph is live the moment it is filed under a folder a published page
 *   names. The page is where the draft state is: an unpublished gallery page keeps its whole folder
 *   unreachable, which is the thing to know before uploading into one.
 */
import {
	assets,
	galleryFolder,
	galleryOption,
	galleryOrder,
	type GalleryValue
} from '@commitpress/sdk';
import { imageManifest } from '$lib/media/assets.server';
import type { ImageManifest } from '$lib/media/assets';
import type { PageContent } from '../../commitpress.generated';
// `GALLERY_ROOT` and the relative form live in `href.ts` rather than here so that a caller outside a
// server module can normalise a stored folder without importing this one.
import { GALLERY_ROOT, galleryPath } from './href';

/** One photograph in a gallery. Dimensions are the intrinsic ones, for the grid's aspect ratios. */
export interface GalleryPhoto {
	id: string;
	/**
	 * The library's own description, and empty when nobody has written one.
	 *
	 * Not substituted with the filename when it is missing: an empty `alt` means "decorative" to a
	 * screen reader, which is wrong here but quiet, whereas `HejFoto_LoEla-0643.jpg` read aloud is
	 * wrong and loud. Filling these in in the CMS is what makes a gallery accessible.
	 */
	alt: string;
	width: number;
	height: number;
	/**
	 * What the editor marked this photograph as in the gallery field, lowercased, or `''`.
	 *
	 * One of the words the field's schema declares — `upright`, `landscape` — and the CMS offers
	 * exactly those, so this is not free text. It is carried as the word rather than as a ratio
	 * because deciding what a word looks like is the grid's job, not this module's: `GalleryGrid`
	 * maps it, the lightbox ignores it, and adding a third word to the schema is then one line in
	 * one component.
	 *
	 * Lowercased because the label and the value are typed separately in the CMS and an option can
	 * be saved with a capitalised value — `Landscape` is what this site's own schema holds today.
	 * A page must not lay itself out differently because of the shift key.
	 *
	 * `''` is the ordinary state: unmarked photographs keep their real proportions, which is what
	 * every gallery did before the field could mark anything.
	 */
	option: string;
}

/** A stored folder with the slashes tidied off either end, which is how it reaches the library. */
function trimFolder(stored: string): string {
	return (stored ?? '').trim().replace(/^\/+|\/+$/g, '');
}

/**
 * Whether a path is one this is willing to look up.
 *
 * It arrives from a URL and from page content, and it reaches the SDK as a folder name — which the
 * SDK compares against stored folders rather than joining onto a path, so this is not a traversal
 * guard so much as a refusal to pretend that `../../etc` is a gallery someone meant.
 */
function isSafePath(path: string): boolean {
	if (!path || path.startsWith('/') || path.endsWith('/')) return false;
	const segments = path.split('/');
	return segments.every((segment) => segment && segment !== '.' && segment !== '..' && !segment.includes('\\'));
}

function toPhoto(asset: { id: string; alt: string; width: number; height: number }): GalleryPhoto {
	return { id: asset.id, alt: asset.alt, width: asset.width, height: asset.height, option: '' };
}

/**
 * The photographs in one gallery.
 *
 * Deliberately *not* recursive, which is what makes nesting work. Galleries are grouped —
 * `brollop/loela`, `brollop/anna-erik` — so `galleries/brollop` is a shelf rather than a gallery,
 * and a recursive read of it would return every wedding at once. One rule covers both: a gallery is
 * the folder the photographs are actually in, and a folder holding only other folders is not one.
 */
async function photosIn(folder: string): Promise<GalleryPhoto[]> {
	const found = await assets({ folder, recursive: false, sort: 'stored' });
	// A descriptor with no usable dimensions cannot be laid out by the justified grid, which sizes
	// every tile from its aspect ratio. Dropping it loses one photograph; keeping it divides by zero
	// and collapses the row it lands in.
	return found.filter((asset) => asset.width > 0 && asset.height > 0).map(toPhoto);
}

/**
 * The photographs a gallery page publishes, with their descriptors.
 *
 * Takes the field's value exactly as the page holds it, which is now two shapes rather than one: a
 * bare folder string is every gallery written before the library learned to arrange one, and the
 * object adds the author's `order`. `galleryFolder()` reads the folder out of either — from the SDK
 * rather than by hand, so there is one answer to what a gallery field means. Absolute or relative to
 * `GALLERY_ROOT` is a second, older pair of forms and is `galleryPath`'s job.
 *
 * **The author's order is honoured**, by `galleryOrder()` rather than by the SDK's `gallery()`,
 * which is the same rule with a folder read in front of it. The folder read is the part this file
 * cannot delegate: a stored value may be absolute or relative to `GALLERY_ROOT`, and `galleryPath`
 * is what settles that. So the folder is resolved here, as it always was, and only the sequence
 * comes from the SDK.
 *
 * The order is a preference and not a filter — an id the folder no longer holds falls out, and a
 * photograph uploaded since somebody last arranged the page is appended rather than hidden. Which
 * is why the dimension filter above runs *first*: a descriptor the grid cannot lay out is dropped
 * whether or not the order names it.
 *
 * An empty result is not an error here and the route does not 404 it: unlike the old folder-derived
 * URL, this page exists because an editor made it, so a folder that is empty or misspelled should
 * render as the page it is, with nothing in it, rather than as "no such page". The editor is looking
 * at their own page and can see what is wrong with it.
 */
export async function loadGalleryFolder(
	stored: GalleryValue
): Promise<{ photos: GalleryPhoto[]; media: ImageManifest }> {
	// Under `galleries/` by construction: `galleryPath` makes the stored value relative to the root
	// whichever of its two forms it is in, and this puts the root back. Which is the whole of the
	// rule — a gallery *page* publishes a gallery, and `GALLERY_ROOT` is what "a gallery" means.
	return loadFolder(stored, `${GALLERY_ROOT}/${galleryPath(galleryFolder(stored))}`);
}

/**
 * The photographs in any folder of the media library, for a `gallery_grid` block.
 *
 * The same read as `loadGalleryFolder` with the root rule taken off, and that difference is the
 * point of the block rather than an oversight. A gallery *page* publishes a gallery, so its field is
 * rooted at `galleries/` — the library's other folders are page furniture (`hero`, `headers`,
 * `sections/…`) and a page that put them on a public index would be publishing the site's own
 * chrome. A `gallery_grid` is a section *within* a page, and the furniture is exactly what an editor
 * may want a grid of: the folder behind a services section, a set of headers, a shoot that is not a
 * wedding.
 *
 * So the stored value is taken as a **full library path**, verbatim. That is already what the
 * `gallery` control writes — see the note in `href.ts` — and with no root configured on this field
 * there is no prefix to add or strip. `galleryPath` is deliberately not called: it would turn
 * `galleries/weddings/loela` into `weddings/loela`, which names nothing.
 *
 * Everything after the folder read is shared, so order, marks, the dimension filter and the
 * empty-is-not-an-error rule are the gallery page's, unchanged.
 */
export async function loadLibraryFolder(
	stored: GalleryValue
): Promise<{ photos: GalleryPhoto[]; media: ImageManifest }> {
	return loadFolder(stored, trimFolder(galleryFolder(stored)));
}

/**
 * One folder's photographs, arranged and marked by the value that named it.
 *
 * The half the two readers share: they disagree only about which folder a stored value means, and
 * agree about everything that happens once it is known.
 */
async function loadFolder(
	stored: GalleryValue,
	folder: string
): Promise<{ photos: GalleryPhoto[]; media: ImageManifest }> {
	if (!isSafePath(folder)) return { photos: [], media: {} };

	/**
	 * The order and the marks come out of the same stored value, and both are keyed by asset id.
	 *
	 * Applied here rather than in the component for the reason the order is: the field is the page's
	 * content and the grid is handed photographs, so a component that had to be given the field as
	 * well would be a second place that knows what a gallery value looks like.
	 *
	 * A mark for an id the folder no longer holds simply never matches, which is the same
	 * preference-not-filter rule the order follows — nothing has to prune it.
	 */
	const photos = galleryOrder(stored, await photosIn(folder)).map((photo) => ({
		...photo,
		option: galleryOption(stored, photo.id).toLowerCase()
	}));

	return {
		photos,
		media: await imageManifest(photos.map((photo) => photo.id))
	};
}

/**
 * The photographs behind every `gallery_grid` block on a page.
 *
 * The block is a gallery page's grid placed *inside* an ordinary page: same folder-shaped field,
 * same justified rows, same viewer — only with a heading above it and other blocks around it. What
 * it is not is a `photo_grid`, which holds a hand-picked list of images and therefore travels
 * entirely as page content. A folder is a name, and a name only becomes photographs by reading the
 * media index, which is why this exists at all and why it is a server module.
 *
 * Keyed by the block's **position** rather than by its folder, because two blocks may legitimately
 * publish the same folder — a page that shows a set twice is an editorial choice, not a mistake —
 * and `Blocks` hands each block its own index anyway. Blocks that are not gallery grids simply have
 * no entry.
 *
 * The manifests are merged into one, matching what the page load already does for image fields: a
 * descriptor is looked up by asset id, so one map covers every block on the page and a photograph
 * appearing in two of them is resolved once. Merging is safe for the same reason — the same id
 * always resolves to the same descriptor.
 *
 * An empty or misspelled folder yields an empty list rather than an error, which is
 * `loadGalleryFolder`'s rule and the right one here too: the block renders as the heading it is,
 * with nothing under it, and the editor can see what is wrong with their own page.
 */
export async function loadGalleryGrids(
	blocks: PageContent['blocks']
): Promise<{ photos: Record<number, GalleryPhoto[]>; media: ImageManifest }> {
	const found = await Promise.all(
		blocks.map(async (block, index) => {
			if (!('gallery_grid' in block)) return null;
			// Any folder, not only a gallery — see `loadLibraryFolder`.
			const loaded = await loadLibraryFolder(block.gallery_grid.gallery ?? '');
			return { index, ...loaded };
		})
	);

	const photos: Record<number, GalleryPhoto[]> = {};
	let media: ImageManifest = {};

	for (const entry of found) {
		if (!entry) continue;
		photos[entry.index] = entry.photos;
		media = { ...media, ...entry.media };
	}

	return { photos, media };
}
