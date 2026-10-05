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
  let { content, cards = [], media = {}, galleryIds = [], marked = false, site }: { content:WebsitePageContent; cards:(NonNullable<NotesContent['story']>&{href:string})[]; media:Record<string,ImageAsset|PreviewAsset>; galleryIds:string[]; marked?:boolean; site:SiteContent } = $props();
  const section = $derived(pageSection(content));
  const layout = $derived(pageSchema(content));
  const blocks = $derived('blocks' in content ? content.blocks : []);
  const home = $derived(layout === 'home');
  const navigation = $derived('navigation' in content ? content.navigation : undefined);
  const highlights = $derived('highlights' in content ? content.highlights : undefined);
  const languageNote = $derived('language_note' in content ? content.language_note : undefined);
  const openingLink = $derived(home ? section?.link : section?.next_page);
</script>
{#if section}
  <svelte:element this={marked ? 'commitpress-section' : 'section'} {...marked ? sectionMarker(layout, section.eyebrow || section.title || '') : {}}>
    <div class="wrap opening" class:home>
      <div class="opening-copy">
        {#if section.eyebrow}<p class="kicker"><span class="dot"></span>{section.eyebrow}</p>{/if}
        {#if section.title}<h1>{section.title}</h1>{/if}
        {#if section.summary}<p class="opening-summary">{section.summary}</p>{/if}
        {#if openingLink?.href}<a class="text-link" href={openingLink.href} target={openingLink.target}>{openingLink.label} <span aria-hidden="true">↗</span></a>{/if}
        {#if home && (section.detail_label || section.detail_note)}<div class="home-details"><span>{section.detail_label ?? ''}</span><span>{section.detail_note ?? ''}</span></div>{/if}
      </div>
      {#if section.cover && (home || layout === 'page')}
        <figure class="opening-image">
          <MediaImage image={section.cover} {media} eager sizes="(max-width: 800px) 100vw, 50vw" />
          {#if section.caption}<figcaption><span>{section.caption}</span><span aria-hidden="true">↗</span></figcaption>{/if}
        </figure>
      {/if}
    </div>
  </svelte:element>
{/if}
{#if home && navigation?.items?.length}
  <section class="wrap example-navigation" {...marked ? sectionMarker('navigation', navigation.heading ?? '') : {}}>
    {#if navigation.heading}<p class="kicker">{navigation.heading}</p>{/if}
    <div class="example-links">
      {#each navigation.items as item, i (i)}
        {#if item.link?.href}<a href={item.link.href} target={item.link.target} {...marked ? sectionMarker(`navigation.items[${i}]`, item.title ?? '') : {}}>{#if item.number}<span>{item.number}</span>{/if}{#if item.title}<h2>{item.title}</h2>{/if}{#if item.summary}<p>{item.summary}</p>{/if}<span class="example-arrow" aria-hidden="true">↗</span></a>{/if}
      {/each}
    </div>
  </section>
{/if}
{#if (home && highlights) || layout === 'collection'}
  <section class="wrap collection-section" {...marked ? sectionMarker('highlights', highlights?.title ?? '') : {}}>
    {#if highlights?.eyebrow || highlights?.title || highlights?.link?.href}<div class="section-heading"><div>{#if highlights.eyebrow}<p class="kicker">{highlights.eyebrow}</p>{/if}{#if highlights.title}<h2>{highlights.title}</h2>{/if}</div>{#if highlights.link?.href}<a class="text-link" href={highlights.link.href} target={highlights.link.target}>{highlights.link.label} <span aria-hidden="true">↗</span></a>{/if}</div>{/if}
    <CollectionCards {cards} {media} />
  </section>
{:else if layout === 'gallery'}
  <section class="wrap gallery-section"><ImageGallery ids={galleryIds} {media} labels={site.ui} /></section>
{:else if layout === 'page' && section?.body}
  <section class="wrap reading-section" {...marked ? sectionMarker('page.body', section.body_label ?? '') : {}}>{#if section.body_label}<p class="kicker">{section.body_label}</p>{/if}<div class="prose">{@html richtext(section.body)}</div></section>
{/if}
{#if home && languageNote}
  <section class="wrap locale-note" {...marked ? sectionMarker('language_note', languageNote.title ?? '') : {}}>{#if languageNote.symbol}<span class="locale-symbol">{languageNote.symbol}</span>{/if}<div>{#if languageNote.eyebrow}<p class="kicker">{languageNote.eyebrow}</p>{/if}{#if languageNote.title}<h2>{languageNote.title}</h2>{/if}{#if languageNote.body}<p>{languageNote.body}</p>{/if}</div>{#if languageNote.link?.href}<a class="text-link" href={languageNote.link.href} target={languageNote.link.target}>{languageNote.link.label} <span aria-hidden="true">↗</span></a>{/if}</section>
{/if}
{#if blocks?.length}<Blocks {blocks} {marked} />{/if}
