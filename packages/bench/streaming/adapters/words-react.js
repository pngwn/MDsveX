// the react component of words, set up as the plain rows of its own benchmark

import { createElement } from 'react';
import { Markdown } from '@pierre/words/react';
import { react_view } from './react-root.js';

export const api = 'full';

export function create(root) {
	return react_view(root, (full, active) =>
		createElement(
			Markdown,
			{
				mode: 'streaming',
				isAnimating: active,
				animated: false,
				controls: false,
				lineNumbers: false,
			},
			full
		)
	);
}
