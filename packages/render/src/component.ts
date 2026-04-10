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
 *       <Node buf={renderer.buf} idx={block.idx} source={renderer.source} />
 *     {/key}
 *   {/each}
 *
 * Closed blocks have a frozen version, {#key} keeps them stable.
 * Open (streaming) blocks get bumped, {#key} recreates the subtree
 * with fresh content.
 */

import type { NodeBuffer } from "@mdsvex/parse/utils";

const NONE = 0xffffffff;
const K_LINE_BREAK = 6;

//  block entry

export interface ComponentBlock {
	/** Buffer index, use as Svelte each key. */
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
	source = "";
	private closed: Set<number> = new Set();

	update(buf: NodeBuffer, source: string): ComponentBlock[] {
		this.buf = buf;
		this.source = source;

		let block_idx = 0;
		let changed = false;

		// walk root's children via sibling chain
		let child = buf._children_starts[0]; // root is index 0
		while (child !== NONE) {
			const kind = buf._kinds[child];
			const next = buf._next_siblings[child];
			const is_sibling = next !== NONE && buf._parents[next] === 0;

			if (kind !== K_LINE_BREAK) {
				const closed = buf._ends[child] !== NONE;

				if (block_idx >= this.blocks.length) {
					this.blocks.push({ idx: child, v: 0 });
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

		return changed ? (this.blocks = [...this.blocks]) : this.blocks;
	}

	reset(): void {
		this.blocks = [];
		this.buf = null;
		this.source = "";
		this.closed.clear();
	}
}
