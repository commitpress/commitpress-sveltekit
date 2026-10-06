<script lang="ts">
  import { imageId, imageRendition, imageAlt, type ImageValue } from '@commitpress/sdk-node/image';
  import type { ImageAsset } from '$lib/media/assets';
  import type { PreviewAsset, PreviewAssetVariant } from '@commitpress/sdk-node/preview';

  let {
    image,
    media,
    alt = '',
    class: className = '',
    eager = false,
    sizes = '(max-width: 640px) 100vw, 50vw',
  }: {
    image?: ImageValue;
    media: Record<string, ImageAsset | PreviewAsset>;
    alt?: string;
    class?: string;
    eager?: boolean;
    sizes?: string;
  } = $props();

  function source(slot?: string) {
    const asset = media[imageId(image, slot) ?? ''];
    if (!asset) return null;

    const revision = 'updated_at' in asset ? asset.updated_at ?? asset.uploaded_at : asset.uploaded_at;
    const rendition = imageRendition(image, slot);
    const variants = asset.variants.filter(variant => {
      if (variant.name === 'cp-thumb') return false;
      if (rendition) return variant.name === rendition;
      return !variant.custom;
    }).sort((a, b) => a.width - b.width);

    function variantUrl(variant: ImageAsset['variants'][number] | PreviewAssetVariant) {
      if ('preview_url' in variant) return variant.preview_url;
      return '/__commitpress__/media/images/' + variant.path + '?v=' + revision;
    }

    const largest = variants.at(-1);
    const original = 'preview_url' in asset ? asset.preview_url : '/__commitpress__/media/images/' + asset.path;
    return {
      src: largest ? variantUrl(largest) : original,
      srcset: rendition ? undefined : variants.map(variant => variantUrl(variant) + ' ' + variant.width + 'w').join(', '),
      width: largest?.width ?? asset.width,
      height: largest?.height ?? asset.height,
      alt: imageAlt(image, slot) ?? (alt || asset.alt),
    };
  }

  const desktop = $derived(source());
  const mobile = $derived(source('mobile'));
</script>

{#if desktop}
  <picture>
    {#if mobile}
      <source media="(max-width: 640px)" srcset={mobile.srcset || mobile.src} {sizes} width={mobile.width} height={mobile.height} />
    {/if}
    <img
      src={desktop.src}
      srcset={desktop.srcset}
      {sizes}
      width={desktop.width}
      height={desktop.height}
      alt={desktop.alt}
      class={className}
      loading={eager ? 'eager' : 'lazy'}
      fetchpriority={eager ? 'high' : 'auto'}
    />
  </picture>
{:else}
  <div class="missing-image {className}" aria-label={alt || undefined}></div>
{/if}

<style>
  picture { display: contents; }
  img { display: block; }
  .missing-image { background: var(--color-line); min-height: 200px; }
</style>
