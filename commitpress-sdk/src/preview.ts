/**
 * The preview protocol — how a rendered page tells the editor which part of it is which.
 *
 * The preview pane frames a running instance of the *user's own site*, which is what makes it show
 * their design instead of a CMS approximation of it. The cost is that the editor is looking at a
 * cross-origin document it cannot read: it can post values in, and that is the whole of what it
 * knows. So a page could be twelve sections tall and the form beside it a column of collapsed
 * boxes, with nothing anywhere connecting one to the other — you edited "Item 3" and found out
 * which one that was by changing it and watching.
 *
 * This is the missing half. A target that marks its sections gets:
 *
 *   - the section under the pointer outlined and named, inside the frame;
 *   - a click on it opening that section in the editor;
 *   - and the section being edited outlined and scrolled to, for as long as its drawer is open.
 *
 * Everything here is framework-free and has no dependencies, deliberately: it runs inside somebody
 * else's site, where the only thing that can be assumed is a DOM. `client/svelte/block.svelte` in
 * the `commitpress` package is the same protocol as a Svelte component for sites that want one.
 *
 * ## Why this is in the SDK
 *
 * It lived in the `commitpress` package until 2026-08-07, because the editor's own preview front is
 * in that monorepo and could import it by workspace path. That package is the editor's *server*
 * library — it depends on `@octokit/auth-app`, `@octokit/core` and `zod` — and it is `private: true`
 * with a no-op build that ships raw `.ts`. So the one module explicitly written to run inside a
 * third-party site was the one module a third-party site could not install, and the first real
 * consumer hand-copied the constants instead, which is a protocol with two spellings waiting to
 * happen.
 *
 * It is a **separate entry point** rather than part of `.`, for the same reason `./server` is: the
 * root entry reads content off disk, and nothing browser-bound should pull `node:fs` in behind it.
 * This module imports nothing at all, which is what makes it safe to bundle anywhere.
 *
 * ## Marking a section
 *
 * One attribute on the element that wraps a section, holding its **path** — where the section's
 * values live in the content, in the same bracket notation the editor's form uses:
 *
 * ```html
 * <commitpress-section data-commitpress-section="sections[0]" data-commitpress-label="Hero">
 *   …
 * </commitpress-section>
 * ```
 *
 * The path is the identity; the label is what the chip says and may be omitted. `sectionMarker()`
 * builds both, plus the `display: contents` that keeps the wrapper out of the layout — a marker
 * that moves the page it marks is not a marker anyone can use.
 */

/**
 * The message a preview target posts to its embedder to announce it is listening.
 *
 * Both halves of the handshake are in this repository — the app's preview view sends it, the editor
 * receives it — and they were two string literals that had to agree. A protocol name spelled in two
 * places is a protocol with two spellings eventually.
 */
export const PREVIEW_HANDSHAKE = "commitpress-preview-ready";

/**
 * The same message, sent a second time, carrying `received: true`.
 *
 * It is the **acknowledgement** — the target saying it has the editor's values and is no longer
 * showing what its server rendered. The editor needs one because the handshake alone proves only
 * that the target is up: the values it sends back in answer travel through the editor's own form,
 * which is a `window` event with a listener that is registered on mount, so a target that announced
 * itself before that listener existed was told nothing and went on showing the **published** page
 * until somebody typed. With an ack the editor can simply keep saying it until it is heard.
 *
 * A property on the message every target already sends rather than a message of its own, per the
 * rule on `PREVIEW_FOCUS` — with the direction reversed, the failure it guards against is an older
 * *editor*, which reads this as one more handshake and answers with one more copy of the values.
 * That is why the ack is sent **once per document load** and never for later payloads: an editor
 * that re-posts on every ack, and a target that acks every post, is a loop.
 */
export const PREVIEW_RECEIVED = "received";

/** frame → editor: a marked section was clicked. Carries its path and label. */
export const PREVIEW_SELECT = "commitpress-preview-select";
/**
 * Full-fidelity asset descriptors supplied by the editor for content not deployed to the target.
 *
 * Two halves, and the second one arrived later: `assets` describes every asset the posted content
 * *names*, keyed by id, and `folders` says which ids are filed in each gallery **folder** the
 * content points at, in the library's own stored order.
 *
 * `folders` is what makes a gallery previewable before a save. An `image` field holds an id, so
 * describing the ids in the content is the whole answer; a `gallery` field holds a folder name, and
 * turning a name into photographs is a read of the media index that only a server can do — so a
 * target handed a folder it had never rendered could do nothing at all with it, and the pick showed
 * up in the frame at the next deploy rather than at the next keystroke. The editor has the folder
 * open in the picker that made the pick, so it answers the question rather than posing it.
 *
 * A **property on a message the target already knows**, per the rule stated on `PREVIEW_FOCUS`: an
 * older target reads `assets` exactly as it did and never looks at `folders`, which leaves it with
 * the behaviour it has always had rather than a broken one. See `previewGallery` in
 * `@commitpress/sdk-node/gallery` for the reconciliation that consumes it.
 */
export const PREVIEW_ASSETS = "commitpress-preview-assets";

/** One rendition of a preview asset. `preview_url` is bridged through the editor, not the site. */
export interface PreviewAssetVariant {
  name: string;
  width: number;
  height: number;
  bytes: number;
  custom?: boolean;
  preview_url: string;
}

