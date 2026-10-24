import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";
import { mdsvex } from "mdsvex";
import { anchors } from "@mdsvex/plugin-anchors";
import { citations } from "@mdsvex/plugin-citations";
import { emoji } from "@mdsvex/plugin-emoji";
import { external_links } from "@mdsvex/plugin-external-links";
import { elements } from "@mdsvex/plugin-elements";
import { embeds } from "@mdsvex/plugin-embeds";
import { figures } from "@mdsvex/plugin-figures";
import { code_blocks } from "@mdsvex/plugin-code-blocks";
import { page_data } from "@mdsvex/plugin-page-data";
import { references } from "@mdsvex/plugin-references";
import { steps } from "@mdsvex/plugin-steps";
import { tabs } from "@mdsvex/plugin-tabs";
import { toc } from "@mdsvex/plugin-toc";

export default defineConfig({
	plugins: [
		mdsvex({
			extensions: [".svx"],
			heading_ids: true,
			unwrap_images: true,
			plugins: [
				steps(),
				tabs(),
				elements(),
				embeds(),
				figures(),
				code_blocks(),
				anchors(),
				external_links({
					target: "_blank",
					internal_hosts: ["mdsvex.pngwn.io"],
					icon: true,
					new_tab_label: "opens in a new tab",
				}),
				toc(),
				page_data({
					edit_url:
						"https://github.com/pngwn/MDsveX/edit/next/packages/test-app/",
				}),
				references({
					repo: "pngwn/MDsveX",
					linkify: true,
					attrs: { class: "reference" },
				}),
				emoji({ label: true }),
				citations(),
			],
			templates: {
				article: "$lib/templates/Article.svelte",
				demo: "$lib/templates/Demo.svelte",
				guide: "$lib/templates/Guide.svelte",
				post: "$lib/templates/Post.svelte",
			},
		}),
		sveltekit(),
	],
});
