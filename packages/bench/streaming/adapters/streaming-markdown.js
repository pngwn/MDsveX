// streaming-markdown, which appends to the dom as text arrives

import * as smd from 'streaming-markdown';

export const api = 'delta';

export function create(root) {
	const parser = smd.parser(smd.default_renderer(root));
	return {
		write(full, delta) {
			smd.parser_write(parser, delta);
		},
		end() {
			smd.parser_end(parser);
		},
		destroy() {
			root.textContent = '';
		},
	};
}
