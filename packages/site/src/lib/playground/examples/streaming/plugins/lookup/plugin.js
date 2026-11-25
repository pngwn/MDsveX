// the default export is the plugin, what the plugins option of mdsvex takes.
// lookup.svelte beside this file is the component of its directive

const DEFINITIONS = {
	markdown: 'a light markup language for prose',
	opcodes: 'small instructions that build the tree',
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export default {
	// handlers bound to a directive by its name
	directives: {
		lookup: {
			// called as :lookup opens, what it returns is called as it closes
			parse(node, ctx) {
				return () => {
					const term = node.text_content.trim().toLowerCase();
					// the answer lands later, as a fetch would. A stream shows the
					// directive at once and patches it, a compile waits
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
