/**
 * buffer utilities for svelte components.
 *
 * pure functions that read from NodeBuffer typed arrays.
 * no cursor state, no allocations beyond the returned arrays.
 */

import type { NodeBuffer } from './utils';

const NONE = 0xffffffff;

/** get child indices for a node. */
export function buf_children(buf: NodeBuffer, idx: number): number[] {
	const result: number[] = [];
	let child = buf._children_starts[idx];
	while (child !== NONE) {
		result.push(child);
		const next = buf._next_siblings[child];
		if (next === NONE || buf._parents[next] !== idx) break;
		child = next;
	}
	return result;
}

/** get text content for a node (value range or pre-materialized string). */
export function buf_text(
	buf: NodeBuffer,
	idx: number,
	source: string
): string {
	const s = buf._strings[idx];
	if (s !== undefined) return s;
	const vs = buf._value_starts[idx];
	const ve = buf._value_ends[idx];
	if (vs === NONE || ve === NONE || ve <= vs) return '';
	return source.slice(vs, ve);
}

/** collect all text content from a node and its children recursively. */
export function buf_text_content(
	buf: NodeBuffer,
	idx: number,
	source: string
): string {
	// Check own value first
	const own = buf_text(buf, idx, source);
	if (own) return own;
	// Walk children
	let text = '';
	let child = buf._children_starts[idx];
	while (child !== NONE) {
		text += buf_text_content(buf, child, source);
		const next = buf._next_siblings[child];
		if (next === NONE || buf._parents[next] !== idx) break;
		child = next;
	}
	return text;
}
