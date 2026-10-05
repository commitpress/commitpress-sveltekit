<script lang="ts">
  import Logo from './Logo.svelte';
  import { page } from '$app/state';
  import type { SiteContent } from '../../commitpress.generated';
  import type { ImageAsset } from '$lib/media/assets';
  import type { PreviewAsset } from '@commitpress/sdk/preview';
  import type { Locale } from '$lib/content/locale';
  let { site, locale = 'en', alternates = [], media = {} }: { media?: Record<string,ImageAsset|PreviewAsset>; site: SiteContent; locale?: Locale; alternates?: { locale: string; href: string }[] } = $props();
  let menuOpen = $state(false);
  let menuButton = $state<HTMLButtonElement | null>(null);
  $effect(() => { page.url.pathname; menuOpen = false; });
  const home = $derived(site.details.home_link?.href);
  function close(event: KeyboardEvent) { if (event.key === 'Escape' && menuOpen) { menuOpen = false; menuButton?.focus(); } }
</script>
<svelte:window onkeydown={close} />
<header class="site-header">
  <div class="wrap header-row">
    <a href={home} aria-label={site.details.home_link?.label} class="brand"><Logo image={site.details.header_logo} {media} name={site.details.name} class="h-8 w-auto" /></a>
    <nav aria-label={site.ui?.main_navigation} class="desktop-nav">
      {#each site.nav as item}
        <a href={item.href?.href} class:current={page.url.pathname === item.href?.href}>{item.href?.label}</a>
      {/each}
    </nav>
    <nav class="languages" aria-label={site.ui?.languages}>
      {#each site.languages ?? [] as language}
        {@const alternate = alternates.find(item => item.locale === language.locale)}
        {@const target = alternate?.href ?? (alternates.length ? undefined : language.link?.href)}
        {#if target}
        <a href={target} lang={language.locale} hreflang={language.locale} aria-label={language.name} aria-current={language.locale === locale ? 'true' : undefined}>{language.label}</a>
        {/if}
      {/each}
    </nav>
    <button class="menu-button" bind:this={menuButton} aria-expanded={menuOpen} aria-controls="mobile-navigation" onclick={() => menuOpen = !menuOpen}>{menuOpen ? site.ui?.close_menu : site.ui?.menu}</button>
  </div>
  <nav id="mobile-navigation" hidden={!menuOpen} aria-label={site.ui?.mobile_navigation} class="mobile-nav wrap">
    {#each site.mobile_nav as item}<a href={item.href?.href} onclick={() => menuOpen = false}>{item.href?.label}</a>{/each}
  </nav>
</header>
<style>
  .site-header { border-bottom: 1px solid var(--color-line); background: var(--color-paper); }
  .header-row { min-height: 94px; display: flex; align-items: center; gap: 28px; }
  .brand { margin-right: auto; --logo-counter: var(--color-paper); }
  .desktop-nav { display: flex; align-items: center; gap: 25px; font-size: 14px; }
  .desktop-nav a { padding: 10px 0; border-bottom: 1px solid transparent; }
  .desktop-nav a:hover, .desktop-nav .current { border-color: currentColor; }
  .languages { display: flex; gap: 9px; padding-left: 22px; border-left: 1px solid var(--color-line); font: 11px var(--font-mono); }
  .languages a { opacity: .5; padding: 8px 0; }
  .languages a[aria-current], .languages a:hover { opacity: 1; }
  .menu-button { display: none; font-size: 14px; }
  .mobile-nav { padding-top: 12px; padding-bottom: 20px; }
  .mobile-nav a { display: block; padding: 10px 0; }
  @media(max-width: 900px) { .desktop-nav { display: none; } .menu-button { display: block; } .header-row { min-height: 78px; gap: 18px; } .languages { padding-left: 0; border: 0; } }
  @media(min-width:901px) { .mobile-nav { display: none; } }
</style>
