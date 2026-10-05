<script lang="ts">
  import { imageId, imageRendition, imageAlt, type ImageValue } from '@commitpress/sdk-node/image';
  import type { ImageAsset } from '$lib/media/assets';
  import type { PreviewAsset, PreviewAssetVariant } from '@commitpress/sdk-node/preview';
  let { image, media, alt = '', class: className = '', eager = false, sizes = '(max-width: 640px) 100vw, 50vw' }: { image?: ImageValue; media: Record<string, ImageAsset | PreviewAsset>; alt?: string; class?: string; eager?: boolean; sizes?: string } = $props();
  function source(slot?: string) {
    const asset = media[imageId(image, slot) ?? ''];
    if (!asset) return null;
    const revision = 'updated_at' in asset && typeof asset.updated_at === 'number' ? asset.updated_at : asset.uploaded_at;
    const url = (variant: ImageAsset['variants'][number] | PreviewAssetVariant) => 'preview_url' in variant ? variant.preview_url : '/__commitpress__/media/images/' + variant.path + '?v=' + revision;
    const pin = imageRendition(image, slot);
    const variants = asset.variants.filter(v => pin ? v.name === pin : !v.custom).sort((a,b) => a.width-b.width);
    const largest = variants.at(-1);
    return { src: largest ? url(largest) : 'preview_url' in asset ? asset.preview_url : '/__commitpress__/media/images/' + asset.path, srcset: pin ? undefined : variants.map(v => url(v) + ' ' + v.width + 'w').join(', '), width: largest?.width ?? asset.width, height: largest?.height ?? asset.height, alt: imageAlt(image, slot) ?? (alt || asset.alt) };
  }
  const desktop = $derived(source());
  const mobile = $derived(source('mobile'));
</script>
{#if desktop}
  <picture>
    {#if mobile}<source media="(max-width: 640px)" srcset={mobile.srcset || mobile.src} {sizes} width={mobile.width} height={mobile.height} />{/if}
    <img src={desktop.src} srcset={desktop.srcset} {sizes} width={desktop.width} height={desktop.height} alt={desktop.alt} class={className} loading={eager ? 'eager' : 'lazy'} fetchpriority={eager ? 'high' : 'auto'} />
  </picture>
{:else}
  <div class="missing-image {className}" aria-label={alt || undefined}></div>
{/if}
<style>picture { display: contents; } img { display: block; } .missing-image { background: var(--color-line); min-height: 200px; }</style>
