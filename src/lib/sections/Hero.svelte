<script lang="ts">
  import ResponsiveImage from "$lib/components/ResponsiveImage.svelte";
  import { BREAKPOINTS, type ImageManifest } from "$lib/media/assets";
  import type { HeroBlock, SiteContent } from "../../commitpress.generated";

  let {
    block,
    site,
    media = {},
  }: { block: HeroBlock; site: SiteContent; media?: ImageManifest } = $props();

  /** Kept as a local name so the carousel below reads the same as when the slides were a constant. */
  const hero = $derived(block.slides);

  const HOLD = 5500;
  /** How long the outgoing headline takes to clear before the incoming one is written. */
  const SWAP = 420;

  /*
   * The stand-in for a slide whose image field is empty. Distinct enough per slide that a crossfade
   * between two of them reads as a change of image rather than a flicker, which is what makes a
   * half-filled hero look deliberate while the photographs are still being chosen.
   */
  const tones = [
    "from-neutral-700 to-neutral-900",
    "from-neutral-800 to-black",
    "from-stone-600 to-stone-900",
    "from-zinc-700 to-zinc-950",
    "from-neutral-600 to-neutral-900",
  ];

  let index = $state(0);
  /** Which line is written into the headline — trails `index` by the length of the swap. */
  let shown = $state(0);
  /** `out` clears the old line upward, `reset` parks the new one below its mask, `in` raises it. */
  let phase = $state<"in" | "out" | "reset">("in");
  let stagger = $state(false);
  /** Bumped on every change so the progress ticks restart their fill. */
  let cycle = $state(0);
  /* Not `$state`: nothing renders from it, only the timing logic reads it. */
  let reduce = false;

  let slideEls = $state<HTMLElement[]>([]);
  let timer: ReturnType<typeof setInterval> | undefined;
  let swapTimer: ReturnType<typeof setTimeout> | undefined;

  const words = $derived(hero[shown].line.split(" "));

  $effect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    reduce = query.matches;
    const onChange = () => {
      reduce = query.matches;
      play();
    };
    query.addEventListener("change", onChange);
    play();

    return () => {
      query.removeEventListener("change", onChange);
      clearInterval(timer);
      clearTimeout(swapTimer);
    };
  });

  function play() {
    clearInterval(timer);
    if (!reduce) timer = setInterval(() => show(index + 1), HOLD);
  }

  /*
   * The drift animation lives on `.is-active`, so dropping that class would drop the zoom too —
   * and the outgoing panel would snap back to its starting scale halfway through the crossfade.
   * Pin the scale it reached, and let it go again only once it is invisible and due back.
   */
  function pinZoom(el: HTMLElement | undefined) {
    const fill = el?.querySelector<HTMLElement>(".slide-fill");
    if (!fill) return;
    const at = getComputedStyle(fill).transform; // read before killing the animation
    fill.style.animation = "none";
    fill.style.transform = at;
  }

  function releaseZoom(el: HTMLElement | undefined) {
    const fill = el?.querySelector<HTMLElement>(".slide-fill");
    if (!fill) return;
    fill.style.animation = "";
    fill.style.transform = "";
    void fill.offsetWidth; // so drift restarts from the top
  }

  function show(next: number) {
    const target = (next + hero.length) % hero.length;
    if (target === index) return;

    pinZoom(slideEls[index]);
    index = target;
    releaseZoom(slideEls[index]);
    cycle++;
    swapLine(target);
  }

  function swapLine(target: number) {
    clearTimeout(swapTimer);

    if (reduce) {
      shown = target;
      stagger = false;
      phase = "in";
      return;
    }

    phase = "out";
    swapTimer = setTimeout(() => {
      shown = target;
      stagger = true;
      phase = "reset";
      requestAnimationFrame(() => requestAnimationFrame(() => (phase = "in")));
    }, SWAP);
  }

  function pick(i: number) {
    show(i);
    play();
  }
</script>

<!--
	`data-nav-overlay`: dark from edge to edge, and it leaves the top of itself empty. That is what
	the site header looks for before laying itself over a section instead of sitting above it.
-->
<section
  data-nav-overlay
  class="relative h-svh min-h-150 overflow-hidden bg-ink"
