import adapter from '@sveltejs/adapter-auto';
import { mdsvex } from 'mdsvex';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	extensions: [".svelte", ".svx"],
	preprocess: mdsvex({ extension: '.svx' }),

	kit: {
		adapter: adapter()
	}
};

export default config;
