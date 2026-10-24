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
import { diagram } from "@mdsvex/plugin-diagram";
import { link_check } from "@mdsvex/plugin-link-check";
import { numbering } from "@mdsvex/plugin-numbering";
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
			links: { routes: "src/routes" },
			plugins: [
				steps(),
				tabs(),
				elements(),
				embeds(),
				figures(),
				code_blocks(),
				diagram(),
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
				numbering(),
				link_check({ routes: "src/routes", extensions: [".svx"] }),
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
