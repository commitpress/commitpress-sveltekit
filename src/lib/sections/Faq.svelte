<script lang="ts">
	import type { FaqBlock } from '../../commitpress.generated';

	let { block }: { block: FaqBlock } = $props();
</script>

<section id="fragor" class="bg-mist">
	<div class="wrap py-16 md:py-20">
		<div class="grid grid-cols-12 gap-x-8 gap-y-10">
			<div class="col-span-12 lg:col-span-4">
				<p class="eyebrow eyebrow-rule mb-5">{block.eyebrow}</p>
				<h2 class="display text-[clamp(1.9rem,3.4vw,2.75rem)] max-w-[12ch]">{block.heading}</h2>
			</div>

			<div class="col-span-12 lg:col-span-7 lg:col-start-6">
				<div class="border-t border-line">
					<!-- Keyed by position: a key must not be a value the editor can type. See `Contact`. -->
					{#each block.items as item, i (i)}
						<details class="border-b border-line">
							<summary class="flex items-center justify-between gap-6 py-7 text-[18px]">
								{item.question}
								<span class="sign text-ash text-2xl leading-none">+</span>
							</summary>
							<p class="pb-7 max-w-[54ch]">{item.answer}</p>
						</details>
					{/each}
				</div>
			</div>
		</div>
	</div>
</section>

<style>
	details summary::-webkit-details-marker {
		display: none;
	}
	details summary {
		list-style: none;
		cursor: pointer;
	}
	.sign {
		transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1);
	}
	details[open] .sign {
		transform: rotate(45deg);
	}

	/* Answers ease open rather than snapping. */
	details[open] > p {
		animation: faqIn 0.45s cubic-bezier(0.16, 1, 0.3, 1) both;
	}
	@keyframes faqIn {
		from {
			opacity: 0;
			transform: translateY(-6px);
		}
		to {
			opacity: 1;
			transform: none;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		details[open] > p {
			animation: none;
		}
	}
</style>
