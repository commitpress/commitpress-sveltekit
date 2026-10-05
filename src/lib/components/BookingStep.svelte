<script lang="ts">
  /**
   * The frame every booking step sits in.
   *
   * One place for the things that have to be identical on all three screens: where you are, how to
   * go back, what you have chosen so far, and the phone number. That last one is not decoration —
   * for anybody who gets stuck, a visible number is the difference between a phone call and a lost
   * booking, so it stays on screen at every step rather than waiting on a contact page.
   */
  import type { SiteContent } from "../../commitpress.generated";

  let {
    step,
    heading,
    lead = "",
    back = null,
    summary = "",
    site,
    children,
  }: {
    step: 1 | 2 | 3;
    heading: string;
    lead?: string;
    /** Where "tillbaka" goes. Null on the first step, which has nowhere to go back to. */
    back?: { href: string; label: string } | null;
    /** What has been picked so far, e.g. "torsdag 14 augusti, 11:20". */
    summary?: string;
    site: SiteContent;
    children: import("svelte").Snippet;
  } = $props();

  const steps = [
    { n: 1, label: "Välj dag" },
    { n: 2, label: "Välj tid" },
    { n: 3, label: "Dina uppgifter" },
  ];
</script>

<section class="bg-mist min-h-[70vh]">
  <div class="wrap py-14 md:py-20">
    <div class="max-w-190">
      <!--
				A list rather than a bare "steg 2 av 3", so a screen reader announces the whole path and
				which part of it is current. `aria-current` carries that; the ring is only its picture.
			-->
      <nav aria-label="Så här bokar du">
        <ol class="flex flex-wrap items-center gap-x-3 gap-y-2 text-[13px]">
          {#each steps as entry (entry.n)}
            <li class="flex items-center gap-3">
              <span
                class="flex items-center gap-2.5"
                class:text-ink={entry.n <= step}
                class:text-ash={entry.n > step}
                aria-current={entry.n === step ? "step" : undefined}
              >
                <span
                  class="grid h-7 w-7 place-items-center rounded-full border text-[12px]"
                  class:border-ink={entry.n <= step}
                  class:bg-ink={entry.n === step}
                  class:text-white={entry.n === step}
                  class:border-line={entry.n > step}
                >
                  {entry.n}
                </span>
                {entry.label}
              </span>
              {#if entry.n < steps.length}
                <span class="text-line" aria-hidden="true">—</span>
              {/if}
            </li>
          {/each}
        </ol>
      </nav>

      <h1 class="display mt-9 text-[clamp(2rem,4vw,3.1rem)]">{heading}</h1>

      {#if lead}
        <p class="mt-5 max-w-[52ch] text-[18px]">{lead}</p>
      {/if}

      {#if summary}
        <!-- What they have picked, kept in front of them so no step is a leap of faith. -->
        <p class="mt-7 flex flex-wrap items-baseline gap-x-3 text-[17px]">
          <span class="text-ash">Vald tid:</span>
          <strong class="font-normal">{summary}</strong>
          {#if back}
            <a href={back.href} class="ulink text-[15px] text-ash">ändra</a>
          {/if}
        </p>
      {/if}
    </div>

    <div class="mt-12 max-w-190">
      {@render children()}
    </div>

    <div
      class="mt-14 flex max-w-190 flex-wrap items-center justify-between gap-6 border-t border-line pt-8"
    >
      {#if back}
        <a href={back.href} class="ulink text-[16px]">← {back.label}</a>
      {:else}
        <span></span>
      {/if}

      <p class="text-[16px] text-neutral-700">
        Krånglar det? Ring
        <a
          href={site.details.phone_href}
          class="ulink whitespace-nowrap text-ink"
        >
          {site.details.phone}
        </a>
      </p>
    </div>
  </div>
</section>
