import { getContext, setContext } from 'svelte';
import type { ReplContext } from './types';

const key = Symbol('repl');

export function get_repl_context(): ReplContext {
	return getContext(key);
}

export function set_repl_context(value: ReplContext) {
	setContext(key, value);
}
