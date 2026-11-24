// the whole text parsed and the whole dom replaced each update

import { marked } from 'marked';

export const api = 'full';

export function create(root) {
	return {
		write(full) {
			root.innerHTML = marked.parse(full);
		},
		end(full) {
			root.innerHTML = marked.parse(full);
		},
		destroy() {
			root.textContent = '';
		},
	};
}
