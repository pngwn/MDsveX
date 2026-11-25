/**
 * PFM Component Renderer
 *
 * Maintains a stable list of block-level entries for a NodeBuffer,
 * each holding a buffer index and a version counter.
 *
 * Designed for use with the <Node> Svelte component:
 *
 *   {#each renderer.blocks as block (block.idx)}
 *     {#key block.v}
 *       <Node buf={renderer.buf} idx={block.idx} source={renderer.source} footnotes={renderer.footnotes} />
 *     {/key}
 *   {/each}
 *
 * Closed blocks have a frozen version, {#key} keeps them stable.
 * Open (streaming) blocks get bumped, {#key} recreates the subtree
 * with fresh content.
 */

import { footnote_index } from '@mdsvex/parse/buf-utils';
import type { FootnoteIndex } from '@mdsvex/parse/buf-utils';
import type { NodeBuffer } from '@mdsvex/parse/utils';

const NONE = 0xffffffff;
const K_LINE_BREAK = 6;
const K_FOOTNOTE_REFERENCE = 36;
const K_FOOTNOTE_DEFINITION = 37;

/** the idx of the block that holds the footnotes section, which is no node */
export const FOOTNOTES_BLOCK = -1;

/** true when block or a node inside it is a footnote reference or definition */
function has_footnote(buf: NodeBuffer, block: number): boolean {
	let node = block;
	for (;;) {
		const kind = buf.kind_at(node) as number;
		if (kind === K_FOOTNOTE_REFERENCE || kind === K_FOOTNOTE_DEFINITION)
			return true;
		const down = buf.first_child_at(node);
		if (down !== NONE) {
			node = down;
			continue;
		}
		for (;;) {
			if (node === block) return false;
			const next = buf.next_at(node);
			const parent = buf.parent_at(node);
			if (next !== NONE && buf.parent_at(next) === parent) {
				node = next;
				break;
			}
			if (parent === NONE) return false;
			node = parent;
		}
	}
}

/** the child of the root that holds a node, NONE for a node out of the tree */
export function top_block(buf: NodeBuffer, node: number): number {
	if (node === 0) return NONE;
	for (;;) {
		const parent = buf.parent_at(node);
		if (parent === 0) return node;
		if (parent === NONE) return NONE;
		node = parent;
	}
}

/** what a highlighter knows about the fence or the code span it renders */
export interface HighlightInfo {
	/** the first word of the info string, "" when the fence names none, the #! hint of a code span */
	lang: string;
	/** the rest of the info string, raw, "" for a code span */
	meta: string;
	/** true for a code span with a #! hint, false for a fence */
	inline: boolean;
	/** true while the code is still being written, code is then what has arrived of it */
	open: boolean;
}

/**
 * html for a fence, usually a single pre, or for a code span with a #! hint,
 * usually a single code, null or undefined draws it plain, it must be
 * synchronous and must escape the code
 */
export type Highlighter = (
	code: string,
	info: HighlightInfo
) => string | null | undefined;

/** what create_highlight from mdsvex/highlight returns, as the Node component reads it */
export interface HighlightConfig {
	block(
		code: string,
		lang: string,
		meta: string,
		ctx: {
			readonly filename: string | undefined;
			unknown_language(lang: string): void;
			warn(code: any, message: string): void;
			readonly open?: boolean;
		}
	): {
		before: string;
		attributes: string | null;
		body: string;
		after: string;
	} | null;
	inline?(
		code: string,
		lang: string,
		ctx: {
			readonly filename: string | undefined;
			unknown_language(lang: string): void;
			warn(code: any, message: string): void;
			readonly open?: boolean;
		}
	): { attributes: string | null; body: string } | null;
}

/** the highlight prop of the Node component, what the highlight option of compile takes */
export type Highlight = Highlighter | HighlightConfig;

/** what a math renderer knows about the latex it renders, as the MathInfo of mdsvex */
export interface MathInfo {
	/** true for a math fence, false for inline math */
	display: boolean;
	/** the info string of the fence after math, '' for inline math */
	meta: string;
	/** undefined in a stream, it has no file */
	filename?: string;
}

/** the math prop of the Node component, what the math option of compile takes */
export type MathRenderer = (latex: string, info: MathInfo) => string;

