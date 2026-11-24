// the nodes of a block that changed are replaced, kept to show what keeping
// them is worth, not in the default set
import { create_view } from './mdsvex-blocks.js';

export const api = 'delta';

export const create = (root) => create_view(root, false);
