<script lang="ts">
  import ResponsiveImage from '$lib/components/ResponsiveImage.svelte';
  import type { ImageManifest } from '$lib/media/assets';
  import type { PageHeaderBlock } from '../../commitpress.generated';
  let { block, media = {} }: { block: PageHeaderBlock; media?: ImageManifest } = $props();
</script>
<section class="border-b border-line bg-mist">
  <div class="wrap grid items-center gap-10 py-20 md:py-24" class:md:grid-cols-2={!!block.image}>
    <div>
      <p class="eyebrow mb-6">{block.eyebrow}</p>
      <h1 class="display max-w-[19ch] text-[clamp(2.4rem,5.5vw,4rem)]">{block.heading}</h1>
      {#if block.lead}<p class="mt-6 max-w-[52ch] text-lg">{block.lead}</p>{/if}
      {#if block.buttons?.length}
        <div class="mt-8 flex flex-wrap gap-3">
          {#each block.buttons as button, i}
            {#if button.link?.href}<a href={button.link.href} target={button.link.target} class={i === 0 ? 'btn-solid' : 'btn-ghost'}>{button.link.label ?? ''}</a>{/if}
          {/each}
        </div>
      {/if}
    </div>
    {#if block.image}
      <div class="aspect-[4/3] overflow-hidden rounded-xl bg-white">
        <ResponsiveImage image={block.image} {media} alt={block.alt} class="h-full w-full object-cover" loading="eager" fetchpriority="high" />
      </div>
    {/if}
  </div>
</section>
