/**
 * The state behind a full-screen viewer: which photograph is open, and how you got there.
 *
 * Extracted because two different grids now open the same `Lightbox` — a gallery page's folder and a
 * `photo_grid` block with its viewer switched on — and the fiddly part is not the layout, it is this:
 * the history entry, the modified-click rule, and giving focus back to the right tile on the way out.
 * One copy, so a fix to any of them is a fix everywhere.
 *
 * ## Why the index lives in history
 *
 * This is SvelteKit's shallow routing, and it buys the one thing a lightbox is usually missing: on a
 * phone, back closes the viewer instead of leaving the page entirely. Opening pushes an entry and
 * moving between photographs *replaces* it, so however far someone browses, one back press returns
 * them to the grid rather than walking them backwards through everything they looked at.
 *
 * ## Why the grid is named in the state
 *
 * A page can carry more than one grid — two `photo_grid` blocks on the same page is a legitimate
 * thing for an editor to build. A bare index would be read by both of them, so both would open. The
 * id in the state is what makes it belong to one.
 */
import { pushState, replaceState } from '$app/navigation';
import { page } from '$app/state';

export function createViewer(id: string) {
	/**
	 * The tiles, for focus. Bound by the caller as `bind:this={viewer.tiles[i]}` — indexed by
	 * *photograph*, so a grid whose tiles are not all openable must bind by the photograph's position
	 * rather than the tile's.
	 */
	const tiles = $state<Array<HTMLElement | null>>([]);

	const index = $derived(page.state.viewer?.grid === id ? page.state.viewer.photo : null);

	/**
	 * Give focus back to the tile that was being looked at.
	 *
	 * Not the tile that opened the viewer — the one showing when it closed. Someone who arrows from
	 * the first photograph to the twentieth and presses Esc should be left at the twentieth, which is
	 * also what stops the page from jumping back to the top of a long gallery.
	 *
	 * A plain variable rather than `$state`: it is only ever read inside this effect, and making it
	 * reactive would re-run the effect on its own write.
	 */
	let lastOpen: number | null = null;

	$effect(() => {
		if (index !== null) {
			lastOpen = index;
			return;
		}

		const returning = lastOpen;
		lastOpen = null;
		if (returning === null) return;

		tiles[returning]?.focus({ preventScroll: true });
		tiles[returning]?.scrollIntoView({ block: 'nearest' });
	});

	function open(photo: number) {
		pushState('', { viewer: { grid: id, photo } });
	}

	function navigate(photo: number) {
		replaceState('', { viewer: { grid: id, photo } });
	}

	function close() {
		// Unwinds the entry `open` pushed, so the viewer closes the same way whether the button or the
		// browser's own back gesture asked for it.
		history.back();
	}

	/**
	 * What a tile's `onclick` should do.
	 *
	 * A tile is a link to the photograph itself with the viewer layered over it, because a button with
	 * no script is a dead control and a gallery is the one thing on this site whose whole content
	 * would be unreachable if it were. So this cancels the navigation — except for a modified click,
	 * which is a deliberate "give me the file" and is left alone so "open in new tab" still works.
	 */
	function onTileClick(event: MouseEvent, photo: number) {
		if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) {
			return;
		}

		event.preventDefault();
		open(photo);
	}

	return {
		get index() {
			return index;
		},
		get tiles() {
			return tiles;
		},
		open,
		navigate,
		close,
		onTileClick
	};
}
