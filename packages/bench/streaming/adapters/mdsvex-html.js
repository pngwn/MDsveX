// the nodes of a block that changed are changed to match its new html
import { create_view } from './mdsvex-blocks.js';

export const api = 'delta';

export const create = (root) => create_view(root, true);
