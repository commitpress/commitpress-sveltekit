<script lang="ts">
  import { page } from "$app/state";
  import SocialLinks from "./SocialLinks.svelte";
  import type { SiteContent } from "../../commitpress.generated";

  let {
    site,
    open = $bindable(false),
    /** The control that opened the drawer, so closing can hand focus back to it. */
    opener = null,
  }: {
    site: SiteContent;
    open?: boolean;
    opener?: HTMLElement | null;
  } = $props();

  let panel = $state<HTMLElement | null>(null);
  let closeButton = $state<HTMLButtonElement | null>(null);

  /** Which link, if any, points at the page the reader is already on. */
  const currentPath = $derived(page.url.pathname.replace(/\/+$/, "") || "/");

  /*
   * Open means: the page behind does not scroll, and the reader starts inside the panel.
   *
   * The scrollbar is measured and paid back as padding, because on a desktop-width window — the
   * drawer is reachable down to a tablet — taking the scrollbar away otherwise shifts the whole page
   * sideways behind the scrim.
   */
  $effect(() => {
    if (!open) return;

    const body = document.body;
    const gap = window.innerWidth - document.documentElement.clientWidth;
    const overflow = body.style.overflow;
    const padding = body.style.paddingRight;

    body.style.overflow = "hidden";
    if (gap > 0) body.style.paddingRight = `${gap}px`;
    closeButton?.focus();

    return () => {
      body.style.overflow = overflow;
      body.style.paddingRight = padding;
      // Only reclaim focus if it is still ours to give back — a link inside the drawer that
      // navigated has already moved it somewhere better.
      if (panel?.contains(document.activeElement)) opener?.focus();
    };
  });

  /** Escape closes; Tab stays inside. Both only while the panel is up. */
  function onKeydown(event: KeyboardEvent) {
    if (!open) return;

    if (event.key === "Escape") {
      event.preventDefault();
      open = false;
      return;
    }
    if (event.key !== "Tab" || !panel) return;

    // The scrim is a button so it can be clicked without an a11y warning; it is not a stop on the
    // way round, hence the tabindex exclusion.
    const stops = panel.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]):not([tabindex="-1"])',
    );
    if (stops.length === 0) return;

    const first = stops[0];
    const last = stops[stops.length - 1];
    const active = document.activeElement;

    if (event.shiftKey && (active === first || !panel.contains(active))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }
</script>

<svelte:window onkeydown={onKeydown} />

<!--
	Kept in the document rather than conditionally rendered, so the button's `aria-controls` always
	resolves and so the panel has something to animate out of. `inert` is what actually takes it out of
	reach while it is closed.
