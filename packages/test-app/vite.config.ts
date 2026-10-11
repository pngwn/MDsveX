import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";
import { mdsvex } from "mdsvex";
import { autolink } from "@mdsvex/plugin-autolink";
import { steps } from "@mdsvex/plugin-steps";

export default defineConfig({
	plugins: [
		mdsvex({
			extensions: [".svx"],
			plugins: [steps()],
			parse_plugins: [autolink()],
			templates: {
				article: "$lib/templates/Article.svelte",
				guide: "$lib/templates/Guide.svelte",
			},
		}),
		sveltekit(),
	],
});
