<script lang="ts">
  import MediaImage from './MediaImage.svelte';
  import type { ImageAsset } from '$lib/media/assets';
  import type { PreviewAsset } from '@commitpress/sdk/preview';
  let { ids, media, locale = 'en' }: { ids:string[]; media:Record<string,ImageAsset | PreviewAsset>; locale?:string } = $props();
  let selected = $state('');
  let dialog = $state<HTMLDialogElement>();
  function open(id:string) { selected=id; dialog?.showModal(); }
</script>
<div class="image-grid">
  {#each ids as id, i}
    <button class="gallery-image" class:tall={i % 3 === 0} onclick={() => open(id)} aria-label={(locale === 'sv' ? 'Öppna bild: ' : 'Open image: ') + (media[id]?.alt ?? '')}>
      <MediaImage image={id} {media} sizes="(max-width:640px) 100vw, 50vw" />
      <span class="image-caption"><span>{String(i+1).padStart(2,'0')}</span><span aria-hidden="true">↗</span></span>
    </button>
  {/each}
</div>
<dialog bind:this={dialog} aria-label={locale === 'sv' ? 'Bildvisare' : 'Image viewer'}>
  <button class="close-image" onclick={() => dialog?.close()}>{locale === 'sv' ? 'Stäng' : 'Close'} ×</button>
  {#if selected}<MediaImage image={selected} {media} eager sizes="90vw" /><p>{media[selected]?.alt}</p>{/if}
</dialog>
<style>
  .image-grid { display:grid; grid-template-columns:1fr 1fr; gap:28px; align-items:start; }
  .gallery-image { text-align:left; position:relative; width:100%; }
  .gallery-image :global(img) { width:100%; height:360px; object-fit:cover; }
  .gallery-image.tall :global(img) { height:480px; }
  .image-caption { display:flex; justify-content:space-between; margin-top:12px; font:12px var(--font-mono); }
  dialog { margin:auto; padding:22px; background:var(--color-paper); max-width: min(1000px,94vw); max-height:94svh; overflow:auto; color:var(--color-ink); }
  dialog::backdrop { background:#1d2927ba; }
  dialog :global(img) { max-height:75svh; width:100%; object-fit:contain; }
  .close-image { display:block; margin-left:auto; margin-bottom:15px; font-size:14px; }
  dialog p { margin-top:15px; font-size:14px; }
  @media(max-width:640px) { .image-grid { gap:20px; } .gallery-image :global(img) { height:220px; } .gallery-image.tall :global(img) { height:300px; } }
</style>
