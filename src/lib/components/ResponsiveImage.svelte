<script lang="ts">
	/**
	 * An image from the commitpress library, including the alternates an editor chose for it.
	 *
	 * Takes **what the field holds**, not a URL: the value names an asset, optionally a pinned
	 * rendition, and optionally one picture per breakpoint slot. Each of those resolves to exactly
	 * one file, and the `<picture>` below is what chooses between them.
	 *
	 * ## Where "responsive" comes from, and where it deliberately does not
	 *
	 * From the **schema's breakpoints**. A field declaring them lets an editor choose a different
	 * photograph per slot; this site maps each slot name onto a media condition (`BREAKPOINTS`), and
	 * every filled slot becomes a `<source>`. The condition decides, so the picture that appears is
	 * the one somebody chose for that viewport.
	 *
	 * **Not from the renditions.** This used to offer an asset's renditions as `srcset` candidates
	 * with the call site declaring `sizes`, so the browser picked by layout width and device pixel
	 * ratio. That is standard practice for one picture at several widths and wrong for these:
	 * commitpress renditions are named slots with framing of their own — a 1:1 `thumb`, a 4:3 `card`,
	 * a banner cut off a portrait — so letting the browser choose between them let it change the
	 * *crop*, and it silently overrode the pin an editor had set. `imageSources` carries the full
	 * argument; the visible consequence here is that there is no `srcset` and no `sizes`.
	 *
	 * ## Why this takes a value rather than an id
	 *
	 * It took a bare `id: string` until an editor pinned a rendition on a field for the first time.
	 * An image field stores a bare asset id right up to the moment somebody uses one of the two
	 * features that need more room — an alternate picture for a breakpoint, or a pinned rendition —
	 * and then it stores `{ src, renditions: { src: 'card' } }` instead. Handed that object as an
	 * `id`, this component looked it up in the manifest under the key `[object Object]`, missed,
	 * fetched `…/[object%20Object]/asset.json`, got a 404, and rendered **nothing at all**. In the
	 * CMS's live preview that is a photograph vanishing the moment its rendition is chosen; on a
	 * published page it is the same thing without anybody watching.
	 *
	 * So the prop is the field's value and `imageId()` is what reads an id out of it — from
	 * `@commitpress/sdk/image`, which is the entry that carries no `node:fs` and can therefore be
	 * imported by a component. A plain string is still a perfectly good value and is what most call
	 * sites pass.
	 *
	 * Two resolution paths, because there are two ways this component is reached:
	 *
	 * - **The manifest**, built by the load function. This is the normal one, and the only one that
	 *   matters for the public site: the descriptor is in the HTML from the first paint, so the file
	 *   and its intrinsic size are there before hydration and nothing shifts.
	 * - **A fetch**, for an id the manifest does not have. That is the preview: the editor posts a
	 *   freshly picked image over `postMessage`, so the id did not exist when the page loaded. On the
	 *   public site this only fires for a reference whose asset is gone, where it 404s and the caller
	 *   falls back to whatever it renders for an empty field.
	 *
	 * ## Alternates, and where the media query comes from
	 *
	 * A responsive image field lets an editor choose a **different photograph** per breakpoint — the
	 * subject wanted at the top of a 390px screen is frequently not in the wide frame at all, which
	 * is why no rendition of the default answers it. The CMS stores those slots by **name only**
	 * (`mobile`), never as `(max-width: …)` and never as a width: where a breakpoint sits is a fact
	 * about this site's stylesheet, and a copy of it in a schema is a second place to edit.
	 *
	 * So pass `breakpoints` — slot name to media condition, `BREAKPOINTS` in `$lib/media/assets`
	 * being this site's own — and each slot holding a picture of its own becomes a `<source>`. Three
	 * rules, and all three are about what `<picture>` already does:
	 *
	 * - **A slot the value does not fill is not a source.** An unfilled alternate means "the default
	 *   is fine here", which the fallback `<img>` already says, and a `<source>` repeating it is
	 *   markup for nothing. Told apart by comparing what the slot resolves to against the default,
	 *   since `imageId()` falls back — so a slot naming the *same* photograph at a *different pinned
	 *   rendition* is still a source, which is the case an id comparison alone would drop.
	 * - **Each source carries its own `width`/`height`.** Choosing a portrait for the phone is the
	 *   usual reason to use this at all, so the aspect ratio the browser reserves differs per source;
	 *   without them the page reserves the default's shape and reflows when the phone picture lands.
	 * - **An alternate whose asset is gone is skipped, not fatal.** The `<img>` covers it. A missing
	 *   *default* still renders nothing, exactly as before.
	 *
	 * The `<picture>` is `display: contents`, so it generates no box: `class` stays on the `<img>`
	 * and every existing call site lays out identically whether or not an alternate exists. Without
	 * that, a `h-full` image inside an inline `<picture>` collapses.
	 */
	import {
		assetJsonUrl,
		imageSources,
		type ImageAsset,
		type ImageManifest,
		type ImageSources
	} from '$lib/media/assets';
	import { imageAlt, imageId, imageRendition, type ImageValue } from '@commitpress/sdk/image';

	let {
		image,
		media = {},
		breakpoints = {},
		alt,
		rendition: preferred = '',
		loading = 'lazy',
		fetchpriority,
		class: className = ''
	}: {
		/** What the image field holds: an asset id, or the object a pinned or responsive field stores. */
		image: ImageValue;
		/** The page's resolved assets. Absent for an id picked after the page loaded — see above. */
		media?: ImageManifest;
		/**
		 * Which alternate slots to honour, and under what condition — `{ mobile: '(max-width: …)' }`.
		 * A slot named here that the value does not fill costs nothing; a slot the value fills that
		 * is *not* named here is simply not shown, which is the right default for a call site whose
		 * layout has no such breakpoint.
		 *
		 * **This is the whole of how a picture varies with the viewport here** — see the note above.
		 */
		breakpoints?: Record<string, string>;
		/**
		 * What the photograph shows — **only where the caller knows better than the library does.**
		 *
		 * This used to be required, and fed from an `alt` input field sitting beside each image
		 * control in the schema. That was the wrong place for it twice over: the same photograph had
		 * to be described again on every page it appeared on, and the description an editor wrote
		 * while choosing the picture — in the media library, where the picture lives — reached
		 * nothing. So the answer now comes off the asset, and this prop is for the cases the asset
		 * cannot answer: a decorative frame passing `''`, or a caller with a sentence of its own.
		 *
		 * `undefined` and `''` are deliberately different. Undefined is "ask the library"; empty is
		 * "this picture is decorative", which is a real statement and is left alone.
		 */
		alt?: string;
		/**
		 * Which rendition this call site would like, **where the value pins nothing**.
		 *
		 * The composition `imageRendition` describes: an editor's pin is a decision about this slot and
		 * always wins, and this is the site's preference underneath it — the same relationship as
		 * `pickVariant(item, imageRendition(value), 'wide')` in the SDK. `''`, the default, leaves the
		 * choice to `imageSources`, which is the widest preset rendition and is right for a field whose
		 * renditions are a delivery ladder.
		 *
		 * It exists for the case that is not a field at all: a gallery tile is a bare asset id read out
		 * of a folder, so there is no editor and nobody to pin anything, and "widest" answers `cp-full`
		 * for a 320px tile. See `GALLERY_GRID` in `$lib/media/assets`.
		 *
		 * Applied to the alternates too, so a `mobile` slot of an unpinned picture is the same rendition
		 * as the default rather than falling back to the widest on its own.
		 */
		rendition?: string;
		loading?: 'lazy' | 'eager';
		fetchpriority?: 'high' | 'low' | 'auto';
		class?: string;
	} = $props();

	/** Resolved after the fact, by id, for pictures the load function never saw. */
	let fetched = $state<Record<string, ImageAsset>>({});

	/** The two questions the value answers: which asset, and — where somebody said — at which rendition. */
	const id = $derived(imageId(image));
	/** The editor's pin where there is one, else this call site's preference. See the `rendition` prop. */
	const rendition = $derived(imageRendition(image) || preferred);

	const asset = $derived(id ? (media[id] ?? fetched[id] ?? null) : null);
	const sources = $derived(imageSources(asset, rendition));

	/**
	 * What actually reaches the `alt` attribute, in the order the three answers deserve.
	 *
	 * The caller wins where it said anything at all, including the empty string — a decorative
	 * frame is a statement, not a gap. Then the field's own description, which exists only where a
	 * schema turned it on and only where somebody wrote one: a pinned rendition is often a
	 * different *crop*, so the library's sentence about the photograph may describe something this
	 * slot does not show. Then the asset's, which is the usual answer and the one that improves for
	 * every page at once when it is fixed in the library.
	 *
	 * `''` at the end is not a fallback worth dressing up. An undescribed picture is a picture
	 * nobody has described, and inventing a filename here would announce `DSC_4831.jpg` to a screen
	 * reader as though it meant something.
	 */
	const described = $derived(alt ?? (imageAlt(image) || asset?.alt || ''));

	type Slot = { slot: string; media: string; id: string; rendition: string };

	/**
	 * The slots that say something the fallback does not.
	 *
	 * In the caller's declared order, because that is the order a browser evaluates `<source>` in
	 * and the first match wins — so overlapping conditions are resolved by whoever wrote the map,
	 * not by whatever order the editor happened to fill the slots in.
	 */
	const slots = $derived.by<Slot[]>(() => {
		if (!id) return [];

		const found: Slot[] = [];
		for (const [slot, condition] of Object.entries(breakpoints)) {
			if (!condition) continue;

			const slotImage = imageId(image, slot);
			// The preference applies here too, and it has to be folded in *before* the comparison below:
			// with it applied to the default only, an unpinned alternate of the same photograph would
			// read as saying something different and become a `<source>` for the same picture.
			const slotRendition = imageRendition(image, slot) || preferred;
			// Both halves, because `imageId` falls back to the default: equal ids with different pins
			// is one photograph the editor asked to be cut two ways, which is a real source.
			if (!slotImage || (slotImage === id && slotRendition === rendition)) continue;

			found.push({ slot, media: condition, id: slotImage, rendition: slotRendition });
		}
		return found;
	});

	/** Only the slots that resolved to an asset — a deleted alternate falls back to the `<img>`. */
	const alternates = $derived(
		slots
			.map((entry) => ({
				...entry,
				sources: imageSources(media[entry.id] ?? fetched[entry.id] ?? null, entry.rendition)
			}))
			.filter((entry): entry is Slot & { sources: ImageSources } => !!entry.sources)
	);

	/** Every id this render needs, default first. Joined so the effect below settles. */
	const wanted = $derived([id, ...slots.map((entry) => entry.id)].filter(Boolean));
	const wantedKey = $derived(wanted.join(','));

	$effect(() => {
		const ids = wantedKey.split(',').filter(Boolean);
		const known = media;

		// Dropped before the new ids are looked up, not after they resolve: in the preview this
		// component is reused when the editor swaps a slide's image, and holding the previous
		// descriptors until the next ones arrive would show the old photograph under the new caption.
		fetched = {};

		const missing = ids.filter((candidate) => !known[candidate]);
		// Nothing to do when the load function already answered, which is the whole public site.
		if (!missing.length) return;

		let live = true;
		Promise.all(
			missing.map((candidate) =>
				resolveAsset(candidate).then((resolved) => [candidate, resolved] as const)
			)
		).then((pairs) => {
			if (!live) return;
			const next: Record<string, ImageAsset> = {};
			for (const [candidate, resolved] of pairs) if (resolved) next[candidate] = resolved;
			fetched = next;
		});

		return () => {
			live = false;
		};
	});
