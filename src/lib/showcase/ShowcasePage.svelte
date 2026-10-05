<script lang="ts">
  import MediaImage from './MediaImage.svelte';
  import CollectionCards from './CollectionCards.svelte';
  import ImageGallery from './ImageGallery.svelte';
  import Blocks from '$lib/blocks/Blocks.svelte';
  import { richtext } from '@commitpress/sdk/richtext';
  import { sectionMarker } from '@commitpress/sdk/preview';
  import type { NotesContent, SiteContent } from '../../commitpress.generated';
  import { pageSchema, pageSection, type WebsitePageContent } from '$lib/content/page-types';
  import type { ImageAsset } from '$lib/media/assets';
  import type { PreviewAsset } from '@commitpress/sdk/preview';
  let { content, cards = [], media = {}, galleryIds = [], locale = 'en', marked = false, site }: { content:WebsitePageContent; cards:(NonNullable<NotesContent['story']>&{href:string})[]; media:Record<string,ImageAsset|PreviewAsset>; galleryIds:string[]; locale?:'en'|'sv'; marked?:boolean; site:SiteContent } = $props();
  const section = $derived(pageSection(content));
  const layout = $derived(pageSchema(content));
  const blocks = $derived('blocks' in content ? content.blocks : []);
  const home = $derived(layout === 'home');
  const sv = $derived(locale === 'sv');
  const href = (en:string, sw:string) => sv ? '/sv/'+sw : '/'+en;
</script>
{#if section}
  <svelte:element this={marked ? 'commitpress-section' : 'section'} {...marked ? sectionMarker(layout, section.eyebrow || 'Page') : {}}>
    <div class="wrap opening" class:home>
      <div class="opening-copy">
        <p class="kicker"><span class="dot"></span>{section.eyebrow}</p>
        <h1>{section.title}</h1>
        <p class="opening-summary">{section.summary}</p>
        {#if home}
          <a class="text-link" href={href('collection','samling')}>{sv ? 'Utforska samlingen' : 'Explore the collection'} <span aria-hidden="true">↗</span></a>
          <div class="home-details"><span>01 / COMMITPRESS</span><span>{sv ? 'Sidor · Bilder · Idéer' : 'Pages · Pictures · Ideas'}</span></div>
        {:else if layout === 'page' && section.next_page?.href}
          <a class="text-link" href={section.next_page.href} target={section.next_page.target}>{section.next_page.label} <span aria-hidden="true">↗</span></a>
        {/if}
      </div>
      {#if section.cover && (home || layout === 'page')}
        <figure class="opening-image">
          <MediaImage image={section.cover} {media} eager sizes="(max-width: 800px) 100vw, 50vw" />
          <figcaption><span>{sv ? 'En bild från biblioteket' : 'From the image library'}</span><span>↗</span></figcaption>
        </figure>
      {/if}
    </div>
  </svelte:element>
  {#if home}
    <section class="wrap example-navigation">
      <p class="kicker">{sv ? 'Ta en titt' : 'Take a look around'}</p>
      <div class="example-links">
        <a href={href('pages','sidor')}><span>01</span><h2>{sv ? 'En sida i taget.' : 'One page at a time.'}</h2><p>{sv ? 'Olika layouter. Samma grund.' : 'Different layouts. A shared foundation.'}</p><span class="example-arrow">↗</span></a>
        <a href={href('images','bilder')}><span>02</span><h2>{sv ? 'Bilder med plats.' : 'Pictures with room.'}</h2><p>{sv ? 'Från liten bild till helskärm.' : 'From a small crop to the whole picture.'}</p><span class="example-arrow">↗</span></a>
        <a href={href('collection','samling')}><span>03</span><h2>{sv ? 'Något att samla på.' : 'Something to collect.'}</h2><p>{sv ? 'En samling. En sida för varje inlägg.' : 'A collection. A page for every entry.'}</p><span class="example-arrow">↗</span></a>
      </div>
    </section>
  {/if}
  {#if home || layout === 'collection'}
    <section class="wrap collection-section">
      <div class="section-heading"><div><p class="kicker">{sv ? 'Från samlingen' : 'From the collection'}</p><h2>{sv ? 'Några saker vi sparat.' : 'A few things we kept.'}</h2></div>{#if home}<a class="text-link" href={href('collection','samling')}>{sv ? 'Visa alla' : 'View all'} ↗</a>{/if}</div>
      <CollectionCards {cards} {media} />
    </section>
  {:else if layout === 'gallery'}
    <section class="wrap gallery-section"><ImageGallery ids={galleryIds} {media} {locale} /></section>
  {:else if layout === 'page'}
    <section class="wrap reading-section"><p class="kicker">{sv ? 'Sidans innehåll' : 'Page content'}</p><div class="prose">{@html richtext(section.body)}</div></section>
  {/if}
  {#if home}
    <section class="wrap locale-note"><span class="locale-symbol">Aa</span><div><p class="kicker">{sv ? 'Två språk, samma webbplats' : 'Two languages, one website'}</p><h2>{sv ? 'Hej. Hello.' : 'Hello. Hej.'}</h2><p>{sv ? 'Byt till engelska i menyn. Rubriker, innehåll och sökvägar följer med.' : 'Switch to Swedish in the navigation. The headlines, content, and routes come along.'}</p></div><a class="text-link" href={sv ? '/' : '/sv'}>{sv ? 'Read in English' : 'Läs på svenska'} ↗</a></section>
  {/if}
{/if}
{#if blocks?.length}<Blocks {blocks} {marked} />{/if}
