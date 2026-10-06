<script lang="ts">
  import ShowcasePage from './ShowcasePage.svelte';
  import StoryPage from './StoryPage.svelte';
  import { pageSection } from '$lib/content/page-types';
  import type { loadPage } from '$lib/content/pages.server';
  import type { loadEntry } from '$lib/content/notes.server';
  import type { SiteContent } from '../../commitpress.generated';

  type PageData = Awaited<ReturnType<typeof loadPage> | ReturnType<typeof loadEntry>> & { site: SiteContent };
  let { data }: { data: PageData } = $props();
  const section = $derived(data.page ? pageSection(data.page) : undefined);
  const title = $derived(data.entry?.story?.title || section?.title || data.page?.seo?.title || data.site.details.name);
  const description = $derived(data.entry?.story?.summary || section?.summary || '');
</script>

<svelte:head>
  <title>{title} | {data.site.details.name}</title>
  <meta name="description" content={description} />
  <meta property="og:title" content={title} />
  <meta property="og:description" content={description} />
  <meta property="og:type" content={data.entry ? 'article' : 'website'} />
  {#each data.alternates as alternate}
    <link rel="alternate" hreflang={alternate.locale} href={alternate.href} />
  {/each}
</svelte:head>

{#if data.entry}
  <StoryPage content={data.entry} media={data.media} locale={data.locale} />
{:else if data.page}
  <ShowcasePage content={data.page} { ...data } />
{/if}
