/**
 * What the CMS writes beside an uploaded image, and how to turn it into an `<img>`.
 *
 * An image field stores an asset **id** and nothing else — `"1786099328131"`. Everything needed to
 * render it (which renditions exist, how wide each one is, the intrinsic size) lives in the
 * `asset.json` the uploader writes next to the files.
 *
 * ## A rendition's bytes DO change, and this is where that was got wrong
 *
 * This module used to say the opposite — "a re-crop is written under a new id, so a given id's
 * bytes never change" — and the media route's `immutable` cache header rested on it. It is false.
 * Re-cropping in the CMS calls `replaceRenditions`, which rewrites the files **under the same id**:
 * same `<id>/banner.webp`, same `<id>/asset.json`, new pixels. So the URL was byte-identical to the
 * one already in the browser's cache and marked good for a year, and a re-crop appeared to do
 * nothing in the live preview while the editor's own thumbnail — which stamps its URLs — swapped
 * correctly. Nothing 404s, nothing errors: `imageSources` finds the pinned name in the *stale*
 * descriptor and hands back the old file, which is why this failed silently every time.
 *
 * Hence `assetRevision` and the `?v=` on every variant URL below, which is the same stamp
 * commitpress puts on its own (`assetUrl` in the CMS's `content/media`). The original is never
 * stamped: it is written once by the upload and is the source every re-cut reads, never a result of
 * one. With the stamp in place the bytes really are immutable per URL and the route's long
 * `cache-control` on the image files is honest — the descriptor is a different matter, and the
 * route now says so.
 *
 * This module is browser-safe on purpose. The reading of `asset.json` off disk is in
 * `assets.server.ts`, because the preview has to resolve an id the server never saw — the editor
 * posts a freshly picked image over `postMessage`, long after the load function ran.
 */

export type ImageVariant = {
	name: string;
	/** Relative to the images directory, e.g. `1786099328131/card.webp`. */
	path: string;
	width: number;
	height: number;
	bytes: number;
	/**
	 * Cut for this image alone, in the CMS's crop editor, rather than produced by a preset.
	 *
	 * The distinction the delivery rule below turns on. A preset rendition is a size *every* image
	 * has, so a set of them is a ladder a browser may choose from; a custom one is a shape somebody
	 * cut for one slot on one page — a 16:9 banner off a portrait — and is a **different picture**
	 * rather than a smaller copy of the same one. It is rendered where a field pinned it and nowhere
	 * else.
	 */
	custom?: boolean;
};

export type ImageAsset = {
	id: string;
	filename: string;
	/** The full-size webp the renditions were derived from. */
	path: string;
	source_type: string;
	width: number;
	height: number;
	bytes: number;
	uploaded_at: number;
	/**
	 * When the renditions were last re-cut, where they have been. The cache stamp, and nothing else.
	 *
	 * Written by the CMS's `replaceRenditions`. It has to be recorded rather than derived because a
	 * rebuild changes the bytes at a path and nothing else — same id, same rendition names, same
	 * paths, often the same dimensions — so there is nothing else in a descriptor a browser could
	 * tell two revisions apart by. Absent on every asset uploaded before it existed, and those have
	 * not been re-cut, so `uploaded_at` is the honest answer for them.
	 */
	updated_at?: number;
	/** The library's own description. A field's `alt` wins over it — see `ResponsiveImage`. */
	alt: string;
	variants: ImageVariant[];
};

/** The assets one page references, by id. Built per request and passed down as page data. */
export type ImageManifest = Record<string, ImageAsset>;

/**
 * Where the media route is mounted, plus the `images/` segment.
 *
 * The paths inside `asset.json` are relative to `__commitpress__/media/images`, while the route
 * serves `__commitpress__/media` — so the segment belongs here rather than in the stored path, and
 * getting that wrong 404s every variant.
 */
const MEDIA_BASE = '/__commitpress__/media/images';

export function mediaUrl(path: string, revision?: number): string {
	const url = `${MEDIA_BASE}/${path.replace(/^\/+/, '')}`;
	return revision ? `${url}?v=${revision}` : url;
}

/**
 * Which revision of an asset's renditions is on disk — see `ImageAsset.updated_at`.
 *
 * Falls back to the upload time so that every asset stamps something: an id whose descriptor
 * predates `updated_at` still gets a stable, unique `?v=`, which costs nothing and means the rule
 * "a variant URL always carries its revision" has no exceptions to remember.
 */
export function assetRevision(asset: ImageAsset): number {
	return asset.updated_at ?? asset.uploaded_at;
}

/** The descriptor for an id, which the media route serves like any other file under `media/`. */
export function assetJsonUrl(id: string): string {
	return `${MEDIA_BASE}/${encodeURIComponent(id)}/asset.json`;
}

