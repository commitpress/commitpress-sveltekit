<script lang="ts">
	import type { SiteContent } from '../../commitpress.generated';

	let {
		details,
		/** Layout for this position: gap, colour, margins. Display is the component's own. */
		class: className = 'gap-4',
		/** Size utility for the glyphs. */
		size = 'size-5',
		/**
		 * Quieter than the text beside them, which is right in the footer and the drawer where they sit
		 * under a block of links. In the header they stand alone next to the nav, and being dimmer than
		 * it reads as disabled rather than as secondary.
		 */
		muted = true
	}: {
		details: SiteContent['details'];
		class?: string;
		size?: string;
		muted?: boolean;
	} = $props();

	/**
	 * The schema asks the editor for a handle — `hejfoto.se` — because that is how it reads inside the
	 * apps. Pasting the whole address is the obvious thing to do anyway, so a full URL is passed
	 * through untouched, and a leading `@` or stray slashes are trimmed off a handle.
	 */
	function profile(host: string, value: string | undefined) {
		const handle = value?.trim();
		if (!handle) return null;
		if (/^https?:\/\//i.test(handle)) return handle;

		const clean = handle.replace(/^@/, '').replace(/^\/+|\/+$/g, '');
		return clean ? `https://${host}/${clean}` : null;
	}

	type Link = { label: string; href: string; icon: 'instagram' | 'facebook' };

	/* Neither is required by the schema, so each is here only if the editor filled it in. */
	const links = $derived.by(() => {
		const out: Link[] = [];
		const instagram = profile('www.instagram.com', details.instagram);
		const facebook = profile('www.facebook.com', details.facebook);

		if (instagram) out.push({ label: 'Instagram', href: instagram, icon: 'instagram' });
		if (facebook) out.push({ label: 'Facebook', href: facebook, icon: 'facebook' });
		return out;
	});
</script>

{#if links.length > 0}
	<ul class="social flex items-center {className}" data-muted={muted}>
		<!-- Keyed by position: a key must not be a value the editor can type. See `Contact`. -->
		{#each links as item, i (i)}
			<li>
				<!--
					`rel` alongside the new tab: `noopener` is what actually matters — without it the profile
					page is handed a live reference back to this one.
				-->
				<a
					href={item.href}
					target="_blank"
					rel="noopener noreferrer"
					aria-label={item.label}
					title={item.label}
					class="social-link block"
				>
					{#if item.icon === 'instagram'}
						<svg
							viewBox="0 0 24 24"
							class={size}
							fill="none"
							stroke="currentColor"
							stroke-width="1.5"
							stroke-linecap="round"
							stroke-linejoin="round"
							aria-hidden="true"
						>
							<rect x="2.75" y="2.75" width="18.5" height="18.5" rx="5.25" />
							<circle cx="12" cy="12" r="4" />
							<circle cx="17.4" cy="6.6" r="0.9" fill="currentColor" stroke="none" />
						</svg>
					{:else}
						<svg
							viewBox="0 0 24 24"
							class={size}
							fill="none"
							stroke="currentColor"
							stroke-width="1.5"
							stroke-linecap="round"
							stroke-linejoin="round"
							aria-hidden="true"
						>
							<path
								d="M17 3h-2.6A4.4 4.4 0 0 0 10 7.4V10H7.2v3.6H10V21h3.6v-7.4h2.7l.7-3.6h-3.4V7.6c0-.5.4-1 1-1H17z"
							/>
						</svg>
					{/if}
				</a>
			</li>
		{/each}
	</ul>
{/if}

<style>
	/*
	 * Colour is inherited, so the same component works on the dark footer, inside the drawer, and over
	 * a photograph in the header. Only the strength is the component's own.
	 */
	.social-link {
		transition: opacity 0.3s ease;
	}
	.social[data-muted='true'] .social-link {
		opacity: 0.6;
	}
	.social .social-link:hover,
	.social .social-link:focus-visible {
		opacity: 1;
	}

	@media (prefers-reduced-motion: reduce) {
		.social-link {
			transition: none;
		}
	}
</style>
