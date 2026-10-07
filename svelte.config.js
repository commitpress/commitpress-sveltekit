import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

const development = process.env.NODE_ENV !== 'production';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    csp: {
      directives: {
        // Draft image requests start at the CMS and redirect to its isolated asset host.
        // The preview document must permit both, including when embedded in the editor.
        'img-src': [
          'self',
          'data:',
          'blob:',
          'https://cms.commitpress.com',
          'https://commitpress-assets.up.railway.app',
          ...(development ? /** @type {const} */ (['http://localhost:*', 'http://127.0.0.1:*']) : [])
        ]
      }
    },
    adapter: adapter({ precompress: true })
  }
};

export default config;