</script>

<script lang="ts" module>
	/**
	 * Shared across instances, and holding the in-flight promise rather than the result: a hero whose
	 * slides repeat an image would otherwise ask for the same descriptor once per slide, in parallel,
	 * with none of them able to see the others.
	 *
	 * **In-flight only** — the entry is dropped the moment it settles, and that is the whole of the
	 * difference from what this was. Keeping the settled promise made it a cache with no expiry, in
	 * the one place where the thing it caches changes under you: a preview frame is not reloaded
	 * while somebody works, so re-cropping an image the frame had already resolved handed every
	 * later render the pre-crop descriptor. The pin resolved against a stale variant list and the old
	 * photograph stayed on screen, with nothing failing anywhere.
	 *
	 * Refetching costs a conditional request the media route answers with a 304 — see the `etag`
	 * there. The descriptor is under a kilobyte, and only the preview asks for it at all.
	 */
	const pending = new Map<string, Promise<ImageAsset | null>>();

	function resolveAsset(id: string): Promise<ImageAsset | null> {
		let request = pending.get(id);
		if (!request) {
			request = fetch(assetJsonUrl(id))
				.then((response) => (response.ok ? (response.json() as Promise<ImageAsset>) : null))
				.catch(() => null)
				.finally(() => {
					pending.delete(id);
				});
			pending.set(id, request);
		}
		return request;
	}
