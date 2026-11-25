// the dom renderer of words, with no react

import { createDomRenderer } from '@pierre/words/html';

export const api = 'full';

export function create(root) {
	const renderer = createDomRenderer(root, {
		controls: false,
		lineNumbers: false,
	});
	renderer.connect();
	return {
		write(full) {
			renderer.update(full, true, true);
		},
		end(full) {
			renderer.update(full, false, false);
		},
		destroy() {
			renderer.disconnect();
			root.textContent = '';
		},
	};
}
