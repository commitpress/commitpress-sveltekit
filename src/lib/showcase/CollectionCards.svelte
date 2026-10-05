<script lang="ts">
  import MediaImage from './MediaImage.svelte';
  import type { NotesContent } from '../../commitpress.generated';
  import type { ImageAsset } from '$lib/media/assets';
  import type { PreviewAsset } from '@commitpress/sdk-node/preview';
  let { cards, media }: { cards: (NonNullable<NotesContent['story']> & {href:string})[]; media: Record<string,ImageAsset | PreviewAsset> } = $props();
</script>
<div class="collection-grid">
  {#each cards as card}
    <a href={card.href} class="collection-card">
      <div class="card-image"><MediaImage image={card.cover} {media} sizes="(max-width: 640px) 100vw, 33vw" class="cover-image" /></div>
      <div class="card-meta"><span>{card.category}</span><span aria-hidden="true">↗</span></div>
      <h3>{card.title}</h3><p>{card.summary}</p>
    </a>
  {/each}
</div>
<style>
  .collection-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:32px; }
  .card-image { aspect-ratio: 4/3; overflow:hidden; background:var(--color-line); }
  .card-image :global(img) { width:100%; height:100%; object-fit:cover; transition:transform .3s; }
  .collection-card:hover :global(img) { transform:scale(1.025); }
  .card-meta { margin-top:20px; display:flex; justify-content:space-between; font:11px var(--font-mono); text-transform:uppercase; letter-spacing:.08em; color:var(--color-ash); }
  h3 { font:normal clamp(1.6rem,2.5vw,2.2rem)/1.15 var(--font-editorial); margin-top:12px; }
  p { margin-top:12px; font-size:15px; max-width:35ch; }
  @media(max-width:640px) { .collection-grid { grid-template-columns:1fr; gap:38px; } }
</style>
