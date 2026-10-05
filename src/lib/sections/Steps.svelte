<script lang="ts">
	/**
	 * A numbered sequence — what happens, in order.
	 *
	 * The numbers come from the item's position rather than from a field, so reordering the steps in
	 * the editor renumbers them and there is no way to commit a list that reads 01, 02, 04.
	 */
	import { reveal } from '$lib/actions/reveal';
	import type { StepsBlock } from '../../commitpress.generated';

	let { block }: { block: StepsBlock } = $props();
</script>

<section id="building-blocks" class="wrap py-16 md:py-20">
	<div class="flex flex-wrap items-end justify-between gap-6 pb-12 md:pb-16">
		<div class="reveal" use:reveal>
			<p class="eyebrow eyebrow-rule mb-5">{block.eyebrow}</p>
			<h2 class="display text-[clamp(1.9rem,3.6vw,3.25rem)]">{block.heading}</h2>
		</div>
		<p class="reveal max-w-[38ch] text-[15px]" use:reveal>{block.note}</p>
	</div>

	<!--
		A top rule per column rather than dividers between them: at one and two columns the rules stack
		into a list, and at four they read as a row, without any of the border-side juggling that a
		`divide-x` needs to survive wrapping.
	-->
	<ol class="grid grid-cols-1 gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
		{#each block.items as step, i (i)}
			<li class="reveal border-t border-line pt-6" use:reveal>
				<span class="eyebrow block">{String(i + 1).padStart(2, '0')}</span>
				<h3 class="mt-5 font-display font-semibold text-lg leading-tight">{step.title}</h3>
				<p class="mt-3 text-[15px]">{step.body}</p>
			</li>
		{/each}
	</ol>
</section>
