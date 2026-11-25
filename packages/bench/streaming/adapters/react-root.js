// one react root, each update commits before it returns

import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';

export function react_view(root, element) {
	const react = createRoot(root);
	return {
		write(full) {
			flushSync(() => react.render(element(full, true)));
		},
		end(full) {
			flushSync(() => react.render(element(full, false)));
		},
		destroy() {
			flushSync(() => react.unmount());
		},
	};
}
