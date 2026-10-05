import type { Action } from 'svelte/action';

/**
 * Show an element once it has scrolled into view, then stop watching it.
 *
 * One observer for the whole page rather than one per element: the callback is the same for all of
 * them, and a document with forty frames should not hold forty observers. Elements unobserve
 * themselves on first intersection — nothing here reverses when you scroll back up, because a
 * photograph that fades out again as you leave it is a distraction, not an entrance.
 *
 * What is entering still decides the transition — prose blocks and photograph frames move
 * differently — but that is read off the element's own `.reveal` / `.frame` class in `app.css`
 * rather than chosen here. This action says one thing about an element: it has arrived.
 *
 * ## Why `data-revealed` and not a class
 *
 * This used to `classList.add('is-shown')`, which is a class the *element's owner* does not know
 * about — and in Svelte 5 an element's `class` attribute is owned wholesale by whoever renders it.
 * Any re-render where an interpolated part of that attribute changed re-assigned `className` and
 * took `is-shown` with it. The element had already unobserved itself on first intersection, so
 * nothing ever put it back: the photograph stayed at `opacity: 0` for the life of the page.
 *
 * That is exactly the shape of the live-preview bug in `PhotoGrid` — changing an item's
 * `orientation` in the CMS changes `Frame`'s `ratio`, which is interpolated into the same `class`
 * as `use:reveal`, so the photograph vanished the moment the value was posted in. It reproduced
 * nowhere else because a *server* render arrives with the class already gone and the observer
 * un-fired, which is the state the action recovers from correctly.
 *
 * An attribute is immune: Svelte never rewrites attributes it does not itself render, and no
 * component here renders `data-revealed`. The rule that keeps this true is worth stating plainly —
 * **an action must never write to `class` or `style`**, because those two are the element author's,
 * and it holds for any action added later.
 */
let observer: IntersectionObserver | undefined;

/** The mark, in one place: the action sets it, `app.css` selects on it. */
const REVEALED = 'data-revealed';

function shared(): IntersectionObserver {
	observer ??= new IntersectionObserver(
		(entries) => {
			for (const entry of entries) {
				if (!entry.isIntersecting) continue;
				entry.target.setAttribute(REVEALED, '');
				observer?.unobserve(entry.target);
			}
		},
		{ rootMargin: '0px 0px -6% 0px', threshold: 0.05 }
	);
	return observer;
}

export const reveal: Action<HTMLElement> = (node) => {
	const io = shared();
	io.observe(node);

	return {
		destroy() {
			io.unobserve(node);
		}
	};
};