/** One asset as the editor describes it to a target that cannot resolve it yet. */
export interface PreviewAsset {
  id: string;
  filename: string;
  alt: string;
  width: number;
  height: number;
  uploaded_at: number;
  preview_url: string;
  variants: PreviewAssetVariant[];
}

/** Asset descriptors by id — what the content names, whether or not the target has heard of it. */
export type PreviewAssetMap = Record<string, PreviewAsset>;

/**
 * Which asset ids are filed in each folder the posted content points at, in stored order.
 *
 * Only the folders a gallery field in this content names — never the whole library, which on a
 * project of any size is a payload nobody asked for on every keystroke.
 */
export type PreviewFolderMap = Record<string, string[]>;

/**
 * editor → frame: what the editor is pointed at, and whether it is claiming clicks.
 *
 * `{ path }` is the section being edited right now, or `""` for none. Sent on every change of
 * either half, *and* again on each handshake — a frame that reloads comes back knowing nothing,
 * and the alternative is the outline silently disappearing the first time somebody presses
 * Refresh.
 *
 * ## Why `interactive` is a property here and not a message of its own
 *
 * The overlay claims every click inside a marked section, which is right for the thing it is for
 * and wrong for the page underneath: a carousel's next arrow, a tab strip, an accordion, a video's
 * play button all live *inside* a section, so the one way to see how a block actually behaves was
 * the one gesture the editor had taken. A modified click was the only escape hatch, which is both
 * undiscoverable and useless for anything you have to click twice or drag. Turning it off is a
 * mode and not a heuristic — "which clicks are really the page's" cannot be guessed from a DOM
 * where a section whose whole surface is a click handler looks exactly like one that is inert.
 *
 * That mode wants to be its own message and cannot be one. **A target is always older than the
 * editor talking to it**: it is a copy of this file frozen at whatever SDK version the site
 * installed, and the editor is whatever is deployed today. A message type an old target has never
 * heard of does not fall through to "ignore it" there — it falls through to "this must be the
 * page's content", and the payload is assigned wholesale as the page, which then renders as
 * nothing. Shipping `commitpress-preview-interact` blanked the preview of every site that had not
 * reinstalled, and no amount of fixing this file reaches a target that is already published.
 *
 * An extra *property* on a message every target already knows is the version that degrades: an old
 * one reads the path exactly as it did and ignores what it cannot see, and its overlay stays armed
 * — which is the behaviour it has always had, rather than a broken one. So the rule this protocol
 * now follows is: **extend a message, never add one.**
 *
 * Interactive mode draws no overlay chrome at all — not the hover box, not the chip, and not the
 * focus box either. Half an overlay is the worst of the three states: the page is being *used*, and
 * a rectangle sitting on it that no longer answers a click reads as the mode not having taken.
 * Values keep streaming in, so the preview is still live while you are poking at it, and holding
 * the override modifier brings the chrome back under the pointer — see `SELECT_MODIFIER_KEY`.
 *
 * Note what this cannot do, because it is the thing that surprises: an old target does not merely
 * ignore the flag, it goes on *cancelling* the clicks it claims. So the editor refuses selections
 * on its own side too, which shuts the drawer against any target; but giving the click back to a
 * page whose overlay already cancelled it can only happen inside the frame, on a current SDK.
 */
export const PREVIEW_FOCUS = "commitpress-preview-focus";

/**
 * The element a marker is drawn on.
 *
 * An unregistered custom element rather than a `<div>`, and not for the usual reason — both are
 * neutralised by the `display: contents` below, so neither brings a layout of its own. It is about
 * the *host* stylesheet: this wrapper is inserted into somebody else's page, and their `div { … }`
 * or `.grid > div` rules would happily claim it. Nobody's stylesheet has a rule for
 * `commitpress-section`. It needs no registration and no script — an unknown tag is a valid
 * inline-level element that HTML parses without complaint.
 *
 * Only ever emitted by the marker helpers; nothing resolves a section by tag name, so a site that
 * puts the attribute on an element of its own is equally correct.
 */
export const PREVIEW_SECTION_TAG = "commitpress-section";

/** Where a section's values live in the content. The identity half of a marker. */
export const PREVIEW_SECTION_ATTRIBUTE = "data-commitpress-section";

/** What to call it. Presentation only — nothing is resolved by label. */
export const PREVIEW_LABEL_ATTRIBUTE = "data-commitpress-label";

/**
 * The outline colour, hard-coded rather than themed.
 *
 * The overlay is drawn inside the *target's* document, which has its own stylesheet and none of
 * commitpress's tokens. Inheriting from the page would mean the outline is invisible on any site
 * that happens to use the same colour, which is the one thing it must never be.
 */
export const PREVIEW_ACCENT = "#4f46e5";

/**
 * Svelte context keys, for a target rendering through commitpress's own block components.
 *
 * `Symbol.for` rather than a fresh symbol: the marker component and the preview root are separate
 * modules, and under a bundler that gives one of them its own copy the keys would not match and the
 * markers would silently never appear.
 */
export const PREVIEW_MARKED_CONTEXT = Symbol.for("commitpress.preview.marked");
/**
 * The editor's asset descriptors, for blocks rendered inside a preview target.
 *
 * A third key, because the two above are about *where* a value is and this one is about what an id
 * resolves to. A block deep in the tree holds an asset id and nothing else; the descriptors arrive
 * on a message at the root. Passing them down as props would mean every block between the two
 * forwarding a prop it does not use.
 */
export const PREVIEW_ASSETS_CONTEXT = Symbol.for("commitpress.preview.assets");
export const PREVIEW_PATH_CONTEXT = Symbol.for("commitpress.preview.path");

