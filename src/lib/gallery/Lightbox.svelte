<script lang="ts">
	/**
	 * The full-screen viewer.
	 *
	 * Built on a real `<dialog>` opened with `showModal()`, which is the reason this component is
	 * mostly layout: the top layer, the inert background, the focus trap and Esc are the platform's
	 * rather than a scroll of hand-written key handling that has to be got right once per site. What
	 * is left to do here is the part a dialog does not know about — which photograph, and how you get
	 * to the next one.
	 *
	 * It is *controlled*: the index lives in the grid, which keeps it in the history entry, so this
	 * never decides on its own that it is closed. Every exit goes back through `onclose` — including
	 * Esc, whose default is cancelled below for exactly that reason. A dialog that closed itself
	 * natively would leave the history entry behind and be reopened by the effect that syncs them.
	 */
	import ResponsiveImage from '$lib/components/ResponsiveImage.svelte';
	import {
		assetRevision,
		GALLERY_FULL,
		imageSources,
		mediaUrl,
		type ImageAsset,
		type ImageManifest
	} from '$lib/media/assets';
	import type { GalleryPhoto } from './galleries.server';

	let {
		photos,
		media = {},
		/** Which photograph is showing, or `null` when the viewer is closed. */
		index = null,
		title,
		onnavigate,
		onclose
	}: {
		photos: GalleryPhoto[];
		media?: ImageManifest;
		index: number | null;
		title: string;
		onnavigate: (index: number) => void;
		onclose: () => void;
	} = $props();

	let dialog = $state<HTMLDialogElement | null>(null);
	let strip = $state<HTMLDivElement | null>(null);
	let thumbs = $state<Array<HTMLButtonElement | null>>([]);

	const open = $derived(index !== null);
	const current = $derived(index === null ? null : (photos[index] ?? null));
	const asset = $derived(current ? (media[current.id] ?? null) : null);

	function go(to: number) {
		if (photos.length === 0) return;
		// Wraps, so the arrows are never dead ends and holding one cycles the gallery.
		const next = (to + photos.length) % photos.length;
		onnavigate(next);
	}

	function onkeydown(event: KeyboardEvent) {
		if (index === null) return;

		switch (event.key) {
			case 'ArrowRight':
				event.preventDefault();
				go(index + 1);
				break;
			case 'ArrowLeft':
				event.preventDefault();
				go(index - 1);
				break;
			case 'Home':
				event.preventDefault();
				onnavigate(0);
				break;
			case 'End':
				event.preventDefault();
				onnavigate(photos.length - 1);
				break;
		}
	}

	/** Open and close the real dialog to follow the index it is given. */
	$effect(() => {
		const el = dialog;
		if (!el) return;

		if (open && !el.open) el.showModal();
		else if (!open && el.open) el.close();
	});

	/**
	 * Hold the page still behind the viewer.
	 *
	 * `showModal()` makes the background inert but does not reliably stop it scrolling, and a wheel
	 * gesture over the photograph that scrolls the gallery underneath is disorienting on the way back
	 * out. The scrollbar's width is replaced with padding so removing it does not shift the page.
	 */
	$effect(() => {
		if (!open) return;

		const root = document.documentElement;
		const gutter = window.innerWidth - root.clientWidth;
		const overflow = root.style.overflow;
		const padding = root.style.paddingRight;

		root.style.overflow = 'hidden';
		if (gutter > 0) root.style.paddingRight = `${gutter}px`;

		return () => {
			root.style.overflow = overflow;
			root.style.paddingRight = padding;
		};
	});

	/** Keep the current thumbnail in the strip, without dragging the whole page around. */
	$effect(() => {
		if (index === null) return;

		const thumb = thumbs[index];
		if (!thumb || !strip) return;

		const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		thumb.scrollIntoView({
			behavior: smooth ? 'smooth' : 'auto',
			inline: 'center',
			block: 'nearest'
		});
	});

	/**
	 * Fetch the neighbours while the current one is being looked at.
	 *
	 * The point of a viewer with arrows is that the next photograph is there when you press, and
	 * these are the two presses anyone actually makes. It warms exactly the file the visible `<img>`
	 * will ask for, since `imageSources` resolves a photograph to one file rather than to a set the
	 * browser chooses from — which is what this used to have to reproduce with a matching `sizes`.
	 */
	$effect(() => {
		if (index === null) return;

		for (const offset of [1, -1]) {
			const neighbour = photos[(index + offset + photos.length) % photos.length];
			// Asked for by name, and it must stay the same name the `<img>` below renders: warming a file
			// the visible element never requests is a download nobody uses and a press that still waits.
			const sources = neighbour ? imageSources(media[neighbour.id], GALLERY_FULL) : null;
			if (!sources || !neighbour) continue;

			const warm = new Image();
			warm.src = sources.src;
		}
	});

	/** The smallest rendition an asset has, for the strip. */
	function thumbSrc(item: ImageAsset | null | undefined): string | null {
		if (!item) return null;

		const smallest = (item.variants ?? [])
			.filter((variant) => variant?.path && variant.width > 0)
			.sort((a, b) => a.width - b.width)[0];

		// Stamped, like every other rendition URL on the site: a rendition is rewritten in place by a
		// re-crop, so the path alone names two different pictures over time. The original is not — see
		// `assetRevision`.
		if (smallest) return mediaUrl(smallest.path, assetRevision(item));
		return item.path ? mediaUrl(item.path) : null;
	}

	/**
	 * Swipe, tracked on the whole stage rather than on the photograph.
	 *
	 * Pointer events rather than touch events so a trackpad drag and a pen work too. The threshold is
	 * generous because the gesture competes with nothing here — the stage does not scroll.
	 *
	 * The listeners were always on the stage, and the gesture still only worked over the image, for
	 * two reasons that both live outside this block. `touch-action` was set on the `<img>` alone, so
	 * a drag beginning on the letterboxing either side was claimed by the browser's own gesture and
	 * arrived as a `pointercancel`; and a drag that began *and ended* on the stage is a click on the
	 * stage, which is the gesture that closes the viewer. So an upright photograph on a wide screen —
	 * the case with the most stage and the least image — was the hardest one to turn and the easiest
	 * one to shut by accident.
	 */
	const SWIPE = 60;
	/** Past this the pointer was dragged rather than tapped, whichever way it went. */
	const DRAG = 10;
	let swipeFrom: { x: number; y: number } | null = null;
	/** Whether the click that follows this gesture is the tail of a drag. Read by the stage. */
	let dragged = false;

	function onpointerdown(event: PointerEvent) {
		if (event.pointerType === 'mouse' && event.button !== 0) return;
		dragged = false;
		swipeFrom = { x: event.clientX, y: event.clientY };
	}

	function onpointerup(event: PointerEvent) {
		const from = swipeFrom;
		swipeFrom = null;
		if (!from || index === null) return;

		const dx = event.clientX - from.x;
		const dy = event.clientY - from.y;

		// Every drag suppresses the close, not only the ones long enough to turn the page: a swipe
		// that falls short is a gesture that missed, and answering it by shutting the viewer is the
		// worst reading available.
		dragged = Math.abs(dx) > DRAG || Math.abs(dy) > DRAG;

		// Horizontal intent only: a mostly-vertical drag on a phone is a dismiss gesture elsewhere and
		// should not turn the page here.
		if (Math.abs(dx) < SWIPE || Math.abs(dx) < Math.abs(dy)) return;
		go(index + (dx < 0 ? 1 : -1));
	}

	/**
	 * The browser took the gesture — a pull-to-refresh, an edge swipe, a second finger.
	 *
	 * No `pointerup` follows one of these, so without this the start point survives until the next
	 * gesture ends and is measured against a pointer that began somewhere else entirely.
	 */
	function onpointercancel() {
		swipeFrom = null;
		dragged = false;
	}
