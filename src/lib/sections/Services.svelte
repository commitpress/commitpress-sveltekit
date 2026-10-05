<script lang="ts">
  import Frame from "$lib/components/Frame.svelte";
  import { reveal } from "$lib/actions/reveal";
  import type { ImageManifest } from "$lib/media/assets";
  import type { ServicesBlock } from "../../commitpress.generated";

  let { block, media = {} }: { block: ServicesBlock; media?: ImageManifest } =
    $props();

</script>

<section id="tjanster" class="bg-mist">
  <div class="wrap py-20 md:py-28 lg:py-32">
    <div class="flex flex-wrap items-end justify-between gap-6 pb-12 md:pb-16">
      <div class="reveal" use:reveal>
        <p class="eyebrow eyebrow-rule mb-5">{block.eyebrow}</p>
        <h2 class="display text-[clamp(1.9rem,3.6vw,3.25rem)]">
          {block.heading}
        </h2>
      </div>
      <p class="max-w-[38ch] text-[15px] reveal" use:reveal>{block.note}</p>
    </div>

    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 lg:gap-7">
      <!-- Keyed by position: a key must not be a value the editor can type. See `Contact`. -->
      {#each block.items as service, i (i)}
        <a href={service.href.href} class="group bg-white flex flex-col">
          <Frame
            ratio="aspect-[4/3]"
            alt={service.alt}
            image={service.image}
            {media}
          />
          <div class="flex flex-col flex-1 p-6 md:p-7">
            <h3 class="font-serif text-[1.6rem] leading-tight">
              {service.title}
            </h3>
            <p class="mt-3 text-[15px] flex-1">{service.body}</p>
          </div>
        </a>
      {/each}
    </div>
  </div>
</section>
