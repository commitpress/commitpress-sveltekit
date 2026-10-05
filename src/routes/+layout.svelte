<script lang="ts">
  import '../app.css';
  import Header from '$lib/components/Header.svelte';
  import Footer from '$lib/components/Footer.svelte';
  import { previewSite } from '$lib/preview/site.svelte';
  import { page } from '$app/state';
  import type { LayoutData } from './$types';
  let { data, children }: { data: LayoutData; children: import('svelte').Snippet } = $props();
  const site = $derived(previewSite.current ?? data.site);
  $effect(() => { document.documentElement.lang = data.locale; });
</script>
<svelte:head><meta name="theme-color" content="#f6f3e9" /></svelte:head>
<a href="#main-content" class="skip-link">{data.locale === 'sv' ? 'Till innehållet' : 'Skip to content'}</a>
<Header {site} locale={data.locale} alternates={page.data.alternates ?? []} />
<main id="main-content" tabindex="-1">{@render children()}</main>
<Footer {site} locale={data.locale} />
<style>
  .skip-link { position: fixed; left: 1rem; top: -5rem; z-index: 100; padding: .75rem 1rem; background: var(--color-ink); color: white; }
  .skip-link:focus { top: 1rem; }
</style>