-->
<div id="menu" class="drawer lg:hidden" data-open={open} inert={!open}>
  <button
    type="button"
    class="scrim"
    tabindex="-1"
    aria-hidden="true"
    onclick={() => (open = false)}
  ></button>

  <div
    class="panel"
    bind:this={panel}
    role="dialog"
    aria-modal="true"
    aria-label="Meny"
  >
    <div class="panel-head flex items-center justify-between">
      <span class="eyebrow text-white/40">Meny</span>
      <button
        type="button"
        bind:this={closeButton}
        aria-label="Stäng meny"
        class="close"
        onclick={() => (open = false)}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" class="h-5 w-5">
          <path
            d="M5 5 19 19M19 5 5 19"
            stroke="currentColor"
            stroke-width="1.25"
            fill="none"
          />
        </svg>
      </button>
    </div>

    <nav class="panel-nav">
      <ul>
        {#each site.mobile_nav as item, i}
          <li class="row" style="--i:{i}">
            <a
              href={item.href.href}
              class="link"
              aria-current={item.href.href.replace(/\/+$/, "") === currentPath
                ? "page"
                : undefined}
              onclick={() => (open = false)}
            >
              <span class="index">{String(i + 1).padStart(2, "0")}</span>
              <span class="label display">{item.href.label ?? ""}</span>
              <svg viewBox="0 0 24 24" aria-hidden="true" class="arrow">
                <path
                  d="M5 12h13M12 6l6 6-6 6"
                  stroke="currentColor"
                  stroke-width="1.25"
                  fill="none"
                />
              </svg>
            </a>
          </li>
        {/each}
      </ul>
    </nav>

    <!--
			Deliberately short. Everything else about the studio is in the page footer, and every row
			added here is a row taken off the nav above it on a small phone.
		-->
    <div class="panel-foot row" style="--i:{site.mobile_nav.length}">
      <a
        href="/#kontakt"
        class="btn-light w-full"
        onclick={() => (open = false)}>Kontakta mig</a
      >

      <div class="mt-5 flex items-center justify-between gap-4">
        <p
          class="flex flex-wrap items-center gap-x-3 gap-y-1 text-[14px] text-white/50"
        >
          <a href={site.details.phone_href} class="ulink hover:text-white"
            >{site.details.phone}</a
          >
          <span class="text-white/20" aria-hidden="true">·</span>
          <a href="mailto:{site.details.email}" class="ulink hover:text-white"
            >{site.details.email}</a
          >
        </p>
        <!--
					Last in the panel, and so last in the focus trap's list — the wrap from here back to the
					close button is the one the drawer already relies on.
				-->
        <SocialLinks
          details={site.details}
          class="shrink-0 gap-4 text-white"
          size="size-[22px]"
        />
      </div>
    </div>
  </div>
</div>

<style>
  /*
	 * Closed, the drawer is still in the document, so it has to be taken out of the picture three
	 * ways: no paint, no pointer, no hit area. `visibility` is the one that does the last of those,
	 * and it is switched with a delayed zero-length transition rather than plain — flipped
	 * immediately, the panel would vanish instead of sliding out.
	 */
  .drawer {
    position: fixed;
    inset: 0;
    z-index: 60;
    visibility: hidden;
    transition: visibility 0s linear 0.5s;
  }
  .drawer[data-open="true"] {
    visibility: visible;
    transition: visibility 0s;
  }

  .scrim {
    position: absolute;
    inset: 0;
    width: 100%;
    background: rgb(11 11 11 / 0.55);
    backdrop-filter: blur(3px);
    opacity: 0;
    transition: opacity 0.45s ease;
    cursor: default;
  }
  .drawer[data-open="true"] .scrim {
    opacity: 1;
  }

  .panel {
    position: absolute;
    inset-block: 0;
    right: 0;
    width: min(92vw, 460px);
    display: flex;
    flex-direction: column;
    background: #0b0b0b;
    color: #fff;
    box-shadow: -24px 0 60px rgb(0 0 0 / 0.35);
    transform: translateX(100%);
    transition: transform 0.5s cubic-bezier(0.16, 1, 0.3, 1);
  }
  .drawer[data-open="true"] .panel {
    transform: none;
  }

  .panel-head {
    flex: none;
    height: 80px;
    padding-inline: 1.5rem;
    border-bottom: 1px solid rgb(255 255 255 / 0.1);
  }

  .close {
    display: grid;
    place-items: center;
    width: 44px;
    height: 44px;
    margin-right: -0.75rem;
    color: rgb(255 255 255 / 0.7);
    transition: color 0.3s ease;
  }
  .close:hover {
    color: #fff;
  }

  /*
	 * The list fits without scrolling on a phone held upright, which is the case worth designing for.
	 * Held sideways, or with seven items grown to nine, it scrolls — and then the row at the cut would
	 * end in a hard edge against the footer and read as a mistake rather than as more list. The mask
	 * fades exactly the depth of the bottom padding, so when nothing is overflowing there is nothing
	 * in that band to fade.
	 */
  .panel-nav {
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding-inline: 1.5rem;
    padding-bottom: 1.75rem;
    mask-image: linear-gradient(
      to bottom,
      #000 calc(100% - 1.75rem),
      transparent
    );
  }

  .link {
    display: grid;
    grid-template-columns: 2.4rem 1fr auto;
    align-items: center;
    gap: 0.25rem;
    padding-block: 0.85rem;
    border-bottom: 1px solid rgb(255 255 255 / 0.09);
  }

  .index {
    font-size: 11px;
    letter-spacing: 0.18em;
    color: rgb(255 255 255 / 0.3);
    transition: color 0.3s ease;
  }

  .label {
    font-size: clamp(20px, 5.2vw, 27px);
    /* Looser than the display default, which is set for headings that are meant to be tight. The
		   longest item wraps to two lines on a narrow phone. */
    line-height: 1.15;
    color: rgb(255 255 255 / 0.85);
    transition:
      color 0.3s ease,
      transform 0.45s cubic-bezier(0.16, 1, 0.3, 1);
  }

  .arrow {
    width: 18px;
    height: 18px;
    color: #fff;
    opacity: 0;
    transform: translateX(-8px);
    transition:
      opacity 0.35s ease,
      transform 0.45s cubic-bezier(0.16, 1, 0.3, 1);
  }

  /* Hover on a phone is really :active, and focus-visible carries the keyboard. */
  .link:hover .label,
  .link:focus-visible .label {
    color: #fff;
    transform: translateX(4px);
  }
  .link:hover .index,
  .link:focus-visible .index {
    color: rgb(255 255 255 / 0.6);
  }
  .link:hover .arrow,
  .link:focus-visible .arrow {
    opacity: 0.7;
    transform: none;
  }
  .link:focus-visible {
    box-shadow: none;
    outline: none;
  }

  /* The page you are already on: named for a screen reader, and quietly marked for everyone else. */
  .link[aria-current="page"] .index {
    color: #fff;
  }
  .link[aria-current="page"] .label {
    color: #fff;
  }
  .link[aria-current="page"] .arrow {
    opacity: 0.35;
    transform: none;
  }

  .panel-foot {
    flex: none;
    padding: 1.5rem 1.5rem max(1.5rem, env(safe-area-inset-bottom));
    border-top: 1px solid rgb(255 255 255 / 0.1);
  }

  /*
	 * The rows arrive after the panel, one behind the next. On the way out they are not animated at
	 * all — they are reset a slide's length later, once the panel is off screen, so the drawer never
	 * empties itself in front of the reader.
	 */
  .row {
    opacity: 0;
    transform: translateY(14px);
    transition:
      opacity 0s linear 0.5s,
      transform 0s linear 0.5s;
  }
  .drawer[data-open="true"] .row {
    --delay: calc(var(--i) * 40ms + 130ms);
    opacity: 1;
    transform: none;
    transition:
      opacity 0.5s ease var(--delay),
      transform 0.55s cubic-bezier(0.16, 1, 0.3, 1) var(--delay);
  }

  @media (prefers-reduced-motion: reduce) {
    .drawer,
    .drawer[data-open="true"],
    .scrim,
    .panel,
    .row,
    .drawer[data-open="true"] .row,
    .label,
    .arrow {
      transition: none;
    }
    .arrow {
      opacity: 0.35;
      transform: none;
    }
  }
</style>
