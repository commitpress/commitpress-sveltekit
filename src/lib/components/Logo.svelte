<script lang="ts">
  import MediaImage from '$lib/showcase/MediaImage.svelte';
  import type { ImageAsset } from '$lib/media/assets';
  import type { PreviewAsset } from '@commitpress/sdk/preview';
  import type { ImageValue } from '@commitpress/sdk/image';
  let { image, media, name = '', class: className = '' }: { image?:ImageValue; media:Record<string,ImageAsset|PreviewAsset>; name?:string; class?:string } = $props();
</script>
{#if image}<MediaImage {image} {media} alt={name} class={className} eager sizes="160px" />{:else}<span>{name}</span>{/if}
