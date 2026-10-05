<script lang="ts">
  import '../app.css';
  import Header from '$lib/components/Header.svelte';
  import Footer from '$lib/components/Footer.svelte';
  import { previewSite } from '$lib/preview/site.svelte';
  import { imageId } from '@commitpress/sdk/image';
  import { page } from '$app/state';
  import type { LayoutData } from './$types';
  let { data, children }: { data: LayoutData; children: import('svelte').Snippet } = $props();
  const site = $derived(previewSite.current ?? data.site);
  const media = $derived({...data.siteMedia,...previewSite.assets});
  const icon = $derived(media[imageId(site.details.favicon) ?? '']);
  const favicon = $derived(icon ? ('preview_url' in icon ? icon.preview_url : '/__commitpress__/media/images/'+icon.path) : undefined);
  $effect(() => { document.documentElement.lang = data.locale; });
</script>
<svelte:head><meta name="theme-color" content="#f6f3e9" />{#if favicon}<link rel="icon" href={favicon} />{/if}</svelte:head>
<a href="#main-content" class="skip-link">{site.ui?.skip_link ?? ''}</a>
<Header {site} {media} locale={data.locale} alternates={page.data.alternates ?? []} />
<main id="main-content" tabindex="-1">{@render children()}</main>
<Footer {site} {media} />
<style>
  .skip-link { position: fixed; left: 1rem; top: -5rem; z-index: 100; padding: .75rem 1rem; background: var(--color-ink); color: white; }
  .skip-link:focus { top: 1rem; }
</style>