/**
 * Where this site's breakpoints actually are — one entry per alternate slot the CMS declares.
 *
 * The CMS stores a breakpoint as a **name and a label** (`mobile`, "Mobile") and nothing else: no
 * media query and no width. That is not an omission to be filled in later, it is the seam. Both of
 * the missing numbers are facts about *this stylesheet* — they are already written down in CSS,
 * they change when the design changes, and a second copy inside a schema is a second place to edit
 * with no way to tell which of the two is stale. So the CMS answers **which picture** and the site
 * answers **when**, which is this map.
 *
 * **This map is the whole of how a picture varies with the viewport.** A slot resolves to one file
 * and the condition decides which slot applies — there is no `srcset` and no `sizes` anywhere, on
 * the grounds `imageSources` sets out: renditions are named slots with framing of their own, so
 * offering them as interchangeable candidates hands the browser a choice of *crop*.
 *
 * `767.98px` rather than `767px` is Tailwind's `md` boundary (`48rem`) approached from below,
 * without the half-pixel gap a fractional viewport width can fall into.
 */
export const BREAKPOINTS = {
	mobile: '(max-width: 767.98px)'
} as const satisfies Record<string, string>;

/**
 * One slot resolved: the file to point at, and what shape it is.
 *
 * No `srcset`, and that is the correction rather than a simplification — see `imageSources`. A slot
 * resolves to exactly one file, and what varies with the viewport is *which slot applies*, which is
 * the schema's breakpoints and is settled in the markup rather than by the browser.
 */
export type ImageSources = {
	src: string;
	/** The file's intrinsic size, for the aspect ratio the browser reserves before the bytes land. */
	width: number;
	height: number;
};

/** The name a pinned `original` carries. Not a variant on any manifest — it is the asset itself. */
const ORIGINAL_RENDITION = 'original';

/**
 * The CMS's own thumbnail, which is on every asset and belongs on no page.
 *
 * commitpress cuts `cp-thumb` — 320px, `inside`, quality 0.7 — on every upload, for its own library
 * grid and picker. It is a file under `variants` like any other, and reading it as a delivery
 * rendition is a page serving a 320px copy at quality 0.7: since `images.sizes` on this project is
 * empty, that thumbnail is frequently the *only* entry in `variants`, and the "renditions, else the
 * original" rule below would then hand every photograph on the site to a 320px preview cut for a
 * 160px tile. Named here rather than imported because `@commitpress/sdk` reads the library with
 * `node:fs` and this module is browser-safe on purpose; the CMS's own guards are written against
 * the same string.
 */
const EDITOR_THUMB = 'cp-thumb';

/**
 * The pair commitpress cuts for every image in a folder marked as a gallery.
 *
 * `cp-grid` is ~640px for a tile and `cp-full` ~1600px for what sits behind one. Unlike the names in
 * `images.sizes`, these two are reserved by commitpress and mean the same thing in every repository,
 * which is what makes it safe for a component here to ask for one by name.
 *
 * They have to be *asked for*, and this is where that was got wrong. `imageSources` with no pin
 * answers the **widest** preset rendition, so a gallery asset — whose only two presets are these —
 * resolved to `cp-full` in the grid whether or not `cp-grid` existed. Nothing 404s and nothing looks
 * wrong: every tile in a forty-photograph grid was simply the 1600px file, which is the exact cost
 * the gallery profile exists to avoid. The widest rule is still right for an ordinary image field,
 * where the renditions are a ladder somebody configured for delivery; it is wrong here, where the
 * two files are a tile and a lightbox and the call site knows which one it is.
 *
 * Named here rather than imported from `@commitpress/sdk` for the reason `EDITOR_THUMB` is: the
 * SDK's `assets.ts` reads the library with `node:fs` and this module is browser-safe on purpose.
 * (`@commitpress/sdk/image` is fs-free, but these constants live in the fs-bound entry.)
 */
export const GALLERY_GRID = 'cp-grid';
export const GALLERY_FULL = 'cp-full';

/** The asset's own file, in the shape a variant has, for the two places that need it as one. */
function originalVariant(asset: ImageAsset): ImageVariant | null {
	if (!asset.path || !(asset.width > 0)) return null;
	return {
		name: ORIGINAL_RENDITION,
		path: asset.path,
		width: asset.width,
		height: asset.height,
		bytes: asset.bytes
	};
}

/**
 * One resolved file, in the shape the markup needs it.
 *
 * Stamped with the asset's revision, except for the original — see the note at the top of this
 * file. The original is written once by the upload and re-read by every re-cut, so its bytes really
 * do never change; a rendition's do, at a path that stays exactly the same, and the stamp is the
 * only thing that distinguishes them.
 */
