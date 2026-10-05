/**
 * The site global as the editor is holding it right now, for the preview frame only.
 *
 * The chrome this record fills — header, footer, mobile bar — is rendered by the *root layout*,
 * above every page. So the preview route cannot pass live values down to it the ordinary way: the
 * values arrive in a page component, and the components that need them are its ancestors. This is
 * that one wire, and it exists for exactly that reason.
 *
 * It is module state rather than context because both ends are already fixed in the tree: one
 * writer (the preview page) and one reader (the layout), neither able to see the other. Nothing on
 * the public site ever writes it, so `current` is null there and the layout uses what the server
 * loaded — the live path costs a `??` on a page that is not being previewed.
 */
import type { SiteContent } from '../../commitpress.generated';

/**
 * What the editor last posted, normalised. Null until the first keystroke, and again as soon as the
 * preview page is left.
 */
let posted = $state<SiteContent | null>(null);

/**
 * Fill in the shapes the chrome iterates.
 *
 * A payload is the form's *complete* current state, so it is applied wholesale rather than merged —
 * merging would keep drawing a menu item that had just been deleted, which is the one thing a
 * preview must not do. But "complete" is the form's answer, not the schema's: a repeating group with
 * no rows left posts no key at all, and `{#each site.nav}` over `undefined` does not degrade, it
 * throws and takes the whole frame down. Deleting the last menu item is an ordinary thing to do
 * mid-edit.
 *
 * So the missing keys are filled with empty, which is both what they mean and what the components
 * can draw. `details` is an object rather than an array for the same reason — the footer reads
 * straight through it.
 */
function normalise(content: SiteContent): SiteContent {
	return {
		...content,
		details: content?.details ?? ({} as SiteContent['details']),
		opening_hours: content?.opening_hours ?? [],
		nav: content?.nav ?? [],
		mobile_nav: content?.mobile_nav ?? []
	};
}

export const previewSite = {
	/** What the chrome should render, or null to leave the server's copy alone. */
	get current(): SiteContent | null {
		return posted;
	},
	set(content: SiteContent): void {
		posted = normalise(content);
	},
	/**
	 * Forget it. Called when the preview page is torn down: the frame navigating from a global to a
	 * page would otherwise keep the values from an edit that is no longer open, and a stale header is
	 * indistinguishable from a saved one.
	 */
	clear(): void {
		posted = null;
	}
};
