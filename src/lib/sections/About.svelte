<script lang="ts">
  import Frame from "$lib/components/Frame.svelte";
  import { reveal } from "$lib/actions/reveal";
  import type { ImageManifest } from "$lib/media/assets";
  import type { AboutBlock } from "../../commitpress.generated";

  let { block, media = {} }: { block: AboutBlock; media?: ImageManifest } =
    $props();

</script>

<section id="om" class="bg-mist">
  <div class="wrap py-20 md:py-28 lg:py-32">
    <div class="grid grid-cols-12 gap-x-8 gap-y-12 items-center">
      <div class="col-span-12 sm:col-span-7 lg:col-span-5 reveal" use:reveal>
        <Frame
          ratio="aspect-[4/5]"
          alt={block.alt}
          image={block.image}
          {media}
        />
      </div>

      <div class="col-span-12 lg:col-span-6 lg:col-start-7 reveal" use:reveal>
        <p class="eyebrow eyebrow-rule mb-6">{block.eyebrow}</p>
        <p
          class="font-serif font-light text-[clamp(1.5rem,2.6vw,2.25rem)] leading-[1.35] text-ink max-w-[24ch]"
        >
          {block.statement}
        </p>

        {#each block.paragraphs as entry, i (i)}
          <p
            class="max-w-[46ch] text-[17px]"
            class:mt-7={i === 0}
            class:mt-5={i > 0}
          >
            {entry.paragraph}
          </p>
        {/each}
      </div>
    </div>
  </div>
</section>