>
  <div class="absolute inset-0">
    <!-- Keyed by position: a key must not be a value the editor can type. See `Contact`. -->
    {#each hero as slide, i (i)}
      <figure
        class="slide"
        class:is-active={i === index}
        bind:this={slideEls[i]}
      >
        <!--
					The image sits *inside* `.slide-fill` rather than being it. That element carries the
					drift animation and is what `pinZoom` reaches for, and both are scoped styles — which
					apply only to elements in this component's own markup, never to one a child renders.
					So the wrapper stays here and the photograph fills it.
				-->
        <div class="slide-fill">
          {#if slide.image}
            <!--
							`breakpoints` is what makes the slide's `mobile` alternate reachable: the CMS
							declares the slot by name, this site says where the boundary is, and a slide
							whose editor picked a phone photograph gets it below `md`. A slide that has
							only a default is unaffected — no `<source>` is emitted for a slot nobody
							filled — so this is safe to state for every slide rather than per slide.
						-->
            <ResponsiveImage
              image={slide.image}
              {media}
              breakpoints={BREAKPOINTS}
              alt={slide.alt}
              class="h-full w-full object-cover"
              loading={i === 0 ? "eager" : "lazy"}
              fetchpriority={i === 0 ? "high" : undefined}
            />
          {:else}
            <div
              class="h-full w-full bg-linear-to-b {tones[i % tones.length]}"
              role="img"
              aria-label={slide.alt}
            ></div>
          {/if}
        </div>
      </figure>
    {/each}
  </div>
  <div class="absolute inset-0 hero-scrim"></div>

  <div class="relative h-full wrap flex flex-col justify-end pb-14 md:pb-16">
    <div>
      <p class="text-[13px] tracking-[0.14em] uppercase text-white/80 mb-7">
        {site.details.tagline}
      </p>
      <h1
        class="display text-white text-[clamp(2.4rem,6vw,5.25rem)] max-w-[15ch] text-balance min-h-[2.1em]"
        class:is-in={phase === "in"}
        class:is-out={phase === "out"}
      >
        <!--
					The `{' '}` is load-bearing. Each word is its own `inline-block` mask, and Svelte
					collapses the whitespace between elements written on separate lines — leaving no
					break opportunity, so the headline would run together and refuse to wrap.
				-->
        {#each words as word, i (`${shown}-${i}`)}<span class="line-word"
            ><i style:transition-delay="{stagger ? i * 70 : 0}ms">{word}</i
            ></span
          >{" "}{/each}
      </h1>
    </div>

    <div
      class="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-8 mt-12"
    >
      <!-- <div class="flex flex-wrap gap-4">
				<a href="#kontakt" class="btn-light">Boka fotografering</a>
				<a
					href="#bilder"
					class="btn text-white border border-white/50 hover:bg-white hover:text-ink hover:border-white"
				>
					Se bilder
				</a>
			</div> -->

      <div class="flex items-center">
        {#key cycle}
          <div class="flex items-center gap-2 shrink-0">
            {#each hero as slide, i (i)}
              <button
                type="button"
                class="tick"
                class:is-active={i === index}
                aria-label="Bild {i + 1}"
                aria-current={i === index}
                onclick={() => pick(i)}
              >
                <span></span>
              </button>
            {/each}
          </div>
        {/key}
      </div>
    </div>
  </div>
</section>

<style>
  .slide {
    position: absolute;
    inset: 0;
    opacity: 0;
    transition: opacity 1.6s cubic-bezier(0.4, 0, 0.2, 1);
  }
  .slide.is-active {
    opacity: 1;
  }
  .slide-fill {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    transform: scale(1.02);
  }
  .slide.is-active .slide-fill {
    animation: drift 9s linear forwards;
  }
  @keyframes drift {
    from {
      transform: scale(1.02);
    }
    to {
      transform: scale(1.11);
    }
  }

  .hero-scrim {
    background: linear-gradient(
        to bottom,
        rgb(0 0 0 / 0.42) 0%,
        rgb(0 0 0 / 0) 32%
      ),
      linear-gradient(
        to top,
        rgb(0 0 0 / 0.62) 0%,
        rgb(0 0 0 / 0.15) 42%,
        rgb(0 0 0 / 0) 68%
      );
  }

  /* The headline swaps with the image: words rise out of their own mask. */
  .line-word {
    display: inline-block;
    overflow: hidden;
    padding-bottom: 0.14em;
    margin-bottom: -0.14em;
  }
  .line-word > i {
    display: inline-block;
    font-style: normal;
    transform: translateY(112%);
    opacity: 0;
    transition:
      transform 0.9s cubic-bezier(0.16, 1, 0.3, 1),
      opacity 0.55s ease;
  }
  h1.is-in .line-word > i {
    transform: none;
    opacity: 1;
  }
  h1.is-out .line-word > i {
    transform: translateY(-45%);
    opacity: 0;
    transition:
      transform 0.4s ease-in,
      opacity 0.3s ease-in;
  }

  .tick {
    width: 34px;
    height: 1px;
    background: rgb(255 255 255 / 0.35);
    position: relative;
    overflow: hidden;
  }
  .tick span {
    position: absolute;
    inset: 0;
    background: #fff;
    transform: scaleX(0);
    transform-origin: left;
  }
  .tick.is-active span {
    animation: fill 5.5s linear forwards;
  }
  @keyframes fill {
    to {
      transform: scaleX(1);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .slide.is-active .slide-fill {
      animation: none;
    }
    .tick.is-active span {
      animation: none;
      transform: scaleX(1);
    }
  }
</style>