function describe(variant: ImageVariant | null, asset: ImageAsset): ImageSources | null {
	if (!variant) return null;

	return {
		src: mediaUrl(
			variant.path,
			variant.name === ORIGINAL_RENDITION ? undefined : assetRevision(asset)
		),
		width: variant.width,
		height: variant.height
	};
}

/** The widest of a set, or `null` for an empty one. */
function widest(variants: ImageVariant[]): ImageVariant | null {
	return variants.reduce<ImageVariant | null>(
		(held, variant) => (!held || variant.width > held.width ? variant : held),
		null
	);
}

/**
 * The one file a reference resolves to.
 *
 * ## Renditions are not a `srcset`, and this is where that was got wrong
 *
 * This used to hand back a **ladder** — several renditions of one asset as `srcset` candidates, with
 * `sizes` left to the call site, so the browser chose between them by layout width and device pixel
 * ratio. That reads as ordinary responsive-image practice and is wrong for what a commitpress
 * rendition *is*. Renditions are not one picture at several widths; they are **named slots with
 * framing of their own** — a 1:1 `thumb`, a 4:3 `card`, a 16:9 banner cut off a portrait. Offering
 * them as interchangeable candidates lets the browser swap the *crop*, and it broke the one feature
 * that exists to prevent exactly that: an editor pinning `card` next to a wider rendition of the
 * same shape saw the browser go on serving the wider one. The pin looked ignored, and nothing
 * reported why, because nothing had failed.
 *
 * **The responsive decision belongs to the schema's breakpoints, not to the renditions.** A field
 * declaring `breakpoints` (`mobile`, …) is an editor saying *this slot gets a different picture
 * under this condition*; the site maps the slot name onto a media query in `BREAKPOINTS`, and
 * `ResponsiveImage` renders one `<source>` per filled slot. That is the whole of how a picture
 * varies here — an author's choice, per breakpoint, with the crop settled by whoever chose it.
 * A rendition only ever answers *which file this one slot is*.
 *
 * ## Which file that is
 *
 * In order:
 *
 *   - **The pinned rendition**, when a field pinned one. A choice of file, served as that file.
 *   - **Otherwise the widest preset rendition** — what `images.sizes` declares, cut for every image
 *     alike, which is the site's own delivery copy. `images.sizes` is empty on this project, so
 *     there are none today.
 *   - **Otherwise the original.** The archive copy, bounded to 4096px and encoded as webp by the
 *     uploader, which is a perfectly serveable picture.
 *
 * Two kinds of file are never chosen on the site's own initiative, and both used to be, because
 * `variants` reads as a delivery list and is not one:
 *
 *   - **Custom crops** (`custom: true`) — cut in the crop editor for one slot on one page. A 16:9
 *     banner off a portrait is a different photograph, not a smaller `original`. Rendered where a
 *     field pinned it and nowhere else. Six assets here carry one.
 *   - **`cp-thumb`** — see the constant. On 305 of 307 assets, and with `images.sizes` empty it was
 *     frequently the *only* entry, so "the renditions if there are any, else the original" made a
 *     320px preview the delivery copy for nearly the whole library.
 *
 * **A pin the asset does not carry falls through** to the rules below it rather than to nothing. The
 * preset may have been added after the upload, the source was too small to produce it, or a sweep
 * removed it after somebody pinned it; every other reader of the value falls back the same way, and
 * a picture is a better answer than a hole.
 */
export function imageSources(
	asset: ImageAsset | null | undefined,
	/** The rendition the field pinned, from `imageRendition()`. `''` — the usual case — is "site decides". */
	rendition = ''
): ImageSources | null {
	if (!asset) return null;

	const renditions = (asset.variants ?? []).filter(
		(variant) =>
			variant?.path &&
			variant.width > 0 &&
			variant.height > 0 &&
			// See `EDITOR_THUMB`. Filtered here rather than in the branches below so that it is out of
			// both the candidate set *and* the "does this asset have any renditions at all?" question
			// the fallback to the original turns on.
			variant.name !== EDITOR_THUMB
	);
	const original = originalVariant(asset);

	if (rendition) {
		const pinned =
			rendition === ORIGINAL_RENDITION
				? original
				: (renditions.find((variant) => variant.name === rendition) ?? null);

		if (pinned) return describe(pinned, asset);
	}

	// A custom crop is the pinning slot's business and nobody else's, so it is not a candidate here —
	// which means an asset whose only renditions are custom resolves to its original, exactly as one
	// with no renditions at all does.
	return describe(widest(renditions.filter((variant) => !variant.custom)) ?? original, asset);
}
