import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";
import { fileURLToPath } from "url";

export default defineConfig({
	plugins: [sveltekit()],
	resolve: {
		alias: {
			mdsvex: fileURLToPath(new URL("../mdsvex/src/main.ts", import.meta.url)),
		},
	},
});
