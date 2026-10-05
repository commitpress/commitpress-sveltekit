<script lang="ts">
  import Logo from './Logo.svelte';
  import { page } from '$app/state';
  import type { SiteContent } from '../../commitpress.generated';
  import type { Locale } from '$lib/content/locale';
  let { site, locale = 'en', alternates = [] }: { site: SiteContent; locale?: Locale; alternates?: { locale: string; href: string }[] } = $props();
  let menuOpen = $state(false);
  let menuButton = $state<HTMLButtonElement | null>(null);
  $effect(() => { page.url.pathname; menuOpen = false; });
  const home = $derived(locale === 'sv' ? '/sv' : '/');
  function close(event: KeyboardEvent) { if (event.key === 'Escape' && menuOpen) { menuOpen = false; menuButton?.focus(); } }
</script>
<svelte:window onkeydown={close} />
<header class="site-header">
  <div class="wrap header-row">
    <a href={home} aria-label="Commitpress home" class="brand"><Logo class="h-8 w-auto" /></a>
    <nav aria-label={locale === 'sv' ? 'Huvudmeny' : 'Main navigation'} class="desktop-nav">
      {#each site.nav as item}
        <a href={item.href.href} class:current={page.url.pathname === item.href.href}>{item.href.label}</a>
      {/each}
    </nav>
    <nav class="languages" aria-label={locale === 'sv' ? 'Språk' : 'Language'}>
      {#each alternates.length ? alternates : [{locale:'en',href:'/'},{locale:'sv',href:'/sv'}] as alternate}
        <a href={alternate.href} lang={alternate.locale} hreflang={alternate.locale} aria-label={alternate.locale === 'sv' ? 'Svenska' : 'English'} aria-current={alternate.locale === locale ? 'true' : undefined}>{alternate.locale.toUpperCase()}</a>
      {/each}
    </nav>
    <button class="menu-button" bind:this={menuButton} aria-expanded={menuOpen} aria-controls="mobile-navigation" onclick={() => menuOpen = !menuOpen}>{menuOpen ? (locale === 'sv' ? 'Stäng' : 'Close') : (locale === 'sv' ? 'Meny' : 'Menu')}</button>
  </div>
  <nav id="mobile-navigation" hidden={!menuOpen} aria-label="Mobile navigation" class="mobile-nav wrap">
    {#each site.mobile_nav as item}<a href={item.href.href} onclick={() => menuOpen = false}>{item.href.label}</a>{/each}
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