/**
 * What the frame reports when a marked section is clicked.
 *
 * `forced` marks a selection the override modifier asked for. The editor needs it because it does
 * not trust the frame to be honouring interactive mode at all: a target is somebody else's site
 * running whatever SDK version it installed, so one older than the mode goes on claiming clicks and
 * reporting them regardless. The editor therefore refuses selections while interactive — and would
 * refuse the deliberate Shift+click too, which is why the frame says which kind this was.
 */
export type PreviewSelection = {
  type: string;
  path: string;
  label: string;
  forced: boolean;
};

/**
 * Hold this and a click selects the section, whatever mode the overlay is in.
 *
 * Interactive mode is the one you leave on for a while — you are checking how a page behaves, not
 * making one edit — so the thing it needs is not a way back to the toolbar but a way to open the
 * block you are looking at *without* leaving the state you set up to look at it. Reaching for the
 * toggle loses the open accordion, the slide you scrolled to, the tab you switched to.
 *
 * Shift and not Ctrl or ⌘: those already mean "open this link somewhere else" and are the escape
 * hatch that makes a link in the preview followable at all, which is worth more than a second
 * spelling of this. Shift's browser meaning — open in a new window — is the one of the three
 * nobody relies on, and it is cancelled here rather than left to fire alongside.
 *
 * `SELECT_MODIFIER_KEY` is the same key as a `KeyboardEvent.key`, for watching it go down and up.
 */
export const SELECT_MODIFIER_KEY = "Shift";

/**
 * Whether an event carries the override and nothing else.
 *
 * Exact, not "is Shift down": Shift+Ctrl+click is somebody asking the browser for something, and
 * answering it with a section drawer would be this overlay claiming a gesture it was not offered.
 */
export function isSelectModifier(event: MouseEvent | PointerEvent | KeyboardEvent): boolean {
  return !!event.shiftKey && !event.metaKey && !event.ctrlKey && !event.altKey;
}

/**
 * The prefix every message in this protocol is named with. Nothing is tagged outside it.
 */
const PREVIEW_MESSAGE_PREFIX = "commitpress-preview-";

/**
 * Whether an incoming message is protocol rather than page content.
 *
 * The editor posts a page's values as a **bare object** — `{ sections: [...] }` — and everything
 * here as a tagged one, so a target has to tell them apart before assigning one as the other. It
 * is not "does it have a `type` key", which is the version that looks right and is not: a field
 * name is `[a-z_]+`, so `type` is a perfectly legal name for a content field, and a page that had
 * one would have its whole payload discarded and preview as blank.
 *
 * It is the **namespace** and not a closed list of the four names, which is what it was until
 * `PREVIEW_INTERACT` was added and the closed list turned out to be a trap. A target is a copy of
 * this file frozen at whatever SDK version the site installed; the editor is always the newest.
 * So the list a target checks against is *older than the messages it receives*, by construction —
 * and an unrecognised message did not fall through to "ignore it", it fell through to "this must
 * be the page's content", which replaced the whole page with an object that renders as nothing.
 * Adding one message type to the protocol blanked the preview of every site that had not
 * reinstalled. The prefix keeps the property that mattered — a content field called `type` holds a
 * value the page chose, not a namespaced protocol name — while making the *next* addition inert in
 * an old target instead of destructive.
 */
export function isPreviewProtocolMessage(data: unknown): boolean {
  const type = (data as { type?: unknown } | null)?.type;
  return typeof type === "string" && type.startsWith(PREVIEW_MESSAGE_PREFIX);
}

/**
 * Whether a focus message is handing clicks back to the page, or `null` if it is not one.
 *
 * Read strictly: anything other than a literal `true` — the key absent, a string, a number — is
 * the selecting mode, which is the one the editor exists for and the one every older editor means
 * by sending no flag at all.
 *
 * Exported because the overlay is not the only thing in a target that has to know the mode: a
 * target also holds its frame against navigation, and *that* deferred to the overlay for links
 * inside a section on the grounds that the overlay would cancel them. In interactive mode it no
 * longer does, so the two have to agree — and agreeing by each parsing the message the same way
 * from the same function is the version that cannot drift.
 */
/**
 * Whether a handshake is the target's acknowledgement rather than its announcement.
 *
 * One function so the two states of one message are never told apart by a raw property read at each
 * end. Read strictly, like `readInteractMessage`: anything other than a literal `true` — including
 * an older target, which has no idea the flag exists — is an announcement, which is the reading
 * that keeps the editor re-posting rather than the one that makes it stop.
 */
export function isPreviewAck(data: unknown): boolean {
  const message = data as { type?: unknown; received?: unknown } | null;
  return message?.type === PREVIEW_HANDSHAKE && message.received === true;
}

export function readInteractMessage(data: unknown): boolean | null {
  const message = data as { type?: unknown; interactive?: unknown } | null;
  if (message?.type !== PREVIEW_FOCUS) return null;
  return message.interactive === true;
}

/* ---------------------------------------------------------------- addressing */