</script>

<svelte:window {onkeydown} />

<dialog
	bind:this={dialog}
	class="lb"
	aria-label="{title} — bildvisning"
	oncancel={(event) => {
		// Esc. Cancelled so the close goes through the grid, which owns both the index and the history
		// entry behind it — see the note at the top.
		event.preventDefault();
		onclose();
	}}
>
	{#if current}
		<div class="lb-shell">
			<div class="lb-top">
				<p class="lb-count" aria-live="polite">
					<span class="lb-title">{title}</span>
					<span aria-hidden="true">·</span>
					{(index ?? 0) + 1} / {photos.length}
				</p>

				<button type="button" class="lb-btn lb-close" onclick={onclose} aria-label="Stäng">
					<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
						<path d="M5 5l14 14M19 5L5 19" />
					</svg>
				</button>
			</div>

			<!--
				The backdrop, as far as a pointer is concerned: a click that lands on the stage rather than
				on the photograph closes the viewer, which is what every image viewer does. It carries no
				key handler of its own on purpose — Esc is the keyboard's way out and the close button is
				in the tab order, so a second, invisible tab stop over the whole screen would only add a
				stop that announces nothing.
			-->
			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div
				class="lb-stage"
				{onpointerdown}
				{onpointerup}
				{onpointercancel}
				onclick={(event) => {
					// A swipe that begins and ends on the stage is also a click on the stage. Closing on it
					// made the empty area unswipeable in the one way that matters: the gesture worked, and
					// the viewer was gone before the next photograph arrived.
					if (dragged) {
						dragged = false;
						return;
					}
					if (event.target === event.currentTarget) onclose();
				}}
			>
				<button
					type="button"
					class="lb-btn lb-nav lb-prev"
					onclick={() => go((index ?? 0) - 1)}
					aria-label="Föregående bild"
				>
					<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
						<path d="M15 4L7 12l8 8" />
					</svg>
				</button>

				<!--
					Keyed on the id so Svelte replaces the element rather than mutating `src` on the one that
					is showing. Mutating it leaves the previous photograph on screen until the next decodes,
					which reads as the arrow having done nothing; a new element lets the fade below run.
				-->
				{#key current.id}
					<figure class="lb-figure" style="--ar: {current.width / current.height}">
						<!-- Pinned rather than left to the widest rule, which happened to answer `cp-full`
						     here and did so by accident: it is the widest of the pair, not the one meant.
						     Said out loud so the grid's `cp-grid` and this are one decision. -->
						<ResponsiveImage
							image={current.id}
							{media}
							alt={current.alt}
							rendition={GALLERY_FULL}
							loading="eager"
							fetchpriority="high"
						/>
					</figure>
				{/key}

				<button
					type="button"
					class="lb-btn lb-nav lb-next"
					onclick={() => go((index ?? 0) + 1)}
					aria-label="Nästa bild"
				>
					<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
						<path d="M9 4l8 8-8 8" />
					</svg>
				</button>
			</div>

			<!-- One photograph is a viewer, not a filmstrip. -->
			{#if photos.length > 1}
				<div class="lb-strip" bind:this={strip}>
					{#each photos as photo, i (photo.id)}
						{@const src = thumbSrc(media[photo.id])}
						<button
							type="button"
							bind:this={thumbs[i]}
							class="lb-thumb"
							class:is-current={i === index}
							style="--ar: {photo.width / photo.height}"
							aria-label="Bild {i + 1} av {photos.length}"
							aria-current={i === index ? 'true' : undefined}
							onclick={() => onnavigate(i)}
						>
							{#if src}
								<img {src} alt="" loading="lazy" decoding="async" />
							{/if}
						</button>
					{/each}
				</div>
			{/if}
		</div>
	{/if}
</dialog>

<style>
	.lb {
		width: 100vw;
		max-width: 100vw;
		height: 100dvh;
		max-height: 100dvh;
		margin: 0;
		padding: 0;
		border: 0;
		background: #0b0b0b;
		color: #fff;
		overflow: hidden;
	}
	.lb::backdrop {
		background: #0b0b0b;
	}

	.lb-shell {
		display: grid;
		/* The stage takes what the bar and the strip leave, so the photograph never pushes them off. */
		grid-template-rows: auto minmax(0, 1fr) auto;
		height: 100%;
	}

	.lb-top {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1.5rem;
		padding: 1.1rem 1.25rem;
	}
	@media (min-width: 768px) {
		.lb-top {
			padding: 1.5rem 2rem;
		}
	}

	.lb-count {
		font-size: 11px;
		text-transform: uppercase;
		letter-spacing: 0.22em;
		color: rgb(255 255 255 / 0.62);
		display: flex;
		align-items: center;
		gap: 0.75em;
	}
	.lb-title {
		color: #fff;
	}

	.lb-btn {
		display: grid;
		place-items: center;
		color: #fff;
		background: transparent;
		border: 1px solid rgb(255 255 255 / 0.22);
		border-radius: 999px;
		transition:
			background-color 0.35s ease,
			border-color 0.35s ease,
			opacity 0.35s ease;
	}
	.lb-btn svg {
		width: 44%;
		height: 44%;
		fill: none;
		stroke: currentColor;
		stroke-width: 1.25;
		stroke-linecap: square;
	}
	.lb-btn:hover {
		background: rgb(255 255 255 / 0.12);
		border-color: rgb(255 255 255 / 0.5);
	}
	/* The site's focus style is an inset dark rule, which is invisible on this. */
	.lb-btn:focus-visible {
		outline: 1px solid #fff;
		outline-offset: 2px;
	}

	.lb-close {
		width: 2.75rem;
		height: 2.75rem;
		flex: none;
	}

	.lb-stage {
		position: relative;
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 0;
		padding: 0 1rem;
		/*
		 * The swipe area, and the reason it is declared here rather than on the photograph: a
		 * `touch-action` restriction applies to the element the touch lands on and every ancestor of
		 * it, so stating it on the stage covers the image, the letterboxing either side of it and the
		 * arrows — the whole surface the gesture is tracked on. On the `<img>` alone it covered the
		 * one part of the stage that is hardest to hit, which is what made a small photograph
		 * effectively unswipeable.
		 */
		touch-action: pan-y;
	}
	@media (min-width: 768px) {
		.lb-stage {
			padding: 0 5.5rem;
		}
	}

	.lb-nav {
		position: absolute;
		top: 50%;
		transform: translateY(-50%);
		width: 3rem;
		height: 3rem;
		z-index: 1;
	}
	.lb-prev {
		left: 0.5rem;
	}
	.lb-next {
		right: 0.5rem;
	}
	@media (min-width: 768px) {
		.lb-nav {
			width: 3.5rem;
			height: 3.5rem;
		}
		.lb-prev {
			left: 1.25rem;
		}
		.lb-next {
			right: 1.25rem;
		}
	}
	/*
	 * On a narrow screen the arrows sit over the photograph, so they are quietened until touched —
	 * the swipe is the real gesture there and two solid discs over a portrait crop are in the way.
	 */
	@media (max-width: 767px) {
		.lb-nav {
			opacity: 0.55;
			background: rgb(0 0 0 / 0.35);
			border-color: transparent;
		}
	}

	.lb-figure {
		margin: 0;
		max-width: 100%;
		max-height: 100%;
		aspect-ratio: var(--ar);
		/* Both bounds on the box, so the ratio decides which one binds and the image never overflows. */
		display: flex;
		animation: lb-in 0.5s cubic-bezier(0.16, 1, 0.3, 1);
	}
	.lb-figure :global(img) {
		width: 100%;
		height: 100%;
		object-fit: contain;
		/* The stage declares `touch-action` for the whole surface — this is only the part a drag
		   over the photograph itself would otherwise turn into a selection or an image drag. */
		user-select: none;
		-webkit-user-drag: none;
	}

	@keyframes lb-in {
		from {
			opacity: 0;
			transform: scale(0.985);
		}
		to {
			opacity: 1;
			transform: none;
		}
	}

	.lb-strip {
		display: flex;
		gap: 0.5rem;
		overflow-x: auto;
		overflow-y: hidden;
		padding: 1rem 1.25rem 1.35rem;
		scrollbar-width: thin;
		scrollbar-color: rgb(255 255 255 / 0.28) transparent;
		overscroll-behavior-x: contain;
	}
	@media (min-width: 768px) {
		.lb-strip {
			padding: 1rem 2rem 1.6rem;
		}
	}

	.lb-thumb {
		flex: none;
		height: 3.5rem;
		aspect-ratio: var(--ar);
		padding: 0;
		border: 0;
		background: rgb(255 255 255 / 0.08);
		overflow: hidden;
		opacity: 0.45;
		transition:
			opacity 0.35s ease,
			outline-color 0.35s ease;
		outline: 1px solid transparent;
		outline-offset: -1px;
	}
	@media (min-width: 768px) {
		.lb-thumb {
			height: 4.25rem;
		}
	}
	.lb-thumb img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}
	.lb-thumb:hover {
		opacity: 0.85;
	}
	.lb-thumb.is-current {
		opacity: 1;
		outline-color: #fff;
	}
	.lb-thumb:focus-visible {
		outline-color: #fff;
		opacity: 1;
	}

	@media (prefers-reduced-motion: reduce) {
		.lb-figure {
			animation: none;
		}
		.lb-btn,
		.lb-thumb {
			transition: none;
		}
	}
</style>
