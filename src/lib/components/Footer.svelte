<script lang="ts">
  import Logo from './Logo.svelte';
  import type { SiteContent } from '../../commitpress.generated';
  import type { ImageAsset } from '$lib/media/assets';
  import type { PreviewAsset } from '@commitpress/sdk/preview';
  import type { Locale } from '$lib/content/locale';
  let { site, media = {} }: { media?:Record<string,ImageAsset|PreviewAsset>; site: SiteContent; locale?: Locale } = $props();
</script>
<footer>
  <div class="wrap footer-top">
    <div><a href={site.details.home_link?.href} aria-label={site.details.home_link?.label}><Logo image={site.details.footer_logo} {media} name={site.details.name} class="h-8 w-auto" /></a><p>{site.details.tagline}</p></div>
    <nav aria-label={site.ui?.footer_navigation}>{#each site.nav as item}<a href={item.href?.href}>{item.href?.label}</a>{/each}</nav>
  </div>
  <div class="wrap footer-bottom"><span>{site.footer?.copyright?.replaceAll('{year}', String(new Date().getFullYear())).replaceAll('{name}', site.details.name ?? '') ?? ''}</span><span>{site.footer?.text ?? ''}</span></div>
</footer>
<style>
  footer { margin-top: 80px; background: var(--color-ink); color: var(--color-paper); --logo-counter: var(--color-ink); }
  .footer-top { padding-top: 50px; padding-bottom: 50px; display: flex; align-items: flex-start; justify-content: space-between; gap: 30px; }
  p { color: inherit; opacity: .65; font-size: 14px; margin-top: 16px; }
  nav { display: flex; flex-wrap: wrap; gap: 22px; font-size: 14px; }
  nav a:hover { text-decoration: underline; text-underline-offset: 5px; }
  .footer-bottom { padding-top: 22px; padding-bottom: 24px; border-top: 1px solid #ffffff25; display: flex; justify-content: space-between; gap: 18px; font-size: 12px; opacity: .65; }
  @media(max-width:650px) { .footer-top, .footer-bottom { flex-direction: column; } nav { gap: 14px 20px; } }
</style>