/**
 * The kinds a preview path names by prefix.
 *
 * A preview target is framed at `<preview_url><path>`, and until now that path could only be read
 * as a page: a page is served at its slug, so the editor sent the slug and the target resolved it
 * through its own router. That works for the one kind that *is* a URL and quietly fails for the
 * three that are not — a global at `content/globals/site` was framed at `…/site`, which is
 * indistinguishable from a page called "site" and resolved as one, so the frame showed the
 * empty-page state and every posted value landed on a page that was never being edited. Live
 * updates for site details and menus were not broken so much as unaddressed.
 *
 * So an item that is not a URL is addressed by **kind and path** — `globals/site`,
 * `collections/posts/hello`, `blocks/cta`. Collections already were, which is what makes this one
 * rule rather than a special case: a grouped kind had to carry its container to be unambiguous, and
 * a non-routed flat kind needs it for exactly the same reason. Pages keep the bare public path they
 * have always had, so no existing target changes behaviour on the kind it already handles.
 *
 * The list is duplicated from the CMS's kind registry, deliberately: this module imports nothing, by
 * design — it runs inside somebody else's site. The CMS builds these paths from `kind.routed`, so a
 * kind added there and not here degrades to `"pages"` on the parsing side, which is what old targets
 * do with an unknown prefix anyway.
 */
export const PREVIEW_KINDS = ["globals", "collections", "blocks"] as const;

export type PreviewKind = (typeof PREVIEW_KINDS)[number] | "pages";

/**
 * Read a framed path back into the kind and path it names.
 *
 * For a target's router. `globals/site` is the site global; `about` is the page served at `/about`;
 * `""` is the home page. The kind is only ever taken from a **whole first segment** that is one of
 * the prefixed kinds, so a page legitimately called `globalsomething` is still a page.
 *
 * Everything unrecognised reads as a page, which is both the historical behaviour and the right
 * failure: the previous protocol had no prefixes at all, so a path this function cannot place is
 * overwhelmingly likely to be one of those, and resolving it as a page is what every target already
 * did with it.
 */
export function readPreviewPath(path: string): { kind: PreviewKind; path: string } {
  const clean = String(path ?? "")
    .split(/[?#]/)[0]!
    .replace(/^\/+|\/+$/g, "");
  const [head, ...rest] = clean.split("/");
  if ((PREVIEW_KINDS as readonly string[]).includes(head || "") && rest.length) {
    return { kind: head as PreviewKind, path: rest.join("/") };
  }
  return { kind: "pages", path: clean };
}

/**
 * A section's path, built from its parent's.
 *
 * The index is always a number here, even where the *form* would spell it `__keep` — that spelling
 * is an encoding detail of how a single instance is posted back, and a path that changed the moment
 * a second section was added would be an identity that is not one.
 */
export function sectionPath(parent: string, name: string, index: number): string {
  return `${parent}${name}[${index}]`;
}

/**
 * Read a path back into the field/index pairs it is made of.
 *
 * A path arrives over `postMessage` from a document this app does not control, so it is parsed
 * rather than trusted: anything that is not a complete chain of `name[digits]` returns no segments
 * at all, and the caller opens nothing. Partial parsing would be worse than none — it would open
 * *a* section, just not the one that was clicked.
 *
 * A name is `[a-z_]+`, which is the schema language's own rule for a field name — not a looser
 * "anything up to the bracket". Loose was tried and was wrong twice in the same way: it read
 * `"leading sections[0]"` as a field called `leading sections`, and `"sections[0].items[1]"` as a
 * field called `.items`, both of which are junk accepted as a section that will not be found.
 */
export function parseSectionPath(path: string): { name: string; index: number }[] {
  const segments: { name: string; index: number }[] = [];
  let consumed = 0;
  for (const match of String(path).matchAll(/([a-z_]+)\[(\d+)\]/g)) {
    if (match.index !== consumed) return [];
    consumed += match[0].length;
    segments.push({ name: match[1] as string, index: Number(match[2]) });
  }
  return consumed === String(path).length && segments.length ? segments : [];
}

/**
 * A readable name for a block key, for a target that has values but no schema.
 *
 * The frame renders from the content alone — `page_header`, `code_compare` — and the schema's real
 * label ("Page header") lives in the editor. This is what the chip says until something better is
 * available, and it is better than the raw key by exactly the amount that matters when you are
 * scanning a page for the section you are about to edit.
 */
export function humanizeBlockName(name: string): string {
  const words = String(name).replace(/[_-]+/g, " ").trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : "";
}

/**
 * The attributes that make an element a section marker.
 *
 * `display: contents` is the load-bearing part: the wrapper generates no box, so the page lays out
 * byte for byte as it did without it. The overlay takes the union of the wrapper's children as the
 * rectangle to draw, which is what that costs.
 */
export function sectionMarker(
  path: string,
  label?: string,
): Record<string, string> {
  return {
    [PREVIEW_SECTION_ATTRIBUTE]: path,
    [PREVIEW_LABEL_ATTRIBUTE]: label || "",
    style: "display: contents",
  };
}

/**
 * The rectangle to draw around a marked element.
 *
 * A `display: contents` wrapper has no box of its own — `getBoundingClientRect()` on one is all
 * zeros — so the box is the union of what it wraps. Returning the element's own rect first keeps
 * this working for a site that put the attribute on a real element instead of a wrapper, which is
 * the other supported way to mark a section.
 */
function markerRect(element: Element): DOMRect | null {
  const own = element.getBoundingClientRect();
  if (own.width || own.height) return own;

  let top = Infinity;
  let left = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const child of Array.from(element.children)) {
    const rect = child.getBoundingClientRect();
    if (!rect.width && !rect.height) continue;
    top = Math.min(top, rect.top);
    left = Math.min(left, rect.left);
    right = Math.max(right, rect.right);
    bottom = Math.max(bottom, rect.bottom);
  }
  if (right === -Infinity) return null;
  return new DOMRect(left, top, right - left, bottom - top);
}

/** Every marked element, in document order. */
function markers(doc: Document): Element[] {
  return Array.from(doc.querySelectorAll(`[${PREVIEW_SECTION_ATTRIBUTE}]`));
}

/**
 * The element a path names.
 *
 * Matched by reading the attribute rather than by a selector, because a path contains `[` and `]`
 * and would otherwise have to be escaped correctly at every call site — one missed `CSS.escape` and
 * the lookup throws a `SyntaxError` inside somebody else's page.
 */
function markerFor(doc: Document, path: string): Element | null {
  if (!path) return null;
  return (
    markers(doc).find((el) => el.getAttribute(PREVIEW_SECTION_ATTRIBUTE) === path) ?? null
  );
}

/* ------------------------------------------------------------------ content */

/**
 * Where a target keeps the last values the editor posted, so a reload can render them.
 *
 * Session storage rather than a variable, because the entire point is to survive the one thing a
 * variable does not: the document being loaded again. Keyed by the path, so two content items
 * previewed in the same tab do not hand each other their values.
 */
const PREVIEW_CONTENT_STORAGE = "commitpress-preview-content:";

/**
 * How long a stashed payload is worth replaying.
 *
 * Short on purpose. It exists to cover the gap between a reload and the editor's next post, which is
 * the length of a handshake — a second at most. The window is generous against a slow dev server and
 * still far too short to show somebody yesterday's unsaved draft as though it were the page, which
 * is the failure mode a longer one would buy.
 */
const PREVIEW_CONTENT_TTL = 5 * 60 * 1000;

/** One key per previewed path. */
function contentKey(): string {
  return PREVIEW_CONTENT_STORAGE + location.pathname + location.search;
}

/** What one stash holds. Everything the editor said about this document, in one record. */
type StashedPayload = {
  at: number;
  content?: unknown;
  assets?: PreviewAssetMap;
  folders?: PreviewFolderMap;
};

/** The stash as it stands, or an empty record. Never throws; see `rememberPayload`. */
function readPayload(): StashedPayload | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(contentKey());
    if (!raw) return null;
    const stashed = JSON.parse(raw) as StashedPayload;
    if (typeof stashed?.at !== "number") return null;
    if (Date.now() - stashed.at > PREVIEW_CONTENT_TTL) return null;
    return stashed;
  } catch {
    return null;
  }
}

