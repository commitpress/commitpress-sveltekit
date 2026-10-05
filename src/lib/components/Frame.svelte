<script lang="ts">
  import ResponsiveImage from "$lib/components/ResponsiveImage.svelte";
  import { reveal } from "$lib/actions/reveal";
  import type { ImageManifest } from "$lib/media/assets";
  import { imageId, type ImageValue } from "@commitpress/sdk/image";

  interface Props {
    /** Aspect utility for the box, e.g. `aspect-[3/2]`. */
    ratio: string;
    /**
     * What the photograph shows, where the caller knows better than the library does — see the
     * note on the same prop in `ResponsiveImage`. Left off, the description comes off the asset,
     * which is where it is written and where fixing it fixes every page at once.
     */
    alt?: string;
    /**
     * What the field's image control holds, if a picture has been chosen — an asset id, or the
     * object one carrying a pinned rendition stores. See the note in `ResponsiveImage`.
     */
    image?: ImageValue;
    media?: ImageManifest;
    /**
     * Load this one eagerly. Off by default: a frame is below the fold everywhere it is used, and
     * the hero is the only thing on these pages that should compete for the first bytes.
     */
    priority?: boolean;
    class?: string;
    title?: string;
    tagline?: string;
  }

  let {
    ratio,
    alt,
    image,
    media = {},
    priority = false,
    class: className = "",
    title,
    tagline,
  }: Props = $props();

  /**
   * Whether there is a photograph at all, which is what decides between the two things this box
   * renders. Read through `imageId` rather than by truthiness: an object value naming no picture is
   * still an object, and a frame that took it for one would draw an empty box where the placeholder
   * belongs.
   */
  const picked = $derived(!!imageId(image));
</script>

<!--
	A fixed-ratio box for a photograph, holding either the photograph or the panel that stands in for
	one. The swap is a change of element and nothing else: `app.css` addresses this box's contents as
	`.frame > :where(img, .frame-fill)`, so the ratio, the crop, the hover push and the reveal motion
	are already written for both and neither needs a class of its own.
-->
<div
  class="frame flex p-12 items-end {ratio} {className}"
  use:reveal
>
  {#if title || tagline}
    <div class="flex gap-2 flex-col relative z-10 text-white">
      {#if title}
        <div class="display text-[clamp(1.9rem,3.6vw,3.25rem)]">{title}</div>
      {/if}
      {#if tagline}
        <div class="text-lg">{tagline}</div>
      {/if}
    </div>
  {/if}
  {#if picked}
    <ResponsiveImage
      {image}
      {media}
      {alt}
      loading={priority ? "eager" : "lazy"}
      fetchpriority={priority ? "high" : undefined}
    />
  {:else}
    <!-- The empty box, where no picture has been chosen yet. The caption is only a caption when the
         caller gave one: with the descriptions living on the assets, there is nothing to write here
         about a picture that does not exist, and an empty `<span>` is a box that keeps its shape. -->
    <div class="frame-fill flex items-center justify-center bg-mist">
      {#if alt}
        <span class="eyebrow px-6 text-center text-balance">{alt}</span>
      {/if}
    </div>
  {/if}
</div>
