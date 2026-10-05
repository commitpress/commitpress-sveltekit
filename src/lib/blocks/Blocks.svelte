<script lang="ts">
  import Intro from '$lib/sections/Intro.svelte';
  import Faq from '$lib/sections/Faq.svelte';
  import Cta from '$lib/sections/Cta.svelte';
  import { sectionMarker, sectionPath, humanizeBlockName } from '@commitpress/sdk-node/preview';
  import type { PageContent } from '../../commitpress.generated';

  let { blocks = [], marked = false }: { blocks?: PageContent['blocks']; marked?: boolean } = $props();
  type Block = NonNullable<PageContent['blocks']>[number];
</script>

{#snippet body(block: Block)}
  {#if 'intro' in block}<Intro block={block.intro} />
  {:else if 'faq' in block}<Faq block={block.faq} />
  {:else if 'cta' in block}<Cta block={block.cta} />{/if}
{/snippet}

{#each blocks ?? [] as block, i (i)}
  {#if marked}
    <commitpress-section {...sectionMarker(sectionPath('', 'blocks', i), humanizeBlockName(Object.keys(block)[0] ?? ''))}>
      {@render body(block)}
    </commitpress-section>
  {:else}
    {@render body(block)}
  {/if}
{/each}
