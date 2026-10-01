import adapter from "@sveltejs/adapter-auto";

/** @type {import('@sveltejs/kit').Config} */
const config = {
	extensions: [".svelte", ".svx"],

	kit: {
		adapter: adapter(),
	},
};

export default config;
