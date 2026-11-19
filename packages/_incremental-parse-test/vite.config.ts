import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";
import { fileURLToPath } from "url";

const parse = (p: string) =>
	fileURLToPath(new URL(`../parse/src/${p}`, import.meta.url));

export default defineConfig({
	plugins: [sveltekit()],
	resolve: {
		alias: [
			{
				find: /^@mdsvex\/parse$/,
				replacement: parse("main.ts"),
			},
			{
				find: "@mdsvex/parse/wire-tree-builder",
				replacement: parse("wire_tree_builder.ts"),
			},
			{
				find: "@mdsvex/parse/tree-builder",
				replacement: parse("tree_builder.ts"),
			},
			{
				find: "@mdsvex/parse/cursor",
				replacement: parse("cursor.ts"),
			},
			{
				find: "@mdsvex/parse/utils",
				replacement: parse("utils.ts"),
			},
			{
				find: "@mdsvex/parse/buf-utils",
				replacement: parse("buf_utils.ts"),
			},
		],
	},
});
