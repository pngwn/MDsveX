// parse plugins run in the one pass the parser makes, as nodes open and close,
// so they work on a document that is still arriving. Stream.svelte gives both
// lists to PluginStream

import { toc } from '@mdsvex/plugin-toc';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** an id and a link on each heading, both there while the heading streams in */
const heading_links = {
	name: 'heading-links',
	heading: {
		parse(node) {
			const link = node.wrap_inner('link');
			// what parse returns is called when the heading closes
			return () => {
				const slug = node.text_content
					.toLowerCase()
					.replace(/[^\w]+/g, '-')
					.replace(/^-+|-+$/g, '');
				node.attrs.id = slug;
				link.attrs.href = `#${slug}`;
			};
		},
	},
};

const DEFINITIONS = {
	markdown: 'a light markup language for prose',
	opcodes: 'small instructions that build the tree',
};

/**
 * :lookup[term] asks for its definition when it closes. The answer lands
 * later, as a fetch would, and becomes a prop of Lookup.svelte
 */
const lookup = {
	name: 'lookup',
	directives: {
		lookup: {
			parse(node, ctx) {
				return () => {
					const term = node.text_content.trim().toLowerCase();
					ctx.defer(node, async (node) => {
						await sleep(800 + Math.random() * 1200);
						const definition = DEFINITIONS[term] ?? 'no entry';
						node.attrs.args = { ...node.attrs.args, definition };
					});
				};
			},
		},
	},
};

/**
 * a published plugin is a bundle, mdsvex gives the parser its parse plugin
 * and its directive handlers under its name
 */
const contents = toc();

/** handlers by node type, for every node of the document */
export const plugins = [heading_links, { name: contents.name, ...contents.parse }];

/** handlers bound to a directive by its name */
export const directive_handlers = [
	lookup,
	{ name: contents.name, directives: contents.directives },
];
