/**
 * internal and never exported from the package, how the vite plugin tells
 * compile which directives of the module of a plugin render at build time
 */
import type { Bundle } from './compile.js';

/**
 * the directive names of the module of a bundle whose component file is
 * named <name>.static.<ext>, set by the vite plugin on its own copy of the
 * bundle and never by a plugin, a registered symbol so a second copy of
 * compile in the dist reads it too
 */
export const STATIC_NAMES: unique symbol = Symbol.for(
	'mdsvex.static_names'
) as never;

/** a bundle as the vite plugin passes it, with the static names of its module */
export interface StaticBundle extends Bundle {
	[STATIC_NAMES]?: readonly string[];
}
