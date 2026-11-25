// a plugin with no directive: handlers by node type, for every node of the
// document. They run in the one pass the parser makes, as nodes open and
// close, so they work on a document that is still arriving

export default {
	heading: {
		parse(node) {
			const link = node.wrap_inner('link');
			// what parse returns is called when the heading closes
			return () => {
				const slug = node.text_content
					.toLowerCase()
					.replace(/[^\w]+/g, '-')
					.replace(/^-+|-+$/g, '');
				link.attrs.href = `#${slug}`;
			};
		},
	},
};
