<script lang="ts">
	/**
	 * Renders a page's blocks in the order the editor put them in.
	 *
	 * The one place that knows which block name maps to which component. `PageContent['blocks']` is a
	 * discriminated union — an entry is `{ hero: … }` or `{ faq: … }` and never both — so a variant
	 * added to the schema and forgotten here renders nothing rather than rendering wrongly.
	 *
	 * `site` is threaded through because a few blocks need details that belong to the site rather than
	 * to the page: the hero's tagline, the phone number on the ID-photo and contact blocks. `media` is
	 * threaded the same way and for the same reason — an image field stores an id, and the descriptor
	 * that turns it into a file is resolved once per request rather than once per image.
	 */
	import Hero from '$lib/sections/Hero.svelte';
	import PageHeader from '$lib/sections/PageHeader.svelte';
	import Intro from '$lib/sections/Intro.svelte';
	import Services from '$lib/sections/Services.svelte';
	import Steps from '$lib/sections/Steps.svelte';
	import Packages from '$lib/sections/Packages.svelte';
	import Gallery from '$lib/sections/Gallery.svelte';
	import GalleryGrid from '$lib/sections/GalleryGrid.svelte';
	import PhotoGrid from '$lib/sections/PhotoGrid.svelte';
	import IdPhoto from '$lib/sections/IdPhoto.svelte';
	import Booking from '$lib/sections/Booking.svelte';
	import About from '$lib/sections/About.svelte';
	import Faq from '$lib/sections/Faq.svelte';
	import Contact from '$lib/sections/Contact.svelte';
	import Cta from '$lib/sections/Cta.svelte';
	import {
		PREVIEW_SECTION_TAG,
		sectionMarker,
		sectionPath,
		humanizeBlockName
	} from '@commitpress/sdk/preview';
	import type { GalleryPhoto } from '$lib/gallery/galleries.server';
	import type { ImageManifest } from '$lib/media/assets';
	import type { PageContent, SiteContent } from '../../commitpress.generated';

	let {
		blocks,
		site,
		/** Only the blocks that declare an image field are given it — the same rule as `site`. */
		media = {},
		/**
		 * The open days behind a `booking` block, resolved in the page load because they come from the
		 * database rather than from content. Empty everywhere that has no booking block, and in the CMS
		 * preview — which renders content without a store behind it, and so derives its own from the
		 * block's schedule instead. See the note in `Booking.svelte`.
		 */
		bookingDays = [],
		/**
		 * The photographs behind each `gallery_grid` block, keyed by the block's position.
		 *
		 * Threaded like `bookingDays` and for the same reason: the value is a read only a server can
		 * do — a folder name becomes photographs by reading the media index — so it is resolved in the
		 * page load rather than by the block. Keyed by position because that is what this component
		 * already hands each block, and because two blocks may publish the same folder deliberately.
		 *
		 * Empty on a page with no gallery grid, and in the CMS preview before the frame has asked
		 * about a folder the editor just picked — see the note in the preview route.
		 */
		galleryPhotos = {},
		/**
		 * Wrap each block in a commitpress section marker.
		 *
		 * Only the preview route turns this on. The markers are what let the editor's overlay draw an
		 * outline around a section and map a click back to the values that produced it, and they are
		 * `display: contents` so the page lays out byte for byte as it does without them.
		 */
		marked = false
	}: {
		blocks: PageContent['blocks'];
		site: SiteContent;
		media?: ImageManifest;
		bookingDays?: Array<{ date: string; free: number }>;
		galleryPhotos?: Record<number, GalleryPhoto[]>;
		marked?: boolean;
	} = $props();

	/** The single key of a block entry — the union's discriminant, and its name in the content. */
	const nameOf = (block: PageContent['blocks'][number]) => Object.keys(block)[0] ?? '';
</script>

{#snippet body(block: PageContent['blocks'][number], index: number)}
	{#if 'hero' in block}
		<Hero block={block.hero} {site} {media} />
	{:else if 'page_header' in block}
		<PageHeader block={block.page_header} {media} />
	{:else if 'intro' in block}
		<Intro block={block.intro} />
	{:else if 'services' in block}
		<Services block={block.services} {media} />
	{:else if 'steps' in block}
		<Steps block={block.steps} />
	{:else if 'packages' in block}
		<Packages block={block.packages} />
	{:else if 'gallery' in block}
		<Gallery block={block.gallery} {media} />
	{:else if 'gallery_grid' in block}
		<GalleryGrid
			block={block.gallery_grid}
			photos={galleryPhotos[index] ?? []}
			{media}
			{index}
		/>
	{:else if 'photo_grid' in block}
		<PhotoGrid block={block.photo_grid} {media} {index} />
	{:else if 'id_photo' in block}
		<IdPhoto block={block.id_photo} {site} />
	{:else if 'booking' in block}
		<!-- `marked` is only ever set by the preview route, so it is also the "no database here" signal. -->
		<Booking block={block.booking} {site} days={bookingDays} preview={marked} />
	{:else if 'about' in block}
		<About block={block.about} {media} />
	{:else if 'faq' in block}
		<Faq block={block.faq} />
	{:else if 'contact' in block}
		<Contact block={block.contact} {site} />
	{:else if 'cta' in block}
		<Cta block={block.cta} />
	{/if}
{/snippet}

<!--
	Keyed by index rather than by content: two blocks of the same type on one page are legitimate, and
	nothing inside a block is guaranteed unique.
-->
{#each blocks as block, i (i)}
	{#if marked}
		<!--
			Tag and attributes both come from the SDK rather than being spelled here. `sectionMarker()`
			supplies the `display: contents` that keeps this wrapper out of the layout, and the tag is an
			unregistered custom element for a reason worth knowing: a `<div>` inserted into a page would
			be claimed by that page's own `div { … }` rules. Nobody has a rule for `commitpress-section`.
		-->
		<svelte:element
			this={PREVIEW_SECTION_TAG}
			{...sectionMarker(sectionPath('', 'blocks', i), humanizeBlockName(nameOf(block)))}
		>
			{@render body(block, i)}
		</svelte:element>
	{:else}
		{@render body(block, i)}
	{/if}
{/each}
