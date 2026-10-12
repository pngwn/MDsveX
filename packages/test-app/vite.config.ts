import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";
import { mdsvex } from "mdsvex";
import { anchors } from "@mdsvex/plugin-anchors";
import { external_links } from "@mdsvex/plugin-external-links";
import { steps } from "@mdsvex/plugin-steps";
import { tabs } from "@mdsvex/plugin-tabs";

export default defineConfig({
	plugins: [
		mdsvex({
			extensions: [".svx"],
			heading_ids: true,
			plugins: [
				steps(),
				tabs(),
				anchors(),
				external_links({
					target: "_blank",
					internal_hosts: ["mdsvex.pngwn.io"],
					icon: true,
					new_tab_label: "opens in a new tab",
				}),
			],
			templates: {
				article: "$lib/templates/Article.svelte",
				guide: "$lib/templates/Guide.svelte",
			},
		}),
		sveltekit(),
	],
});
