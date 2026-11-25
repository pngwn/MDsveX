// streamdown, set up as the plain rows of the words benchmark

import { createElement } from 'react';
import { Streamdown } from 'streamdown';
import { react_view } from './react-root.js';

export const api = 'full';

export function create(root) {
	return react_view(root, (full, active) =>
		createElement(
			Streamdown,
			{
				mode: 'streaming',
				dir: 'ltr',
				isAnimating: active,
				animated: false,
				controls: false,
				lineNumbers: false,
				codeBlockMaxHeight: 0,
			},
			full
		)
	);
}
