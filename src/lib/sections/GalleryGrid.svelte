<script lang="ts">
	/**
	 * A gallery page's grid, placed inside an ordinary page.
	 *
	 * The block is `photo_grid` with one field swapped: instead of a hand-picked list of images with a
	 * shape chosen per tile, it names a **folder in the media library** and publishes what is in it.
	 * Everything downstream of that choice is the same — justified rows that honour each photograph's
	 * ratio, lazy tiles, and the full-screen viewer with arrows, filmstrip and swipe.
	 *
	 * *Any* folder, unlike a gallery page, whose field is rooted at `galleries/` because a gallery
	 * page publishes a gallery. A grid is a section within a page, so the library's working folders —
	 * `hero`, `headers`, `sections/…` — are legitimate things to build one from. That is why the two
	 * fields resolve differently; see `loadLibraryFolder`.
	 *
	 * ## What the folder buys, and what it costs
	 *
	 * A `photo_grid` is curated: the editor picks each photograph and says how it should be cropped,
	 * so the page is exactly the sequence they built. A `gallery_grid` is a *set*: filing a photograph
	 * under the folder puts it on the page, and uploading twenty more needs no visit to the page at
	 * all. That is the whole trade — one is composed, the other is published — and it is why both
	 * blocks exist rather than one growing a mode.
	 *
	 * Order and cropping are not lost by it. The gallery field carries both: an order the editor drags
	 * into place, and a per-photograph `upright`/`landscape` mark, held in this page's own content and
	 * applied by `loadGalleryFolder`. Unmarked is the real ratio rather than a third shape — see
	 * `GalleryGrid`, which is the same grid a gallery page draws.
	 *
	 * ## Why the photographs arrive as a prop
	 *
	 * A folder is a name, and turning a name into photographs is a read of the media index — server
	 * only. So the page load resolves every gallery grid on the page up front (`loadGalleryGrids`) and
	 * `Blocks` hands each block its own list. The block is therefore given its photographs the same
	 * way every other block is given its `media`: resolved once per request, in the first paint.
	 *
	 * The viewer is always on, unlike `photo_grid`'s tickbox. A folder of photographs *is* a gallery,
	 * and the box on the other block exists to say "this curated set should behave like one" — which
	 * is not a question here.
	 */
	import GalleryGrid from '$lib/gallery/GalleryGrid.svelte';
	import { reveal } from '$lib/actions/reveal';
	import type { GalleryPhoto } from '$lib/gallery/galleries.server';
	import type { ImageManifest } from '$lib/media/assets';
	import type { GalleryGridBlock } from '../../commitpress.generated';

	let {
		block,
		/** The folder's photographs, resolved by the page load. Empty until a folder is picked. */
		photos = [],
		media = {},
		/**
		 * This block's position on the page, which names its viewer. Two grids on one page each need
		 * their own, or opening either would open both — see `createViewer`.
		 */
		index = 0
	}: {
		block: GalleryGridBlock;
		photos?: GalleryPhoto[];
		media?: ImageManifest;
		index?: number;
	} = $props();
</script>

<section class="wrap py-20 md:py-28 lg:py-32">
	<div class="flex flex-wrap items-end justify-between gap-6 pb-12 md:pb-16">
		<div class="reveal" use:reveal>
			<p class="eyebrow eyebrow-rule mb-5">{block.eyebrow}</p>
			<h2 class="display text-[clamp(1.9rem,3.6vw,3.25rem)]">{block.heading}</h2>
		</div>
		<!-- Optional: a gallery often needs no words beyond its heading. -->
		{#if block.note}
			<p class="reveal max-w-[38ch] text-[15px]" use:reveal>{block.note}</p>
		{/if}
	</div>

	{#if photos.length > 0}
		<!--
			`title` names the viewer rather than being drawn — the heading above is already on the page,
			and the lightbox is a layer over it that needs its own label. The block's heading is the
			closest thing to what the visitor thinks they are looking at.
		-->
		<GalleryGrid {photos} {media} title={block.heading} name={`gallery-grid-${index}`} />
	{:else}
		<!--
			Not an error and not empty markup: an unpicked folder, an empty one, and one renamed in the
			library since it was picked all land here, and all three are things the person editing this
			page can see and fix. A block that rendered nothing at all would read as a broken page.
		-->
		<p class="border-t border-line pt-10 text-ash">Inga bilder i det här galleriet än.</p>
	{/if}
</section>
