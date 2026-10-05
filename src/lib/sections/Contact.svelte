<script lang="ts">
  /**
   * The contact form.
   *
   * It posts to `?/kontakt` — a named action on the `[...slug]` route, which is what renders every
   * page this block can appear on. Relative, so it goes back to whichever page the visitor is
   * reading rather than to one canonical contact page.
   *
   * The result is read from `page.form` rather than taken as a prop. A prop would have to be
   * threaded through `Blocks.svelte`, which would then be carrying a form result for the benefit
   * of one of its fourteen block types, and through the preview route as well, which has no form
   * results at all. The state belongs to the page either way, so it is read from the page.
   */
  import { enhance } from "$app/forms";
  import { page } from "$app/state";
  import type { ContactBlock, SiteContent } from "../../commitpress.generated";

  let { block, site }: { block: ContactBlock; site: SiteContent } = $props();

  const blank = {
    namn: "",
    epost: "",
    tel: "",
    datum: "",
    typ: "",
    meddelande: "",
  };

  /** Refilled from the failed submission so nothing has to be typed twice. */
  const values = $derived({ ...blank, ...(page.form?.values ?? {}) });
  const errors = $derived(
    (page.form?.errors ?? {}) as Record<string, string | undefined>,
  );
  const sent = $derived(page.form?.sent === true);

  let saving = $state(false);

  const field =
    "w-full bg-transparent border border-white/25 px-4 py-3.5 text-[16px] text-white focus:outline-none focus:border-white transition-colors";
  const label = "block text-[13px] text-white/60 mb-2.5";
  const term = "text-[11px] uppercase tracking-[0.22em] text-white/50 mb-1.5";
  const fault = "mt-2 text-[13px] text-white/80";
</script>

