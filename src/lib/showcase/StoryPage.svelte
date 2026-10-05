<script lang="ts">
  import MediaImage from './MediaImage.svelte';
  import {richtext} from '@commitpress/sdk-node/richtext';
  import { sectionAttributes } from '$lib/preview/markers';
  import type {NotesContent} from '../../commitpress.generated';
  import type {ImageAsset} from '$lib/media/assets';
  import type {PreviewAsset} from '@commitpress/sdk-node/preview';
  let { content, media, locale='en', marked=false }: { content:NotesContent; media:Record<string,ImageAsset|PreviewAsset>; locale?:string; marked?:boolean }=$props();
  const story=$derived(content.story);
</script>
{#if story}
<article {...marked ? sectionAttributes('story', story.title || '') : {}}>
  <div class="wrap story-opening">
    {#if story.back_link?.href}<a class="kicker" href={story.back_link.href} target={story.back_link.target}><span aria-hidden="true">←</span> {story.back_link.label}</a>{/if}
    <p class="story-category">{story.category}</p><h1>{story.title}</h1><p class="opening-summary">{story.summary}</p>
    {#if story.date}<time datetime={story.date}>{new Intl.DateTimeFormat(locale,{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(story.date+'T12:00:00Z'))}</time>{/if}
  </div>
  {#if story.cover}<div class="wrap story-image"><MediaImage image={story.cover} {media} eager sizes="100vw" /></div>{/if}
  <div class="wrap story-body"><div class="prose">{@html richtext(story.body)}</div></div>
</article>
{/if}
