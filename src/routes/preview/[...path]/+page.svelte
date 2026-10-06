<script lang="ts">
  import { onMount } from 'svelte';
  import {
    connectPreviewContent,
    connectPreviewAssets,
    connectPreviewOverlay,
    takePreviewContent,
    takePreviewAssets,
    PREVIEW_HANDSHAKE,
    type PreviewAssetMap,
    type PreviewFolderMap,
  } from '@commitpress/sdk-node/preview';
  import { galleryFolder, galleryOrder } from '@commitpress/sdk-node/gallery';
  import { previewSite, setPreviewSite, clearPreviewSite } from '$lib/preview/site.svelte';
  import ShowcasePage from '$lib/showcase/ShowcasePage.svelte';
  import StoryPage from '$lib/showcase/StoryPage.svelte';
  import type { NotesContent, SiteContent } from '../../../commitpress.generated';
  import { pageSection, type WebsitePageContent } from '$lib/content/page-types';
  import type { PageData } from './$types';

  type PreviewContent = WebsitePageContent | NotesContent | SiteContent;
  let { data }: { data: PageData } = $props();
  let posted = $state<WebsitePageContent | NotesContent | null>(null);
  let assets = $state<PreviewAssetMap>({});
  let folders = $state<PreviewFolderMap>({});
  let replayed = $state(false);

  const live = $derived(posted ?? data.entry ?? data.page);
  const media = $derived({ ...data.media, ...assets });
  const site = $derived(previewSite.content ?? data.site);
  const pageContent = $derived(data.kind === 'page' ? live as WebsitePageContent | null : null);
  const galleryValue = $derived(pageContent ? pageSection(pageContent)?.gallery : undefined);
  const folder = $derived(galleryFolder(galleryValue));
  const galleryIds = $derived(galleryOrder(galleryValue, folders[folder] ?? data.galleryIds, id => id));

  function receiveContent(content: PreviewContent) {
    if (data.global) setPreviewSite(content as SiteContent);
    else posted = content as WebsitePageContent | NotesContent;
  }

  function receiveAssets(next: PreviewAssetMap, nextFolders: PreviewFolderMap) {
    assets = next;
    folders = nextFolders;
    previewSite.assets = next;
  }

  onMount(() => {
    // Replay messages that arrived before this component mounted.
    const savedAssets = takePreviewAssets();
    receiveAssets(savedAssets.assets, savedAssets.folders);
    const savedContent = takePreviewContent<PreviewContent>();
    if (savedContent) {
      receiveContent(savedContent);
      replayed = true;
    }

    const stopContent = connectPreviewContent(receiveContent);
    const stopAssets = connectPreviewAssets(receiveAssets);
    const stopOverlay = connectPreviewOverlay();
    window.parent.postMessage({ type: PREVIEW_HANDSHAKE }, '*');

    return () => {
      stopContent();
      stopAssets();
      stopOverlay();
      clearPreviewSite();
    };
  });
</script>

<svelte:head>
  <title>{site.ui?.preview_title ?? ''} | {site.details.name}</title>
  <meta name="robots" content="noindex,nofollow" />
</svelte:head>

{#key replayed}
  {#if data.kind === 'entry' && live}
    <StoryPage content={live as NotesContent} {media} locale={data.locale} marked />
  {:else if pageContent}
    <ShowcasePage content={pageContent} cards={data.cards} {media} {galleryIds} {site} marked={!data.global} />
  {:else}
    <p class="wrap py-16">{site.ui?.preview_empty ?? ''}</p>
  {/if}
{/key}
