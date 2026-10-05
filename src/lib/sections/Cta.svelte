<script lang="ts">
  import type { CtaBlock } from '../../commitpress.generated';
  let { block }: { block: CtaBlock } = $props();
</script>
<section class="border-t border-line bg-accent-soft">
  <div class="wrap py-16 md:py-20">
    <p class="eyebrow">{block.eyebrow}</p>
    <h2 class="display mt-4 max-w-[24ch] text-[clamp(1.8rem,3.5vw,2.6rem)]">{block.heading}</h2>
    <p class="mt-5 max-w-[58ch]">{block.body}</p>
    {#if block.buttons?.length}
      <div class="mt-7 flex flex-wrap gap-3">
        {#each block.buttons as { link, style }}
          {#if link?.href}<a href={link.href} target={link.target} class={style === 'border' ? 'btn-ghost' : 'btn-solid'}>{link.label ?? ''}</a>{/if}
        {/each}
      </div>
    {/if}
  </div>
</section>
