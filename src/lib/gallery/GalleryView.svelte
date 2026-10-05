<script lang="ts">
	/**
	 * What a page written against the `gallery` schema renders.
	 *
	 * A component rather than markup in the route, because two routes draw it: the public page and
	 * the CMS preview, which has to show the editor the same thing they are about to publish.
	 *
	 * It is deliberately the whole page rather than a block among others. The `gallery` schema has one
	 * field — the folder — so there is nothing else on the page to arrange, and the photographs are
	 * what the visitor came for: a wedding gallery is a link people send each other, and it should
	 * open on the photographs rather than on a stack of sections above them.
	 */
	import GalleryGrid from '$lib/gallery/GalleryGrid.svelte';
	import { reveal } from '$lib/actions/reveal';
	import type { GalleryPhoto } from './galleries.server';
	import type { ImageManifest } from '$lib/media/assets';

	let {
		title,
		tagline = '',
		photos,
		media = {}
	}: {
		title: string;
		/**
		 * The gallery's own line, from the field beside the title. Empty is the ordinary case and
		 * draws nothing — a wedding gallery usually needs no words above the photographs.
		 */
		tagline?: string;
		photos: GalleryPhoto[];
		media?: ImageManifest;
	} = $props();

	/** `12 bilder`, and `1 bild` — Swedish has no plural `s` to lean on. */
	const count = $derived(photos.length);
</script>

<section class="wrap py-20 md:py-28 lg:py-32">
	<div class="reveal flex flex-wrap items-end justify-between gap-6 pb-10 md:pb-14" use:reveal>
		<div class="max-w-[52ch]">
			<h1 class="display text-[clamp(2rem,4.4vw,3.75rem)]">{title}</h1>
			<!-- Under the heading rather than beside the count: it is a sentence about this gallery,
			     and the count is a fact about it. -->
			{#if tagline}
				<p class="mt-4 text-[15px] text-ash md:mt-5 md:text-base">{tagline}</p>
			{/if}
		</div>
		{#if count > 0}
			<p class="eyebrow">{count} {count === 1 ? 'bild' : 'bilder'}</p>
		{/if}
	</div>

	{#if count > 0}
		<GalleryGrid {photos} {media} {title} />
	{:else}
		<!--
			Not a 404 and not an error: the page exists because an editor made it. An empty folder, or one
			renamed in the library since it was picked, both land here — and both are things the person
			looking at this can fix in the CMS, which is why it says which of them it is not.
		-->
		<p class="border-t border-line pt-10 text-ash">Inga bilder i det här galleriet än.</p>
	{/if}
</section>
