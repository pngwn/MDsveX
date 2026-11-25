// react-markdown with gfm, the whole document parsed and diffed each update

import { createElement } from 'react';
import Markdown from 'react-markdown';
import gfm from 'remark-gfm';
import { react_view } from './react-root.js';

export const api = 'full';

const plugins = [gfm];

export function create(root) {
	return react_view(root, (full) =>
		createElement(Markdown, { remarkPlugins: plugins }, full)
	);
}
