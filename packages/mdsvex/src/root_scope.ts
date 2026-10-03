import { ComponentScope } from '@mdsvex/render/html-cursor';
import type { ComponentSource } from '@mdsvex/render/html-cursor';
import type { ComponentMode } from './compile';

// plugins keep one components array per config, so its scope is built once
const root_scopes = new WeakMap<ComponentSource[], ComponentScope>();

/** the scope chain for the root fallback, null when nothing is replaced */
export function scope_of(
	components: ComponentSource[] | undefined,
	mode?: ComponentMode
): ComponentScope | null {
	if (mode !== undefined && mode !== 'markdown' && mode !== 'all')
		throw new Error(
			`component_mode must be 'markdown' or 'all', got ${JSON.stringify(mode)}`
		);
	if (components === undefined || components.length === 0) return null;
	let scope = root_scopes.get(components);
	if (scope === undefined) {
		scope = new ComponentScope(components, 'G');
		root_scopes.set(components, scope);
	}
	return scope;
}
