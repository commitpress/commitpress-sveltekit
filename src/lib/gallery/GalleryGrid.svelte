<script lang="ts">
	/**
	 * A gallery's photographs, in justified rows, with the viewer over them.
	 *
	 * ## Why the rows are laid out the way they are
	 *
	 * A photographer's gallery mixes upright and landscape frames, and the two usual answers both
	 * cost something real. A fixed grid crops every photograph to one ratio, which is the site's
	 * choice overriding the photographer's. CSS columns keep the ratios but reorder the sequence down
	 * each column, so a gallery meant to be read in order is not.
	 *
	 * These are justified rows instead: every tile's flex *basis and grow are both proportional to its
	 * aspect ratio*, which is what makes the tiles in a row come out at a common height while their
	 * widths stay in proportion to their shapes. Nothing is cropped, the order is the order, and it
	 * costs no script — the ratios are known on the server, so the first paint is already correct and
	 * nothing reflows once the photographs land.
	 *
	 * The `::after` is the last-row rule: without something to absorb the slack, flex would stretch a
	 * final lone photograph across the full width at several times the height of every row above it.
	 *
	 * ## What a mark does to a tile
	 *
	 * The gallery field can mark each photograph `upright` or `landscape` — the words this site's
	 * `gallery` schema declares — and a marked tile is drawn at *that* shape instead of its own,
	 * cropped by `.frame`'s `object-cover`. It is the same statement the `photo_grid` block's
	 * per-image orientation makes, reached from the CMS's own gallery field rather than from a
	 * hand-picked list, so a gallery page and a curated grid of the same photographs now agree.
	 *
	 * **Unmarked is not a third shape, it is the real one.** Marking is an override, so a gallery
	 * nobody has marked lays out exactly as it did before the field could mark anything — which is
	 * also why marking is worth having: on a page where every ratio is honoured, one deliberate crop
	 * is the only way to say "this one is a wide frame" about a photograph the camera did not shoot
	 * that way.
	 *
	 * The **viewer is unaffected**: `photos` keeps each photograph's intrinsic size, so a marked tile
	 * opens to the whole picture at its real proportions. A crop is a decision about the page, not
	 * about the photograph.
	 *
	 * ## Why the tiles are links
	 *
	 * A tile opens the viewer, which is a button's job — but a button with no script is a dead
	 * control, and a gallery is the one page on this site whose whole content would be unreachable if
	 * it were. So each tile is a link to the photograph itself and the viewer is layered over it, in
	 * `createViewer` — which also owns the history entry the index lives in, and the focus that goes
	 * back to a tile when the viewer closes.
	 */
	import { reveal } from '$lib/actions/reveal';
	import ResponsiveImage from '$lib/components/ResponsiveImage.svelte';
	import {
		GALLERY_FULL,
		GALLERY_GRID,
		imageSources,
		type ImageManifest
	} from '$lib/media/assets';
	import Lightbox from './Lightbox.svelte';
	import { createViewer } from './viewer.svelte';
	import type { GalleryPhoto } from './galleries.server';

	let {
		photos,
		media = {},
		title,
		/**
		 * What this grid's viewer is called in history state — see `createViewer`.
		 *
		 * A gallery page holds exactly one grid, so the default is enough to own the state there. A
		 * `gallery_grid` block is the case the prop exists for: two of them on one page would otherwise
		 * share a name, and opening either would open both.
		 */
		name = 'gallery'
	}: {
		photos: GalleryPhoto[];
		media?: ImageManifest;
		title: string;
		name?: string;
	} = $props();

	// Read once on purpose, which is what the warning is about: a block's name is built from its
	// position, and a block that moved in the CMS arrives as a remount rather than as a new prop on
	// the old instance. The same rule `PhotoGrid` follows.
	// svelte-ignore state_referenced_locally
	const viewer = createViewer(name);

	/**
	 * What each mark the CMS offers looks like, as a ratio.
	 *
	 * The same two shapes `PhotoGrid` crops its tiles to — 3:2 and 3:4 — so the two grids on this
	 * site do not disagree about what "landscape" means. Keyed by the schema's own values, lowercased
	 * by `galleries.server`; a word this map does not know falls through to the photograph's own
	 * ratio rather than to a guess, which is what makes adding an option in the CMS safe before the
	 * site has been taught what it looks like.
	 */
	const SHAPES: Record<string, number> = {
		landscape: 3 / 2,
		upright: 3 / 4
	};

	/** The ratio a tile is drawn at: the mark's, or the photograph's own when it carries none. */
	const shapeOf = (photo: GalleryPhoto) => SHAPES[photo.option] ?? photo.width / photo.height;
</script>

<div class="justified">
	{#each photos as photo, i (photo.id)}
		<!-- The link is where the photograph is *looked at* — the viewer is layered over it, and
		     without script it is the whole of the gallery — so it points at the full rendition while
		     the tile below it draws the grid one. Two different files for two different jobs, which is
		     the distinction an unpinned `imageSources` cannot make: it answers the widest either way. -->
		{@const sources = imageSources(media[photo.id], GALLERY_FULL)}
		<a
			bind:this={viewer.tiles[i]}
			class="tile frame"
			href={sources?.src ?? '#'}
			style="--ar: {shapeOf(photo)}"
			use:reveal
			aria-label={photo.alt ? undefined : `Visa bild ${i + 1} av ${photos.length}`}
			onclick={(event) => viewer.onTileClick(event, i)}
		>
			<ResponsiveImage image={photo.id} {media} alt={photo.alt} rendition={GALLERY_GRID} />
		</a>
	{/each}
</div>

<Lightbox
	{photos}
	{media}
	{title}
	index={viewer.index}
	onnavigate={viewer.navigate}
	onclose={viewer.close}
/>

<style>
	.justified {
		display: flex;
		flex-wrap: wrap;
		gap: var(--gap);

		/*
		 * The height rows aim for. Everything else follows from it: a tile's basis is this times its
		 * aspect ratio, so a wider photograph asks for more of the row and a taller one for less.
		 */
		--row: 58vw;
		--gap: 0.5rem;
	}
	@media (min-width: 640px) {
		.justified {
			--row: 15rem;
			--gap: 0.75rem;
		}
	}
	@media (min-width: 1024px) {
		.justified {
			--row: 19rem;
			--gap: 1rem;
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
	 * equal height — which is what makes the row a row rather than a ragged strip.
	 */
	.tile {
		flex: var(--ar) 1 calc(var(--ar) * var(--row));
		aspect-ratio: var(--ar);
		min-width: 0;
		display: block;
	}

	/*
	 * Eats the last row's leftover width so its tiles keep the height of every row above. A plain
	 * `flex-grow` large enough to dwarf any realistic sum of ratios.
	 */
	.justified::after {
		content: '';
		flex-grow: 999999;
	}

	/*
	 * The site's hover push, restated. `app.css` writes it as `.group:hover .frame > img`, which needs
	 * the frame to be *inside* the hovered element; here the tile is the frame, so the descendant
	 * selector never matches.
	 */
	.tile:hover :global(img) {
		transform: scale(1.04);
	}

	.tile:focus-visible {
		outline: 2px solid #0b0b0b;
		outline-offset: 3px;
		/* The shared focus style is an inset rule, which a photograph sits on top of. */
		box-shadow: none;
	}

	@media (prefers-reduced-motion: reduce) {
		.tile:hover :global(img) {
			transform: none;
		}
	}
</style>
