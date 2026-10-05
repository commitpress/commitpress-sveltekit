<script lang="ts">
  import Branding from './Branding.svelte';
  let { class: className = 'h-8 w-auto' }: { class?: string } = $props();
</script>
<span class="inline-block aspect-[657/136] {className}" role="img" aria-label="Commitpress">
  <Branding stroke="currentColor" fill="var(--logo-counter, #fff)" />
</span>