<section id="kontakt" class="bg-ink text-white">
  <div class="wrap py-24 md:py-32">
    <div class="grid grid-cols-12 gap-x-8 gap-y-14">
      <div class="col-span-12 lg:col-span-5">
        <p class="text-[11px] uppercase tracking-[0.22em] text-white/50 mb-6">
          {block.eyebrow}
        </p>
        <h2 class="display text-[clamp(2.2rem,4.5vw,3.75rem)] max-w-[13ch]">
          {block.heading}
        </h2>
        <p class="mt-7 text-[18px] text-white/70 max-w-[38ch]">{block.body}</p>

        <dl class="mt-12 space-y-6 text-[18px]">
          <div>
            <dt class={term}>Telefon</dt>
            <dd>
              <a
                href={site.details.phone_href}
                class="border-b border-white/30 hover:border-white transition-colors pb-0.5"
              >
                {site.details.phone}
              </a>
            </dd>
          </div>
          <div>
            <dt class={term}>E-post</dt>
            <dd>
              <a
                href="mailto:{site.details.email}"
                class="border-b border-white/30 hover:border-white transition-colors pb-0.5"
              >
                {site.details.email}
              </a>
            </dd>
          </div>
          <div>
            <dt class={term}>Studio</dt>
            <dd class="text-white/70">
              {site.details.street}, {site.details.postal}
            </dd>
          </div>
        </dl>
      </div>

      <div class="col-span-12 lg:col-span-6 lg:col-start-7">
        {#if sent}
          <!--
						The form is replaced rather than kept alongside a message. A cleared form under a
						"thank you" reads as though it might not have gone, and the usual next move is to
						send it again.
					-->
          <div
            class="border border-white/25 px-7 py-10"
            role="status"
            aria-live="polite"
          >
            <h3 class="display text-[clamp(1.6rem,2.6vw,2.2rem)]">Tack!</h3>
            <p class="mt-5 text-[18px] text-white/70 max-w-[36ch]">
              Din förfrågan är mottagen och jag hör av mig så snart jag kan. Du
              får en bekräftelse på e-post.
            </p>
            <p class="mt-7 text-[15px] text-white/50">
              Brådskar det? Ring
              <a
                href={site.details.phone_href}
                class="whitespace-nowrap border-b border-white/30 pb-0.5 text-white/80 transition-colors hover:border-white"
              >
                {site.details.phone}
              </a>
            </p>
          </div>
        {:else}
          <form
            method="POST"
            action="?/kontakt"
            class="space-y-6"
            use:enhance={() => {
              saving = true;
              return async ({ update }) => {
                // `reset: false` so a validation failure comes back with the fields still
                // filled in; on success the whole form is replaced by the thank-you above.
                await update({ reset: false });
                saving = false;
              };
            }}
          >
            {#if page.form?.message}
              <p
                class="border-l-2 border-white/60 bg-white/5 px-5 py-4 text-[15px]"
                role="alert"
                aria-live="assertive"
              >
                {page.form.message}
              </p>
            {/if}

            <!--
							The honeypot. Off-screen rather than `display: none` — some bots skip what is not
							rendered — and hidden from assistive tech, so nobody using a screen reader is
							asked to leave a field blank that they cannot see the point of.
						-->
            <div class="absolute left-[-9999px]" aria-hidden="true">
              <label for="webbplats">Lämna detta tomt</label>
              <input
                id="webbplats"
                name="webbplats"
                type="text"
                tabindex="-1"
                autocomplete="off"
              />
            </div>

            <div class="grid sm:grid-cols-1 gap-6">
              <div>
                <label for="namn" class={label}>Namn</label>
                <input
                  id="namn"
                  name="namn"
                  type="text"
                  autocomplete="name"
                  required
                  value={values.namn}
                  class={field}
                  aria-invalid={errors.namn ? "true" : undefined}
                  aria-describedby={errors.namn ? "namn-fel" : undefined}
                />
                {#if errors.namn}<p id="namn-fel" class={fault}>
                    {errors.namn}
                  </p>{/if}
              </div>
            </div>

            <div class="grid sm:grid-cols-2 gap-6">
              <div>
                <label for="epost" class={label}>E-post</label>
                <input
                  id="epost"
                  name="epost"
                  type="email"
                  inputmode="email"
                  autocomplete="email"
                  required
                  value={values.epost}
                  class={field}
                  aria-invalid={errors.epost ? "true" : undefined}
                  aria-describedby={errors.epost ? "epost-fel" : undefined}
                />
                {#if errors.epost}<p id="epost-fel" class={fault}>
                    {errors.epost}
                  </p>{/if}
              </div>
              <div>
                <label for="tel" class={label}>Telefon</label>
                <input
                  id="tel"
                  name="tel"
                  type="tel"
                  inputmode="tel"
                  autocomplete="tel"
                  value={values.tel}
                  class={field}
                />
              </div>
            </div>

            <div>
              <label for="typ" class={label}>Vad gäller det?</label>
              <!--
								`scheme-dark` so the browser draws the native dropdown as a dark widget. Without
								it the popup keeps the OS default white background while the options inherit the
								select's white text, which is invisible. `bg-ink` on the options as well — the
								colour on the select itself only paints the closed control, not the open list.
							-->
              <select id="typ" name="typ" class="{field} bg-ink scheme-dark">
                <!--
									Keyed by position, not by `entry.label`, and the reason is the live preview.

									A key has to be unique *at every render*, and content typed in the CMS is not: the
									editor posts the form's current values on each keystroke, so a second enquiry type
									added to this list arrives with an empty label beside the empty one already there.
									Two identical keys is `each_key_duplicate`, which throws — and a throw inside an
									effect does not just skip that update, it takes the block down for the rest of the
									page's life. The symptom was the whole contact section going quietly stale in the
									preview while every other section carried on updating.

									So the rule for anything drawn from content: **a key must not be a value the
									editor can type.** Nothing here has an id, and position is what the list is
									ordered by anyway. The same swap is in `Faq`, `Hero`, `Packages`, `Services`,
									`Footer`, `IdPhoto` and `SocialLinks`, which all keyed on an editable string.
								-->
                {#each block.enquiry_types as entry, i (i)}
                  <option
                    class="bg-ink text-white"
                    selected={values.typ === entry.label}>{entry.label}</option
                  >
                {/each}
              </select>
            </div>

            <div>
              <label for="meddelande" class={label}>Berätta kort</label>
              <textarea
                id="meddelande"
                name="meddelande"
                rows="4"
                required
                class={field}
                placeholder="Beskriv kort vad du behöver hjälp med, så hör jag av mig så fort som möjligt."
                aria-invalid={errors.meddelande ? "true" : undefined}
                aria-describedby={errors.meddelande
                  ? "meddelande-fel"
                  : undefined}>{values.meddelande}</textarea
              >
              {#if errors.meddelande}
                <p id="meddelande-fel" class={fault}>{errors.meddelande}</p>
              {/if}
            </div>

            <button type="submit" class="btn-light w-full" disabled={saving}>
              {saving ? "Skickar…" : block.submit_label}
            </button>
            {#if block.footnote}
              <p class="text-[13px] text-center text-white/50">
                {block.footnote}
              </p>
            {/if}
          </form>
        {/if}
      </div>
    </div>
  </div>
</section>
