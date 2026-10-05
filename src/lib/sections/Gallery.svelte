<script lang="ts">
  /**
   * A teaser for the galleries — hand-placed tiles in two shapes, each one a way in.
   *
   * A tile carries a link the editor picked, not a media-library folder. That is a change from how
   * this block used to work and it moves the whole question of "where does this tile go" into the
   * CMS: the picker only offers pages that exist, so the URL arrives resolved and nothing has to be
   * looked up here or in the load function. It also means a tile is no longer required to point at a
   * gallery page — a wedding tile may lead to the wedding page itself.
   */
  import Frame from "$lib/components/Frame.svelte";
  import { reveal } from "$lib/actions/reveal";
  import type { ImageManifest } from "$lib/media/assets";
  import type { GalleryBlock } from "../../commitpress.generated";

  let { block, media = {} }: { block: GalleryBlock; media?: ImageManifest } =
    $props();

</script>

<section id="bilder" class="wrap py-20 md:py-28 lg:py-32">
  <div class="reveal pb-12 md:pb-16" use:reveal>
    <p class="eyebrow eyebrow-rule mb-5">{block.eyebrow}</p>
    <h2 class="display text-[clamp(1.9rem,3.6vw,3.25rem)]">{block.heading}</h2>
  </div>

  <!--
		Two tile shapes: a landscape one across two columns and an upright one in a single column.
		Alternating them is what keeps the grid from reading as a contact sheet.
	-->
  <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-5">
    {#each block.items as item, i (i)}
      <!--
				A tile with nothing picked renders as a plain element rather than a link. `href="#"` looks
				like a link, reads as one to a screen reader, and does nothing.

				The field is required, so this is the tile an editor is halfway through rather than a
				state the site is expected to sit in — but a block saved before the field existed has no
				link in it either, and that must not take the page down.
			-->
      {@const href = item.link.href}
      <!--
				A tile shows no words, so a link would otherwise be announced by the photograph's
				description — "Inbjudan" rather than "Frida och Marcus". The label the editor wrote
				alongside the link names where the tile *goes*, which is what a link should be announced
				as. Only on a real link, and only when one was written: an empty one leaves the image's
				description as the name, which is worse than nothing but better than an empty name.
			-->
      {@const label = (href && item.link?.label) || undefined}
      <svelte:element
        this={href ? "a" : "div"}
        {href}
        aria-label={label}
        class="group"
        class:col-span-2={item.span === "wide"}
      >
        <Frame
          ratio={item.span === "wide" ? "aspect-[3/2]" : "aspect-[3/4]"}
          alt={item.alt}
          image={item.image}
          {media}
          title={item.title}
          tagline={item.tagline}
        />
      </svelte:element>
    {/each}
  </div>
</section>
