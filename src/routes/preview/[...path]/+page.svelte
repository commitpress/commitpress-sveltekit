<script lang="ts">
  import {onMount} from 'svelte';
  import {connectPreviewContent,connectPreviewAssets,connectPreviewOverlay,takePreviewContent,takePreviewAssets,PREVIEW_HANDSHAKE,type PreviewAssetMap,type PreviewFolderMap} from '@commitpress/sdk/preview';
  import {galleryFolder,galleryOrder} from '@commitpress/sdk/gallery';
  import {previewSite} from '$lib/preview/site.svelte';
  import ShowcasePage from '$lib/showcase/ShowcasePage.svelte';
  import StoryPage from '$lib/showcase/StoryPage.svelte';
  import type {PageContent,NotesContent,SiteContent} from '../../../commitpress.generated';
  import type {PageData} from './$types';
  let {data}:{data:PageData}=$props();
  let posted=$state<PageContent|NotesContent|null>(null);
  let assets=$state<PreviewAssetMap>({});
  let folders=$state<PreviewFolderMap>({});
  let replayed=$state(false);
  const live=$derived(posted ?? (data.entry || data.page));
  const media=$derived({...data.media,...assets});
  const pageContent=$derived(live as PageContent|null);
  const field=$derived(pageContent?.showcase?.gallery);
  const folder=$derived(galleryFolder(field));
  const galleryIds=$derived(galleryOrder(field,folders[folder] ?? data.galleryIds,id=>id));
  function receive(content:PageContent|NotesContent|SiteContent){
    if(data.global)previewSite.set(content as SiteContent);
    else posted=content as PageContent|NotesContent;
  }
  onMount(()=>{
    const replay=takePreviewAssets();assets=replay.assets;folders=replay.folders;
    const previous=takePreviewContent<PageContent|NotesContent|SiteContent>();
    if(previous){receive(previous);replayed=true;}
    const offContent=connectPreviewContent(receive);
    const offAssets=connectPreviewAssets((next,nextFolders)=>{assets=next;folders=nextFolders;});
    const offOverlay=connectPreviewOverlay();
    window.parent?.postMessage({type:PREVIEW_HANDSHAKE},'*');
    return ()=>{offContent();offAssets();offOverlay();previewSite.clear();};
  });
</script>
<svelte:head><title>Preview | Commitpress</title><meta name="robots" content="noindex,nofollow" /></svelte:head>
{#key replayed}
  {#if data.kind === 'entry' && live}
    <StoryPage content={live as NotesContent} {media} locale={data.locale} marked />
  {:else if pageContent}
    <ShowcasePage content={pageContent} cards={data.cards} {media} {galleryIds} locale={data.locale} site={previewSite.current ?? data.site} marked={!data.global} />
  {:else}<p class="wrap py-16">{data.locale === 'sv' ? 'Ditt innehåll visas här när du börjar redigera.' : 'Your content will appear here as you start editing.'}</p>{/if}
{/key}