//  block entry

export interface ComponentBlock {
	/** Buffer index, use as Svelte each key, FOOTNOTES_BLOCK for the footnotes section. */
	idx: number;
	/** Version counter, bumped on each update while the block is open. */
	v: number;
}

//  componentrenderer

export class ComponentRenderer {
	blocks: ComponentBlock[] = [];
	/** The current buffer reference (for passing to Node.svelte). */
	buf: NodeBuffer | null = null;
	/** The current source/text string (for passing to Node.svelte). */
	source = '';
	/** numbered by first reference, null with none, a new object at each update, pass it to every Node */
	footnotes: FootnoteIndex | null = null;
	private closed: Set<number> = new Set();
	/** a block held a footnote, so each update numbers them again */
	private noted = false;
	private section_v = 0;
	private section_key = '';

	update(buf: NodeBuffer, source: string): ComponentBlock[] {
		this.buf = buf;
		this.source = source;

		let block_idx = 0;
		let changed = false;

		const last = this.blocks.length - 1;
		const section =
			last >= 0 && this.blocks[last].idx === FOOTNOTES_BLOCK
				? this.blocks.pop()!
				: null;
		// a definition in a block drawn again draws the section again
		const drawn: number[] = [];

		// walk root's children via sibling chain
		let child = buf.first_child_at(0);
		while (child !== NONE) {
			const kind = buf.kind_at(child);
			const next = buf.next_at(child);
			const is_sibling = next !== NONE && buf.parent_at(next) === 0;

			if (kind !== K_LINE_BREAK) {
				const closed = buf.end_at(child) !== NONE;
				if (!this.closed.has(child)) {
					drawn.push(child);
					if (!this.noted) this.noted = has_footnote(buf, child);
				}

				if (block_idx >= this.blocks.length) {
					this.blocks.push({ idx: child, v: 0 });
					changed = true;
				} else if (this.blocks[block_idx].idx !== child) {
					// the parser took a guess back, as the paragraph it opens for a
					// tag that turns out to stand alone, another node has its place
					this.blocks[block_idx] = { idx: child, v: 0 };
					changed = true;
				} else if (!this.closed.has(child)) {
					this.blocks[block_idx].v++;
					changed = true;
				}

				if (closed && !this.closed.has(child)) {
					this.closed.add(child);
				}

				block_idx++;
			}

			child = is_sibling ? next : NONE;
		}

		// a guess taken back can leave the root with fewer children
		if (block_idx < this.blocks.length) {
			this.blocks.length = block_idx;
			changed = true;
		}

		if (this.noted) {
			const notes = (this.footnotes = footnote_index(buf, true));
			let key = '';
			let stale = false;
			if (notes !== null) {
				const definitions = notes.definitions;
				for (let i = 0; i < definitions.length; i++) {
					const node = definitions[i];
					if (node === NONE) continue;
					key += `${i} ${node} ${notes.counts[i]} ${notes.labels[i]}\n`;
					if (drawn.includes(top_block(buf, node))) stale = true;
				}
			}
			if (key !== this.section_key) {
				this.section_key = key;
				stale = true;
			}
			if (key === '') {
				if (section !== null) changed = true;
			} else if (section !== null && !stale) {
				this.blocks.push(section);
			} else {
				if (section !== null) this.section_v++;
				this.blocks.push({ idx: FOOTNOTES_BLOCK, v: this.section_v });
				changed = true;
			}
		}

		return changed ? (this.blocks = [...this.blocks]) : this.blocks;
	}

	/**
	 * the nodes changed after their block closed, as the node of a deferred
	 * task that applied does, apply_ready gives them, each block that holds
	 * one renders again at the next update
	 */
	invalidate(buf: NodeBuffer, nodes: readonly number[]): void {
		for (let i = 0; i < nodes.length; i++) {
			const block = top_block(buf, nodes[i]);
			if (block !== NONE) this.closed.delete(block);
		}
	}

	reset(): void {
		this.blocks = [];
		this.buf = null;
		this.source = '';
		this.closed.clear();
		this.footnotes = null;
		this.noted = false;
		this.section_v = 0;
		this.section_key = '';
	}
}
