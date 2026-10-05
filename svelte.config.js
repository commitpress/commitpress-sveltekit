import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/**
 * @type {import('@sveltejs/kit').Config}
 *
 * There is deliberately no custom server. `adapter-node` emits a complete one at `build/index.js`,
 * run by `pnpm start` as `node build`. An earlier version of this repo wrapped it in Express to add
 * compression and a health check, which cost more than it bought: `vite dev` never loads a custom
 * server, so anything mounted there silently exists in the deploy and not in dev. The health check
 * is now a route, and the two things that need to serve bytes outside `static/` are routes too.
 */
const config = {
	preprocess: vitePreprocess(),
	kit: {
		// Emits .br/.gz beside the built assets, which adapter-node's server prefers when the client
		// accepts them. This replaces what Express's compression() did for static files; SSR HTML is
		// left to the platform's edge, which is where it was already being compressed in practice.
		adapter: adapter({ precompress: true })
	}
};

export default config;
