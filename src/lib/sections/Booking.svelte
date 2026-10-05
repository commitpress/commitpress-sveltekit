<script lang="ts">
	/**
	 * The booking block as it appears on a page — the way in, not the flow itself.
	 *
	 * It shows the next few open days and hands over to `/boka`, rather than embedding all three
	 * steps inline. Two reasons: each step gets a real URL, so back, reload and a shared link all
	 * behave; and the section stays short enough to sit in the middle of a page without taking it
	 * over.
	 *
	 * ## Where the days come from, and why it differs in preview
	 *
	 * On the public site `days` is passed in: the schedule from content *minus* what the database says
	 * is taken. The CMS preview has no database behind it and must not pretend to — what the editor is
	 * looking at is unsaved form values, so anything drawn from a store would be describing a different
	 * page than the one on screen.
	 *
	 * It does not need one. The schedule is content: `toSchedule()` and everything under it in
	 * `schedule.ts` is pure and reads `open_days`, `closed_days` and `slot_minutes` off the block. So
	 * preview derives its own list from the block it was handed and treats every slot the schedule
	 * defines as free. That is the block working, recomputed on each keystroke as the editor edits the
	 * opening hours — and it is display data by construction, not a reading of anyone's real calendar.
	 *
	 * The one thing it cannot show is a day that is *fully booked*: only the database knows that, so a
	 * day the public site has dropped still appears here. Preview answers "does my schedule produce
	 * days", which is the question an editor is actually asking; `/boka` answers the other one.
	 *
	 * A block with no readable `open_days` still falls through to the `empty_note` copy, in preview as
	 * on the site — an empty schedule genuinely does render nothing, and hiding that would be worse.
	 */
	import { reveal } from '$lib/actions/reveal';
	import {
		bookableDates,
		bookableSlotsForDate,
		formatDate,
		relativeDay,
		toSchedule
	} from '$lib/booking/schedule';
	import type { BookingBlock, SiteContent } from '../../commitpress.generated';

	let {
		block,
		site,
		days = [],
		/**
		 * Ignore `days` and derive them from the block's own schedule. Set only by the preview route —
		 * see the note above.
		 */
		preview = false
	}: {
		block: BookingBlock;
		site: SiteContent;
		days?: Array<{ date: string; free: number }>;
		preview?: boolean;
	} = $props();

	const sentence = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

	/** What the section actually lists: given on the site, computed from content in preview. */
	const open = $derived.by(() => {
		if (!preview) return days;

		const schedule = toSchedule(block);
		return bookableDates(schedule).map((date) => ({
			date,
			free: bookableSlotsForDate(schedule, date).length
		}));
	});

	/** Four is enough to show the pattern; the rest are one tap away. */
	const shown = $derived(open.slice(0, 4));
</script>

<section id="boka" class="bg-white">
	<div class="wrap py-20 md:py-28">
		<div class="grid grid-cols-12 gap-x-8 gap-y-12">
			<div class="col-span-12 reveal lg:col-span-5" use:reveal>
				<p class="eyebrow eyebrow-rule mb-5">{block.eyebrow}</p>
				<h2 class="display max-w-[15ch] text-[clamp(1.9rem,3.6vw,3rem)]">{block.heading}</h2>
				<p class="mt-7 max-w-[42ch] text-[18px]">{block.body}</p>

				{#if open.length > 0}
					<a href="/boka" class="btn-solid mt-10">{block.cta_label}</a>
				{/if}
			</div>

			<div class="col-span-12 reveal lg:col-span-6 lg:col-start-7" use:reveal>
				{#if open.length === 0}
					<div class="border border-line p-8 md:p-10">
						<p class="text-[18px]">{block.empty_note}</p>
						<a href={site.details.phone_href} class="btn-ghost mt-8">
							Ring {site.details.phone}
						</a>
					</div>
				{:else}
					<p class="eyebrow eyebrow-rule mb-6">Nästa lediga dagar</p>
					<ul class="divide-y divide-line border-y border-line">
						{#each shown as day (day.date)}
							<li>
								<a
									href="/boka/{day.date}"
									class="group flex items-center justify-between gap-4 py-5 transition-colors hover:text-ash"
								>
									<span>
										<span class="block text-[19px]">{sentence(formatDate(day.date))}</span>
										<span class="mt-1 block text-[15px] text-ash">
											{#if relativeDay(day.date)}
												{sentence(relativeDay(day.date) ?? '')} ·
											{/if}
											{day.free}
											{day.free === 1 ? 'ledig tid' : 'lediga tider'}
										</span>
									</span>
									<span
										class="text-[20px] text-ash transition-transform group-hover:translate-x-1"
										aria-hidden="true">→</span
									>
								</a>
							</li>
						{/each}
					</ul>

					{#if open.length > shown.length}
						<a href="/boka" class="ulink mt-6 inline-block text-[16px]">
							Visa alla {open.length} dagar
						</a>
					{/if}
				{/if}
			</div>
		</div>
	</div>
</section>
