// See https://svelte.dev/docs/kit/types#app.d.ts
/// <reference types="gtag.js" />

declare global {
  interface Window {
    dataLayer: any[];
  }

  namespace App {
    // interface Error {}
    // interface Locals {}
    // interface PageData {}
    interface PageState {
      /**
       * Which photograph a viewer on this page is showing, and whose.
       *
       * Shallow routing: the viewer is a state of the page rather than a route of its own, so
       * opening it pushes a history entry and the browser's back gesture closes it. `grid` names
       * the grid the index belongs to, because a page may carry more than one — two `photo_grid`
       * blocks, say — and an unqualified index would open all of them at once. See
       * `lib/gallery/viewer.svelte.ts`.
       */
      viewer?: { grid: string; photo: number };
    }
    // interface Platform {}
  }
}

export {};