/**
 * Remember what the editor said, for the next load of this same page.
 *
 * **Merged into what is already there, not written over it.** The two halves arrive on two messages
 * — the values, and the asset descriptors that say what the ids in them resolve to — and a stash
 * that kept only the most recent one would replay a document naming pictures it could not draw.
 * That was the whole of why a reloaded frame showed the *old* image: the values replayed, the
 * descriptors did not, and an id with no descriptor beside it falls back to whatever the target's
 * own published catalogue says that id is.
 *
 * Every failure here is swallowed: storage can be disabled, full, or partitioned away, and a preview
 * that throws inside somebody else's site over a caching optimisation is worse than one that simply
 * does not have the optimisation.
 */
function rememberPayload(patch: Omit<StashedPayload, "at">): void {
  try {
    const current = readPayload() ?? {};
    sessionStorage.setItem(
      contentKey(),
      JSON.stringify({ ...current, ...patch, at: Date.now() }),
    );
  } catch {}
}

/**
 * The values this page was showing when it was last loaded, if that was a moment ago.
 *
 * ## How to apply it
 *
 * **Not as the initial value of server-rendered state.** That is the version that looks right: read
 * the stash where the content is chosen, and the first paint is already the edited page. But a
 * preview target is a page of the site and is server-rendered like one, and `sessionStorage` is
 * something the server could not have seen — seeding hydration out of it is a mismatch, not a head
 * start, and what the framework does about that is its own business rather than a design.
 *
 * Apply it **after hydration, as a remount**: read it in an effect, assign it, and flip a flag the
 * content tree is keyed on, so the tree is built again in one pass from the edited values instead of
 * being patched into agreement with them. The remount is the whole point — see below — and it costs
 * one extra mount on a load that had something stashed, which is a load somebody asked for.
 *
 * ## What this is for
 *
 * A preview target renders twice in two quite different ways: once as a page, from the file on
 * disk, and thereafter as a *patch* — the editor posts the form's current values and the framework
 * reconciles them into the tree that is already mounted. Those two paths are supposed to agree, and
 * when they do not it is always the second one that is wrong, because it is the only one the site
 * never otherwise runs: a published page is rendered once and hydrated once, with its content
 * constant for the life of the document. Anything in a component that assumes render-once —
 * `$state` seeded from a prop, a one-shot observer, a class written from script onto an element
 * whose framework owns its `class` attribute — is correct everywhere except here.
 *
 * The editor's answer to a preview it does not trust is the Rebuild button, and until this existed
 * that answer was a poor one: reloading showed the *saved* file, so the values being edited had to
 * arrive again as a patch, through the same code path that was suspected in the first place. With
 * the payload stashed and replayed as a remount, a reload is a genuine fresh render of exactly what
 * is in the form — which is the one rendering of it that cannot be wrong, and is what makes "press
 * Rebuild" a real diagnosis rather than a shrug.
 *
 * It is a **fallback and not a fix**: the disagreement is still a bug in the component, and this is
 * how somebody finds out that it is one and gets on with the edit meanwhile. The recurring cause is
 * worth naming, since it has now been found twice — an element's `class` attribute belongs to
 * whoever renders it, so a `use:` action or any other script that adds a class to an element with an
 * interpolated `class` loses it silently on the next update.
 *
 * It is deliberately **not** consumed on read. A second reload is the commonest next thing somebody
 * does, and a payload that worked once and then vanished would make the button non-deterministic.
 * It is superseded on the next post and expires on its own.
 */
