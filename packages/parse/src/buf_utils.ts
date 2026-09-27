/**
 * buffer utilities for svelte components.
 *
 * pure functions that read from NodeBuffer accessors.
 * no cursor state, no allocations beyond the returned arrays.
 */

import type { NodeBuffer } from './utils';

const NONE = 0xffffffff;

/** get child indices for a node. */
export function buf_children(buf: NodeBuffer, idx: number): number[] {
	const result: number[] = [];
	let child = buf.first_child_at(idx);
	while (child !== NONE) {
		result.push(child);
		const next = buf.next_at(child);
		if (next === NONE || buf.parent_at(next) !== idx) break;
		child = next;
	}
	return result;
}

/** get text content for a node (value range or pre-materialized string). */
export function buf_text(buf: NodeBuffer, idx: number, source: string): string {
	const s = buf._strings[idx];
	if (s !== undefined) return s;
	const vs = buf.value_start_at(idx);
	const ve = buf.value_end_at(idx);
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
	let child = buf.first_child_at(idx);
	while (child !== NONE) {
		text += buf_text_content(buf, child, source);
		const next = buf.next_at(child);
		if (next === NONE || buf.parent_at(next) !== idx) break;
		child = next;
	}
	return text;
}