</script>

{#if sources}
	<!--
		One file per slot, and no `srcset`: which picture applies is decided by the media conditions
		below, which are the schema's breakpoints, not by the browser choosing among renditions. See
		`imageSources`.

		`width` and `height` are the file's intrinsic size, and are set even where CSS overrides both:
		they are what gives the browser an aspect ratio to reserve before the bytes arrive. Without
		them a hero pops into place and pushes the page around on a slow connection.
	-->
	{#snippet fallback()}
		<img
			class={className}
			src={sources.src}
			width={sources.width}
			height={sources.height}
			alt={described}
			{loading}
			{fetchpriority}
			decoding="async"
		/>
	{/snippet}

	{#if alternates.length}
		<picture class="contents">
			{#each alternates as alternate (alternate.slot)}
				<source
					media={alternate.media}
					srcset={alternate.sources.src}
					width={alternate.sources.width}
					height={alternate.sources.height}
				/>
			{/each}
			{@render fallback()}
		</picture>
	{:else}
		{@render fallback()}
	{/if}
{/if}

<style>
	/*
	 * The element exists to group sources and must not exist to lay anything out — every call site
	 * sizes the `<img>` itself, frequently against a parent this would otherwise sit between.
	 */
	picture.contents {
		display: contents;
	}
</style>