export function takePreviewContent<T = unknown>(): T | null {
  return (readPayload()?.content ?? null) as T | null;
}

/**
 * The asset descriptors this page was last given, if that was a moment ago.
 *
 * The other half of `takePreviewContent`, and it has to be applied **before** it: the content is
 * what names the ids, so replaying the values first paints one frame in which every freshly picked
 * picture resolves against the target's published catalogue instead — which is the old picture, or
 * none. Both come out of one stash, so they cannot be a generation apart.
 *
 * Always objects, empty at worst, matching `connectPreviewAssets` — a caller never branches on
 * absence.
 */
export function takePreviewAssets(): {
  assets: PreviewAssetMap;
  folders: PreviewFolderMap;
} {
  const stashed = readPayload();
  return { assets: stashed?.assets ?? {}, folders: stashed?.folders ?? {} };
}

/**
 * Receive the editor's values. Call it from the page the editor frames; returns a teardown.
 *
 * This is the listener every target had written for itself, and the two things it has to get right
 * are the two that are easy to miss. Protocol messages are filtered out — the editor posts values as
 * a bare object and everything else tagged, so a target that skipped this would eventually render a
 * focus message as its page and blank. And each payload is stashed for `takePreviewContent`, which
 * is what makes reloading the frame show the edit rather than the file.
 *
 * The values are handed over **whole**, never merged: the editor posts the form's complete current
 * state, so merging would keep drawing a block that had just been deleted.
 */
function isTrustedPreviewMessage(event: MessageEvent): boolean {
  if (event.source !== window.parent || window.parent === window) return false;
  // The CMS preview host is the direct parent. A missing referrer gives us no origin to trust.
  try {
    return !!document.referrer && event.origin === new URL(document.referrer).origin;
  } catch {
    return false;
  }
}

export function connectPreviewContent<T = unknown>(
  onContent: (content: T) => void,
): () => void {
  if (typeof window === "undefined") return () => {};

  /**
   * Whether the editor has been told its values arrived. Once per document load — see
   * `PREVIEW_RECEIVED` for why acknowledging every payload would be a loop rather than a habit.
   */
  let acknowledged = false;

  const onMessage = (event: MessageEvent) => {
    if (!isTrustedPreviewMessage(event)) return;
    if (!event.data || typeof event.data !== "object") return;
    if (isPreviewProtocolMessage(event.data)) return;
    rememberPayload({ content: event.data });
    onContent(event.data as T);
    if (acknowledged) return;
    acknowledged = true;
    window.parent?.postMessage(
      { type: PREVIEW_HANDSHAKE, [PREVIEW_RECEIVED]: true },
      "*",
    );
  };

  window.addEventListener("message", onMessage);
  return () => window.removeEventListener("message", onMessage);
}

/**
 * Receive the editor's asset descriptors. Call it from the page the editor frames; returns a
 * teardown.
 *
 * The second argument is the folder map — see `PREVIEW_ASSETS`. It is a second *parameter* rather
 * than a second connection because both halves ride on one message and arrive together: a target
 * that resolved a gallery from a folder list without the descriptors for what is in it would render
 * the right pictures as broken images for one frame.
 *
 * Both are always objects, empty at worst, so a caller never branches on absence. An editor that
 * has no asset grant — the author may edit this page and not read the library — posts empty ones,
 * which is the same shape and correctly resolves nothing.
 */
export function connectPreviewAssets<T = PreviewAssetMap>(
  onAssets: (assets: T, folders: PreviewFolderMap) => void,
): () => void {
  if (typeof window === "undefined") return () => {};
  const onMessage = (event: MessageEvent) => {
    if (!isTrustedPreviewMessage(event)) return;
    if (event.data?.type !== PREVIEW_ASSETS) return;
    const assets = (event.data.assets ?? {}) as PreviewAssetMap;
    const folders = (event.data.folders ?? {}) as PreviewFolderMap;
    // Stashed beside the values, so a reload replays a document and the descriptors for what is in
    // it together. See `rememberPayload`.
    rememberPayload({ assets, folders });
    onAssets(assets as unknown as T, folders);
  };
  window.addEventListener("message", onMessage);
  return () => window.removeEventListener("message", onMessage);
}

/**
 * Draw the section outlines inside a preview target, and report clicks on them to the editor.
 *
 * Call it from the page the editor frames. Returns a teardown.
 *
 * The overlay is built out of two absolutely-positioned boxes in a fixed, click-through layer of
 * its own rather than by putting an outline on the section itself: an `outline` on somebody else's
 * element inherits their `border-radius`, is clipped by their `overflow: hidden`, and — worst — is
 * a style change to the page you are supposed to be previewing.
 */
