<script lang="ts">
	/**
	 * A gallery proper: photographs in justified rows with nothing written over them.
	 *
	 * Distinct from `Gallery`, which is the curated teaser — a handful of tiles in mixed spans with a
	 * heading and a link out. This is the page that link leads to, so it is regular where the teaser is
	 * composed, and is expected to hold tens or hundreds of items rather than five.
	 *
	 * ## Why the rows and not a grid
	 *
	 * This block mixes upright and landscape frames, and an even grid cannot hold both: with one
	 * column width, a landscape frame is two-thirds the height of an upright one, so every row a
	 * landscape lands in leaves a band of empty page under it. Cropping everything to one ratio would
	 * close the gaps by overriding the photographer's framing, which is the wrong trade on a page whose
	 * whole content is the photographs.
	 *
	 * So: the same justified rows as `GalleryGrid`, where each tile's flex *basis and grow are both
	 * proportional to its aspect ratio*. That makes the tiles in a row come out at a common height
	 * while their widths stay in proportion to their shapes — nothing is cropped, the order is the
	 * order, and it costs no script because the two ratios are known from `orientation` on the server.
	 * The `::after` absorbs the last row's slack, which otherwise stretches a final lone photograph
	 * across the full width at several times the height of every row above it.
	 *
	 * Every tile is lazy by way of `Frame`'s default, which is the property that makes a long gallery
	 * affordable: the browser fetches the few screens' worth it needs and leaves the rest, and each
	 * `<img>` carries the intrinsic size of its largest rendition so the page reserves the space
	 * without them.
	 *
	 * ## The viewer
	 *
	 * With the block's `gallery` box ticked, the tiles become links into the same full-screen
	 * `Lightbox` a gallery page uses — arrows, filmstrip, swipe, and back to close. The difference is
	 * where the photographs come from: a gallery page publishes a whole media-library folder, while
	 * this one publishes exactly what the editor picked, in the order they picked it. That is the
	 * point of the box — a curated set that behaves like a gallery without being one.
	 *
	 * The tiles stay cropped to their chosen orientation either way. Ticking the box adds a way in; it
	 * is not meant to rearrange the page underneath. The viewer shows each photograph whole, at its
	 * real proportions, which are the library's rather than the editor's choice of crop.
	 */
	import Frame from '$lib/components/Frame.svelte';
	import Lightbox from '$lib/gallery/Lightbox.svelte';
	import { createViewer } from '$lib/gallery/viewer.svelte';
	import { reveal } from '$lib/actions/reveal';
	import { imageSources, type ImageManifest } from '$lib/media/assets';
	import { imageAlt, imageId } from '@commitpress/sdk/image';
	import type { GalleryPhoto } from '$lib/gallery/galleries.server';
	import type { PhotoGridBlock } from '../../commitpress.generated';

	let {
		block,
		media = {},
		/**
		 * This block's position on the page, which names its viewer. Two `photo_grid` blocks on one
		 * page each need their own, or opening either would open both — see `createViewer`.
		 */
		index = 0
	}: { block: PhotoGridBlock; media?: ImageManifest; index?: number } = $props();

	// Read once on purpose, which is what the warning is about: `Blocks` keys its list by position, so
	// the component at position 3 is only ever handed a 3. A block that moved in the CMS arrives as a
	// remount with a new name, not as a new prop on the old instance.
	// svelte-ignore state_referenced_locally
	const viewer = createViewer(`photo-grid-${index}`);

	/**
	 * The photographs the viewer can show, and where each tile sits among them.
	 *
	 * Not simply the items: a tile with nothing picked yet, or one pointing at an asset that has since
	 * been deleted, has no photograph to show and stays a plain tile. So the two lists are kept
	 * together — `photos` is what the viewer pages through, and `at[i]` is the position tile `i` opens
	 * at, or `null` for a tile that opens nothing.
	 *
	 * Dimensions come from the library rather than from `orientation`, because the viewer shows the
	 * photograph uncropped and needs its real ratio to letterbox it. An asset with no usable size is
	 * dropped for the same reason `galleries.server` drops one: the viewer divides by its height.
	 *
	 * The same photograph picked twice maps both tiles to one entry rather than two. `Lightbox` keys
	 * its filmstrip by asset id, so two entries sharing an id is not a duplicate in the strip — it is
	 * a crash.
	 */
	const opened = $derived.by(() => {
		const photos: GalleryPhoto[] = [];
		const at: Array<number | null> = [];
		const seen = new Map<string, number>();

		for (const item of block.items) {
			// Keyed on the id the *field* stores rather than the one inside the descriptor, because that
			// is the key the manifest is built under and the key `Lightbox` looks its asset up by.
			//
			// Read through `imageId` rather than used as it stands: this field pins renditions, so its
			// value is an object wherever an editor pinned one, and indexing the manifest with an
			// object finds nothing — every pinned photograph silently stopped opening in the viewer.
			const id = block.gallery ? imageId(item.image) : '';
			const asset = id ? media[id] : undefined;
			if (!id || !asset || asset.width <= 0 || asset.height <= 0) {
				at.push(null);
				continue;
			}

			const already = seen.get(id);
			if (already !== undefined) {
				at.push(already);
				continue;
			}

			seen.set(id, photos.length);
			at.push(photos.length);
			// The description this tile overrides the library with, if any, and the library's otherwise
			// — the same order `ResponsiveImage` resolves. It used to be a field beside the picture,
			// which meant describing the same photograph again on every page it appeared on.
			photos.push({
				id,
				alt: imageAlt(item.image) || asset.alt,
				width: asset.width,
				height: asset.height,
				// The same two words a gallery page's field marks its photographs with, arrived at from
				// this block's own per-item field instead. Carried for consistency rather than used:
				// the viewer shows every photograph whole, at the library's proportions, which is why
				// the tiles above read `item.orientation` and the entries here do not.
				option: item.orientation
			});
		}

		return { photos, at };
	});

