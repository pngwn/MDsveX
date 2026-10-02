import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";
import { mdsvex } from "mdsvex";
import { autolink } from "@mdsvex/plugin-autolink";

export default defineConfig({
	plugins: [
		mdsvex({
			extensions: [".svx"],
			parse_plugins: [autolink()],
			templates: { article: "$lib/templates/Article.svelte" },
		}),
		sveltekit(),
	],
});
