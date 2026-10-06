<script lang="ts">
  import ContentPage from '$lib/showcase/ContentPage.svelte';
  import type { PageData } from './$types';
  let { data }: { data: PageData } = $props();
</script>

<ContentPage {data} />
