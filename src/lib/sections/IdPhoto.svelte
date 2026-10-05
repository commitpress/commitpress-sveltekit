<script lang="ts">
  import { reveal } from "$lib/actions/reveal";
  import type { IdPhotoBlock, SiteContent } from "../../commitpress.generated";

  let { block, site }: { block: IdPhotoBlock; site: SiteContent } = $props();
</script>

<section id="idfoto" class="bg-mist">
  <div class="wrap py-20 md:py-28">
    <div class="grid grid-cols-12 gap-x-8 gap-y-12">
      <div class="col-span-12 lg:col-span-6 reveal" use:reveal>
        <p class="eyebrow eyebrow-rule mb-5">{block.eyebrow}</p>
        <h2 class="display text-[clamp(1.9rem,3.6vw,3rem)] max-w-[15ch]">
          {block.heading}
        </h2>
        <p class="mt-7 text-[18px] max-w-[44ch]">{block.body}</p>

        <ul class="mt-9 space-y-4 text-[17px] text-neutral-800">
          {#each block.points as entry, i (i)}
            <li class="flex gap-4">
              <span class="text-ash">—</span>{entry.point}
            </li>
          {/each}
        </ul>
        {#if block.buttons}
          <div class="flex flex-wrap gap-4 mt-10">
            {#each block.buttons as button}
              <a href={button.link?.href} class="btn-solid">
                {button.link?.label ?? ""}
              </a>
            {/each}
          </div>
        {/if}
      </div>

      <div class="col-span-12 lg:col-span-5 lg:col-start-8 reveal" use:reveal>
        <div class="bg-white p-8 md:p-10">
          <p class="eyebrow eyebrow-rule mb-7">{block.hours_heading}</p>
          <dl class="text-[17px]">
            <!-- Keyed by position: a key must not be a value the editor can type. See `Contact`. -->
            {#each site.opening_hours as row, i (i)}
              <div
                class="flex justify-between gap-6 py-3.5"
                class:border-b={i < site.opening_hours.length - 1}
                class:border-line={i < site.opening_hours.length - 1}
              >
                <dt class="text-neutral-700">{row.days}</dt>
                <dd class:text-ash={row.closed}>{row.hours}</dd>
              </div>
            {/each}
          </dl>
          <p class="mt-8 text-[17px] leading-[1.6]">
            {site.details.street}<br />{site.details.postal}
          </p>
        </div>
      </div>
    </div>
  </div>
</section>
