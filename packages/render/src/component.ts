/**
 * PFM Component Renderer
 *
 * Maintains a stable list of block-level entries for a PFMDocument,
 * each holding a direct PFMNode reference and a version counter.
 *
 * Designed for use with the <Node> Svelte component:
 *
 *   {#each renderer.blocks as block (block.id)}
 *     {#key block.v}
 *       <Node node={block.node} />
 *     {/key}
 *   {/each}
 *
 * Closed blocks have a frozen version — {#key} keeps them stable.
 * Open (streaming) blocks get bumped — {#key} recreates the subtree
 * with fresh content. This is cheap since only the last block is
 * typically open.
 */

import type { PFMNode, PFMDocument } from '@mdsvex/parse';

// ── Block entry ──────────────────────────────────────────────

export interface ComponentBlock {
	/** Stable node ID — use as Svelte each key. */
	id: number;
	/** Direct reference to the PFMNode. */
	node: PFMNode;
	/** Version counter — bumped on each update while the block is open. */
	v: number;
}

// ── ComponentRenderer ────────────────────────────────────────

/**
 * Maintains a stable list of block-level component entries for a PFMDocument.
 *
 * Call update() after each doc.apply(batch). Returns a new array reference
 * when blocks change, so assigning to a $state variable triggers Svelte
 * reactivity.
 */
export class ComponentRenderer {
	/** Current block entries. */
	blocks: ComponentBlock[] = [];
	/** Tracks which block IDs have been finalized (closed). */
	private closed: Set<number> = new Set();

	/**
	 * Update blocks from the current document state.
	 * Returns a new array reference when there are changes.
	 */
	update(doc: PFMDocument): ComponentBlock[] {
		if (!doc.root) return this.blocks;

		const content = doc.root.content;
		let blockIdx = 0;
		let changed = false;

		for (let i = 0; i < content.length; i++) {
			const item = content[i];
			if (typeof item === 'string') continue;
			if (item.kindName === 'line_break') continue;

			if (blockIdx >= this.blocks.length) {
				// New block
				this.blocks.push({ id: item.id, node: item, v: 0 });
				changed = true;
			} else if (!this.closed.has(item.id)) {
				// Existing block, still open — bump version
				this.blocks[blockIdx].v++;
				changed = true;
			}

			if (item.closed && !this.closed.has(item.id)) {
				this.closed.add(item.id);
			}

			blockIdx++;
		}

		// Return new reference so $state assignment triggers update
		return changed ? (this.blocks = [...this.blocks]) : this.blocks;
	}

	/** Reset for a new document. */
	reset(): void {
		this.blocks = [];
		this.closed.clear();
	}
}
