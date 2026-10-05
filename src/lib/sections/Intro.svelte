<script lang="ts">
  import { reveal } from "$lib/actions/reveal";
  import type { IntroBlock } from "../../commitpress.generated";

  let { block }: { block: IntroBlock } = $props();
</script>

<section class="wrap py-16 md:py-20">
  <div class="grid grid-cols-12 gap-x-8 gap-y-12">
    <div class="col-span-12 lg:col-span-7 reveal" use:reveal>
      <p class="eyebrow eyebrow-rule mb-7">{block.eyebrow}</p>
      <p
        class="font-display font-normal text-[clamp(1.6rem,3.2vw,2.4rem)] leading-[1.3] tracking-tight text-ink max-w-[24ch]"
      >
        {block.statement}
      </p>
    </div>

    <div class="col-span-12 lg:col-span-4 lg:col-start-9 reveal" use:reveal>
      <p class="text-[17px] max-w-[42ch]">{block.body}</p>
      <a
        href={block.link.href}
        class="group inline-flex items-center gap-3 mt-6 text-sm text-accent"
      >
        <span class="border-b border-ink pb-1">{block.link.label ?? ""}</span>
        <span
          class="text-ash transition-transform duration-500 group-hover:translate-x-1.5"
          >→</span
        >
      </a>
    </div>
  </div>
</section>
