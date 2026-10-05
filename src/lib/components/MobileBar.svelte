<script lang="ts">
  import type { SiteContent } from "../../commitpress.generated";

  let { site }: { site: SiteContent } = $props();
</script>

<!--
	Two things a phone visitor actually wants, pinned where the thumb is. The spacer below keeps the
	bar from covering the end of the footer.
-->
<!-- <div
  class="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t border-line flex"
>
  <a
    href={site.details.phone_href}
    class="flex-1 text-center py-4 text-[12px] uppercase tracking-[0.16em] border-r border-line"
  >
    Ring
  </a>
  <a
    href="#kontakt"
    class="flex-1 text-center py-4 text-[12px] uppercase tracking-[0.16em] bg-ink text-white"
  >
    Kontakta mig
  </a>
</div>
<div class="lg:hidden h-14" aria-hidden="true"></div> -->
