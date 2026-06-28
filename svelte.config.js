import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),
	compilerOptions: {
		runes: true
	},
	kit: {
		adapter: adapter({
			pages: 'build',
			assets: 'build',
			precompress: true,
			strict: true
		}),
		prerender: {
			handleHttpError: 'warn',
			entries: ['*']
		}
	}
};

export default config;
