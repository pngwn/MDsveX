import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";
import { mdsvex } from "mdsvex";
import { anchors } from "@mdsvex/plugin-anchors";
import { steps } from "@mdsvex/plugin-steps";

export default defineConfig({
	plugins: [
		mdsvex({
			extensions: [".svx"],
			heading_ids: true,
			plugins: [steps(), anchors()],
			templates: {
				article: "$lib/templates/Article.svelte",
				guide: "$lib/templates/Guide.svelte",
			},
		}),
		sveltekit(),
	],
});
