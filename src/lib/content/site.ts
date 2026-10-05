/**
 * What is left of the static content module.
 *
 * The site details — phone, address, opening hours, navigation — moved into commitpress as a
 * `globals` record and are loaded by `+layout.server.ts`. What stays here is the one thing that is
 * not content: which sections the header underlines as you scroll past them. That is a fact about
 * the page's own markup, not something an editor should be asked to keep in sync with it, so it
 * lives in the code beside the components that rely on those ids existing.
 */

/** The sections the header underlines as you scroll past them. */
export const spiedSections = ['tjanster', 'idfoto', 'om'] as const;
