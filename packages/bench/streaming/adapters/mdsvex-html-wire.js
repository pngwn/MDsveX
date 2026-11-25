// the tree built from the wire, kept to show what the wire costs in a page,
// not in the default set
import { create_view } from './mdsvex-blocks.js';

export const api = 'delta';

export const create = (root) => create_view(root, true, true);
