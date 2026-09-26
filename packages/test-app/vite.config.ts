import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";
import { mdsvex } from "mdsvex";
import { autolink } from "@mdsvex/plugin-autolink";

export default defineConfig({
	plugins: [
		mdsvex({
			extensions: [".svx"],
			parsePlugins: [autolink()],
		}),
		sveltekit(),
	],
});
