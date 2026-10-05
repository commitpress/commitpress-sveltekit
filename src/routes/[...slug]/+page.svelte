<script lang="ts">
  import ShowcasePage from '$lib/showcase/ShowcasePage.svelte';
  import StoryPage from '$lib/showcase/StoryPage.svelte';
  import type {PageData} from './$types';
  let {data}:{data:PageData}=$props();
  const title=$derived(data.entry?.story?.title || data.page?.showcase?.title || data.page?.seo?.title || 'Commitpress');
  const description=$derived(data.entry?.story?.summary || data.page?.showcase?.summary || '');
</script>
<svelte:head>
  <title>{title} | Commitpress</title><meta name="description" content={description} />
  <meta property="og:title" content={title} /><meta property="og:description" content={description} /><meta property="og:type" content={data.entry ? 'article' : 'website'} />
  {#each data.alternates as alternate}<link rel="alternate" hreflang={alternate.locale} href={alternate.href} />{/each}
</svelte:head>
{#if data.entry}<StoryPage content={data.entry} media={data.media} locale={data.locale} />
{:else if data.page}<ShowcasePage content={data.page} { ...data } />{/if}
