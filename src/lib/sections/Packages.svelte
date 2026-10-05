<script lang="ts">
  /**
   * Priced options side by side.
   *
   * No "most popular" flag by design — with two or three packages the difference is legible from the
   * prices, and a highlight is a sales device this site does not otherwise use.
   */
  import { reveal } from "$lib/actions/reveal";
  import type { PackagesBlock } from "../../commitpress.generated";

  let { block }: { block: PackagesBlock } = $props();

  /**
   * Two columns at `md` and three at `lg`, but only once there are three to show — a two-package
   * block in a three-column grid leaves a hole where the third should be.
   */
  const columns = $derived(
    block.items.length >= 3
      ? "md:grid-cols-2 lg:grid-cols-3"
      : "md:grid-cols-2",
  );
</script>

<section id="priser" class="bg-mist">
  <div class="wrap py-20 md:py-28 lg:py-32">
    <div class="flex flex-wrap items-end justify-between gap-6 pb-12 md:pb-16">
      <div class="reveal" use:reveal>
        <p class="eyebrow eyebrow-rule mb-5">{block.eyebrow}</p>
        <h2 class="display text-[clamp(1.9rem,3.6vw,3.25rem)]">
          {block.heading}
        </h2>
      </div>
      <p class="reveal max-w-[38ch] text-[15px]" use:reveal>{block.note}</p>
    </div>

    <div class="grid grid-cols-1 gap-6 {columns} lg:gap-7">
      <!-- Keyed by position: a key must not be a value the editor can type. See `Contact`. -->
      {#each block.items as item, cardIndex (cardIndex)}
        <!-- `h-full` on a flex column is what makes every card's button sit on the same line. -->
        <div
          class="reveal flex h-full flex-col bg-white p-8 md:p-10"
          use:reveal
        >
          <h3 class="font-serif text-[1.75rem] leading-tight">{item.name}</h3>
          <p class="mt-3 text-[15px]">{item.body}</p>

          <p
            class="mt-7 border-t border-line pt-7 font-serif text-[2rem] leading-none text-ink"
          >
            {item.price}
          </p>

          <ul class="mt-7 flex-1 space-y-3 text-[15px] text-neutral-800">
            {#each item.includes as entry, i (i)}
              <li class="flex gap-3.5">
                <span class="text-ash">—</span>{entry.item}
              </li>
            {/each}
          </ul>

          <a href={item.link.href} class="btn-ghost mt-9 w-full"
            >{item.link.label ?? ""}</a
          >
        </div>
      {/each}
    </div>
  </div>
</section>
