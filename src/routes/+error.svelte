<script lang="ts">
  import { page } from '$app/state';
  import { previewSite } from '$lib/preview/site.svelte';
  const site = $derived(previewSite.content ?? page.data.site);
</script>
<svelte:head><title>{site?.ui?.error_title ?? ''} | {site?.details.name ?? ''}</title></svelte:head>
<section class="wrap py-16">
  {#if site?.ui?.error_title}<h1>{site.ui.error_title}</h1>{/if}
  {#if site?.ui?.error_message}<p>{site.ui.error_message}</p>{/if}
  {#if site?.details.home_link?.href}<a class="text-link" href={site.details.home_link.href}>{site.details.home_link.label}</a>{/if}
</section>