</script>

<section id="bilder" class="wrap py-20 md:py-28 lg:py-32">
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

	<!--
		The photograph itself, which is the same either way — only what wraps it changes. `Frame` keeps
		the ratio and the reveal; the wrapper is the flex item the row is built from.
	-->
	{#snippet photo(item: PhotoGridBlock['items'][number], landscape: boolean)}
		<!-- No `alt` passed: the description comes off the asset, or off the field where the editor
		     overrode it for this placement. -->
		<Frame
			ratio={landscape ? 'aspect-[3/2]' : 'aspect-[3/4]'}
			image={item.image}
			{media}
		/>
	{/snippet}

	<div class="justified">
		{#each block.items as item, i (i)}
			{@const landscape = item.orientation === 'landscape'}
			{@const at = opened.at[i] ?? null}
			{#if at === null}
				<div class="tile" class:tile-landscape={landscape}>
					{@render photo(item, landscape)}
				</div>
			{:else}
				<!--
					A link to the photograph itself, with the viewer layered over it — see `createViewer`.
					`group` is what `app.css` hangs the hover push on, so it belongs on the hovered element
					rather than on the frame inside it.
				-->
				<a
					bind:this={viewer.tiles[at]}
					class="tile group"
					class:tile-landscape={landscape}
					href={imageSources(media[imageId(item.image)])?.src ?? '#'}
					aria-label={opened.photos[at].alt
						? undefined
						: `Visa bild ${at + 1} av ${opened.photos.length}`}
					onclick={(event) => viewer.onTileClick(event, at)}
				>
					{@render photo(item, landscape)}
				</a>
			{/if}
		{/each}
	</div>
</section>

{#if block.gallery && opened.photos.length > 0}
	<Lightbox
		photos={opened.photos}
		{media}
		title={block.heading}
		index={viewer.index}
		onnavigate={viewer.navigate}
		onclose={viewer.close}
	/>
{/if}

<style>
	.justified {
		display: flex;
		flex-wrap: wrap;
		gap: var(--gap);

		/*
		 * The height rows aim for. Everything else follows from it: a tile's basis is this times its
		 * aspect ratio, so a landscape frame asks for more of the row and an upright one for less.
		 *
		 * The phone value is bounded by the narrowest thing that must still fit: two upright tiles,
		 * whose bases plus the gap have to clear the measure inside `wrap`'s padding. Too tall and
		 * they wrap to one per row, which is a different page from the one this block has been.
		 */
		--row: 50vw;
		--gap: 0.75rem;
	}
	@media (min-width: 768px) {
		.justified {
			--row: 15rem;
			--gap: 1.25rem;
		}
	}
	@media (min-width: 1024px) {
		.justified {
			--row: 19rem;
		}
	}
	@media (min-width: 1536px) {
		.justified {
			--row: 22rem;
		}
	}

	/*
	 * Grow *and* basis proportional to the ratio. Widths within a row therefore stay proportional to
	 * the ratios however the slack is shared out, and equal-width-per-ratio is the same statement as
	 * equal height — which is what makes the row a row rather than a ragged strip. The height itself
	 * comes from the `aspect-[…]` utility on the `Frame` inside, so nothing here states it twice.
	 */
	.tile {
		display: block;
		flex: 0.75 1 calc(0.75 * var(--row));
		min-width: 0;
	}
	.tile-landscape {
		flex: 1.5 1 calc(1.5 * var(--row));
	}

	.tile:focus-visible {
		outline: 2px solid #0b0b0b;
		outline-offset: 3px;
		/* The shared focus style is an inset rule, which a photograph sits on top of. */
		box-shadow: none;
	}

	/*
	 * Eats the last row's leftover width so its tiles keep the height of every row above. A plain
	 * `flex-grow` large enough to dwarf any realistic sum of ratios.
	 */
	.justified::after {
		content: '';
		flex-grow: 999999;
	}
</style>