export function connectPreviewOverlay(): () => void {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return () => {};
  }

  const doc = document;
  let hoveredPath = "";
  let focusedPath = "";
  let frame = 0;
  /** See `PREVIEW_FOCUS`. Armed until the editor says otherwise. */
  let interactive = false;
  /** Whether the override modifier is down right now. See `SELECT_MODIFIER`. */
  let overrideHeld = false;
  /**
   * What the pointer was last over. Kept so holding the modifier can light up the section under a
   * pointer that is not moving — otherwise the outline would only appear once you jiggled the
   * mouse, which is the one moment nobody does.
   */
  let pointerTarget: Element | null = null;

  const layer = doc.createElement("div");
  layer.setAttribute("data-commitpress-overlay", "");
  layer.setAttribute("aria-hidden", "true");
  layer.style.cssText =
    "position:fixed;inset:0;pointer-events:none;z-index:2147483000;contain:layout;";

  const makeBox = (solid: boolean) => {
    const box = doc.createElement("div");
    box.style.cssText = [
      "position:absolute",
      "display:none",
      "box-sizing:border-box",
      "border-radius:3px",
      `border:${solid ? "2px solid" : "1px dashed"} ${PREVIEW_ACCENT}`,
      solid ? `background:${PREVIEW_ACCENT}12` : "background:transparent",
      "transition:opacity 100ms ease",
    ].join(";");
    return box;
  };

  const focusBox = makeBox(true);
  const hoverBox = makeBox(false);

  const chip = doc.createElement("div");
  chip.style.cssText = [
    "position:absolute",
    "display:none",
    "max-width:min(60vw,320px)",
    "overflow:hidden",
    "text-overflow:ellipsis",
    "white-space:nowrap",
    "padding:2px 6px",
    "border-radius:3px",
    `background:${PREVIEW_ACCENT}`,
    "color:#fff",
    "font:500 11px/1.5 ui-sans-serif,system-ui,-apple-system,Segoe UI,sans-serif",
    "letter-spacing:0.01em",
  ].join(";");

  layer.append(focusBox, hoverBox, chip);
  doc.body.appendChild(layer);

  /** Position one box over one path. Returns the rect it used, if the path resolved to anything. */
  const place = (box: HTMLElement, path: string): DOMRect | null => {
    const element = path ? markerFor(doc, path) : null;
    const rect = element ? markerRect(element) : null;
    if (!rect) {
      box.style.display = "none";
      return null;
    }
    box.style.display = "block";
    box.style.transform = `translate(${Math.round(rect.left)}px, ${Math.round(rect.top)}px)`;
    box.style.width = `${Math.round(rect.width)}px`;
    box.style.height = `${Math.round(rect.height)}px`;
    return rect;
  };

  const draw = () => {
    frame = 0;
    // In interactive mode the overlay draws nothing at all — not the hover box and not the focus
    // box either. Half an overlay is the worst of the three states: the page is being used, and a
    // rectangle sitting on it that no longer answers a click reads as the mode not having taken.
    // Holding the modifier brings the chrome back, which is what makes the override visible before
    // it is used rather than a shortcut you have to already know worked.
    if (interactive && !overrideHeld) {
      focusBox.style.display = "none";
      hoverBox.style.display = "none";
      chip.style.display = "none";
      return;
    }
    const focusRect = place(focusBox, focusedPath);
    // The hovered section is not drawn twice when it is also the focused one — two boxes on one
    // rectangle reads as a rendering fault rather than as two states that happen to agree.
    const hoverRect = place(hoverBox, hoveredPath === focusedPath ? "" : hoveredPath);

    // The chip names whichever box is on top: what you are pointing at wins over what is open,
    // because pointing is the question being asked right now.
    const path = hoverRect ? hoveredPath : focusedPath;
    const rect = hoverRect ?? focusRect;
    const element = rect ? markerFor(doc, path) : null;
    const label =
      element?.getAttribute(PREVIEW_LABEL_ATTRIBUTE) || (element ? path : "");
    if (!rect || !label) {
      chip.style.display = "none";
      return;
    }
    // Assigned only when it actually changed. Writing the same string still replaces the text node,
    // which the observer below sees as a DOM change, which schedules a redraw — a loop that runs
    // every frame for as long as anything is outlined.
    if (chip.textContent !== label) chip.textContent = label;
    chip.style.display = "block";
    // Above the box, or tucked inside its top edge when the section starts at the top of the
    // viewport — a label drawn off-screen is the same as no label at all.
    const height = chip.offsetHeight || 18;
    const top = rect.top >= height + 2 ? rect.top - height - 2 : rect.top + 2;
    chip.style.transform = `translate(${Math.round(rect.left)}px, ${Math.round(top)}px)`;
  };

  /**
   * Redraw on the next frame.
   *
   * Coalesced, because everything that moves a section — scrolling, a resize, and above all the
   * live-update stream rewriting the page on every keystroke — would otherwise each force a
   * synchronous layout read.
   */
  const schedule = () => {
    if (frame) return;
    frame = requestAnimationFrame(draw);
  };

  /**
   * Resolve what is hovered from where the pointer is and whether selection is armed.
   *
   * Split out of the pointer handler because two other things change the answer without the
   * pointer moving: the mode arriving from the editor, and the override modifier going down or up.
   */
  const resolveHover = () => {
    // Nothing is hoverable when nothing is clickable — an outline offering a selection that will
    // not happen is worse than no outline. Resolved to `""` rather than by returning early, so a
    // mode change mid-hover clears the box that is already drawn.
    const armed = !interactive || overrideHeld;
    const marker = armed
      ? (pointerTarget?.closest?.(`[${PREVIEW_SECTION_ATTRIBUTE}]`) ?? null)
      : null;
    const path = marker?.getAttribute(PREVIEW_SECTION_ATTRIBUTE) || "";
    if (path === hoveredPath) return;
    hoveredPath = path;
    schedule();
  };

  const onPointerMove = (event: PointerEvent | MouseEvent) => {
    pointerTarget = event.target as Element | null;
    // Read off the event rather than tracked from key events alone: a modifier pressed while the
    // frame did not have focus never produced a keydown here, and the first pointer move is where
    // that is noticed.
    overrideHeld = isSelectModifier(event);
    resolveHover();
  };

  /**
   * The override modifier going down or up, with the pointer sitting still.
   *
   * Only the modifier is watched, and only to redraw: the click handler reads the *event* it was
   * given rather than this flag, so a key state that goes stale — the frame losing focus mid-press,
   * say — costs an outline that is drawn a moment too long, never a click that goes the wrong way.
   */
  const onModifierKey = (event: KeyboardEvent) => {
    if (event.key !== SELECT_MODIFIER_KEY) return;
    const held = event.type === "keydown";
    if (held === overrideHeld) return;
    overrideHeld = held;
    if (interactive) schedule();
    resolveHover();
  };

  const onPointerLeave = () => {
    pointerTarget = null;
    if (!hoveredPath) return;
    hoveredPath = "";
    schedule();
  };

  /**
   * A click on a section opens it in the editor instead of doing whatever the page would have done.
   *
   * Capture phase, so the site's own handlers do not run first — a click that both selected the
   * section and submitted the newsletter form inside it would be the worse of both. Modified clicks
   * are left entirely alone, which is what keeps a link in the preview followable: hold ⌘ or Ctrl.
   */
  const onClick = (event: MouseEvent) => {
    if (event.button !== 0) return;
    // The override selects in either mode, which is what makes it one rule to remember rather than
    // a mode-specific trick: Shift+click always opens the section. Without it, an unmodified click
    // selects only while armed, and every other modifier is left to the browser — that is the
    // escape hatch that keeps a link in the preview followable with ⌘ or Ctrl.
    if (!isSelectModifier(event)) {
      if (interactive) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    }
    const target = event.target as Element | null;
    const marker = target?.closest?.(`[${PREVIEW_SECTION_ATTRIBUTE}]`);
    const path = marker?.getAttribute(PREVIEW_SECTION_ATTRIBUTE);
    if (!path) return;
    event.preventDefault();
    event.stopPropagation();
    const selection: PreviewSelection = {
      type: PREVIEW_SELECT,
      path,
      label: marker?.getAttribute(PREVIEW_LABEL_ATTRIBUTE) || "",
      forced: isSelectModifier(event),
    };
    window.parent?.postMessage(selection, "*");
  };

  const onMessage = (event: MessageEvent) => {
    if (!isTrustedPreviewMessage(event)) return;
    const mode = readInteractMessage(event.data);
    if (mode === null) return;
    if (mode !== interactive) {
      interactive = mode;
      // Re-resolved here and not left to the next pointer move: switching mode with the pointer
      // sitting still over a section would otherwise leave its outline drawn until something
      // moved, which reads as the mode not having taken. `schedule` as well, because the focus box
      // is drawn from the mode alone and changes even when the hover does not.
      resolveHover();
      schedule();
    }
    const path = typeof event.data.path === "string" ? event.data.path : "";
    const changed = path !== focusedPath;
    focusedPath = path;
    schedule();
    // Scrolling is done only when the focus actually moved, and only when the section is not
    // already on screen. Re-scrolling on every repeat of the same message would fight the person
    // who scrolled away from it deliberately.
    if (!changed || !path) return;
    const element = markerFor(doc, path);
    const rect = element ? markerRect(element) : null;
    if (!rect) return;
    const visible = rect.top < window.innerHeight * 0.9 && rect.bottom > window.innerHeight * 0.1;
    if (visible) return;
    (element as HTMLElement | null)?.scrollIntoView?.({
      behavior: "smooth",
      block: "center",
    });
  };

  doc.addEventListener("pointermove", onPointerMove, true);
  // On the root element and *not* in the capture phase: `pointerleave` does not bubble, but a
  // capturing listener on the document still sees every one of them, so the hover would be cleared
  // every time the pointer crossed from a section into a child of it.
  doc.documentElement.addEventListener("pointerleave", onPointerLeave);
  doc.addEventListener("click", onClick, true);
  doc.addEventListener("keydown", onModifierKey, true);
  doc.addEventListener("keyup", onModifierKey, true);
  window.addEventListener("message", onMessage);
  window.addEventListener("scroll", schedule, true);
  window.addEventListener("resize", schedule);

  /**
   * The page is rewritten from under this on every keystroke — the live-update stream replaces the
   * blocks wholesale — so the boxes are repositioned when the DOM changes rather than only when
   * something is scrolled. Without it the outline stays where the section used to be, which is a
   * worse lie than no outline.
   */
  const observer = new MutationObserver(() => schedule());
  observer.observe(doc.body, { childList: true, subtree: true, characterData: true });

  schedule();

  return () => {
    if (frame) cancelAnimationFrame(frame);
    observer.disconnect();
    doc.removeEventListener("pointermove", onPointerMove, true);
    doc.documentElement.removeEventListener("pointerleave", onPointerLeave);
    doc.removeEventListener("click", onClick, true);
    doc.removeEventListener("keydown", onModifierKey, true);
    doc.removeEventListener("keyup", onModifierKey, true);
    window.removeEventListener("message", onMessage);
    window.removeEventListener("scroll", schedule, true);
    window.removeEventListener("resize", schedule);
    layer.remove();
  };
}
