import { describe, it, expect } from 'vitest';
import { TreeBuilder } from '../src/tree_builder';
import { NodeKind } from '../src/utils';

describe('TreeBuilder', () => {
	describe('basic node creation', () => {
		it('creates root node automatically', () => {
			const tb = new TreeBuilder(64);
			const nodes = tb.get_buffer();
			const root = nodes.get_node(0);
			expect(root.kind).toBe('root');
			expect(root.children).toEqual([]);
		});

		it('creates a paragraph with text child', () => {
			const tb = new TreeBuilder(64);
			// open root (skipped, auto-created)
			tb.open(0, NodeKind.root, 0, -1, 0, false);
			// open paragraph under root
			tb.open(1, NodeKind.paragraph, 0, 0, 0, false);
			// text inside paragraph
			tb.text(1, 0, 5);
			// close paragraph
			tb.close(1, 5);
			// close root
			tb.close(0, 5);

			const nodes = tb.get_buffer();
			const root = nodes.get_node(0);
			expect(root.children.length).toBe(1);

			const para = nodes.get_node(root.children[0]);
			expect(para.kind).toBe('paragraph');
			expect(para.start).toBe(0);
			expect(para.end).toBe(5);
			expect(para.children.length).toBe(1);

			const text = nodes.get_node(para.children[0]);
			expect(text.kind).toBe('text');
			expect(text.value).toEqual([0, 5]);
		});

		it('creates a heading with value range', () => {
			const tb = new TreeBuilder(64);
			tb.open(0, NodeKind.root, 0, -1, 0, false);
			tb.open(1, NodeKind.heading, 0, 0, 2, false);
			// heading text becomes value, not child node
			tb.text(1, 3, 8);
			tb.close(1, 9);
			tb.close(0, 9);

			const nodes = tb.get_buffer();
			const root = nodes.get_node(0);
			const heading = nodes.get_node(root.children[0]);
			expect(heading.kind).toBe('heading');
			expect(heading.metadata.depth).toBe(2);
			// text() sets value range for headings
			expect(heading.value).toEqual([3, 8]);
			// no child text node
			expect(heading.children).toEqual([]);
		});
	});

	describe('attributes', () => {
		it('sets metadata via attr', () => {
			const tb = new TreeBuilder(64);
			tb.open(0, NodeKind.root, 0, -1, 0, false);
			tb.open(1, NodeKind.link, 0, 0, 0, false);
			tb.text(1, 0, 5);
			tb.attr(1, 'href', '/url');
			tb.attr(1, 'title', 'A title');
			tb.close(1, 15);
			tb.close(0, 15);

			const nodes = tb.get_buffer();
			const root = nodes.get_node(0);
			const link = nodes.get_node(root.children[0]);
			expect(link.kind).toBe('link');
			expect(link.metadata.href).toBe('/url');
			expect(link.metadata.title).toBe('A title');
		});

		it('sets value range via attr', () => {
			const tb = new TreeBuilder(64);
			tb.open(0, NodeKind.root, 0, -1, 0, false);
			tb.open(1, NodeKind.code_fence, 0, 0, 0, false);
			tb.attr(1, 'value_start', 10);
			tb.attr(1, 'value_end', 25);
			tb.close(1, 30);
			tb.close(0, 30);

			const nodes = tb.get_buffer();
			const root = nodes.get_node(0);
			const fence = nodes.get_node(root.children[0]);
			expect(fence.value).toEqual([10, 25]);
		});

		it('sets value as tuple via attr', () => {
			const tb = new TreeBuilder(64);
			tb.open(0, NodeKind.root, 0, -1, 0, false);
			tb.open(1, NodeKind.code_span, 0, 0, 0, false);
			tb.attr(1, 'value', [3, 8]);
			tb.close(1, 9);
			tb.close(0, 9);

			const nodes = tb.get_buffer();
			const root = nodes.get_node(0);
			const span = nodes.get_node(root.children[0]);
			expect(span.value).toEqual([3, 8]);
		});
	});

	describe('speculation and revocation', () => {
		it('commits pending node on close', () => {
			const tb = new TreeBuilder(64);
			tb.open(0, NodeKind.root, 0, -1, 0, false);
			tb.open(1, NodeKind.paragraph, 0, 0, 0, false);
			// speculative emphasis
			tb.open(2, NodeKind.strong_emphasis, 5, 1, 0, true);
			tb.text(2, 6, 11);
			// closing commits it
			tb.close(2, 12);
			tb.close(1, 12);
			tb.close(0, 12);

			const nodes = tb.get_buffer();
			const root = nodes.get_node(0);
			const para = nodes.get_node(root.children[0]);
			const emph = nodes.get_node(para.children[0]);
			expect(emph.kind).toBe('strong_emphasis');
			expect(emph.end).toBe(12);
		});

		it('revokes pending node, converts to text', () => {
			const tb = new TreeBuilder(64);
			tb.open(0, NodeKind.root, 0, -1, 0, false);
			tb.open(1, NodeKind.paragraph, 0, 0, 0, false);
			// speculative emphasis that won't close
			tb.open(2, NodeKind.strong_emphasis, 5, 1, 0, true);
			tb.text(2, 6, 11);
			// revoke, emphasis becomes text
			tb.revoke(2);
			tb.close(1, 11);
			tb.close(0, 11);

			const nodes = tb.get_buffer();
			const root = nodes.get_node(0);
			const para = nodes.get_node(root.children[0]);
			// After revoke, the emphasis node should be converted to text
			// and its children reparented to paragraph
			expect(para.children.length).toBeGreaterThan(0);
			const first = nodes.get_node(para.children[0]);
			expect(first.kind).toBe('text');
		});

		it('revokes empty pending node, removes it', () => {
			const tb = new TreeBuilder(64);
			tb.open(0, NodeKind.root, 0, -1, 0, false);
			tb.open(1, NodeKind.paragraph, 0, 0, 0, false);
			// speculative code span with no children
			tb.open(2, NodeKind.code_span, 5, 1, 0, true);
			// revoke empty node
			tb.revoke(2);
			// add real text after
			tb.text(1, 5, 10);
			tb.close(1, 10);
			tb.close(0, 10);

			const nodes = tb.get_buffer();
			const root = nodes.get_node(0);
			const para = nodes.get_node(root.children[0]);
			expect(para.children.length).toBeGreaterThanOrEqual(1);
		});
	});

	describe('sibling ordering', () => {
		it('creates multiple children in order', () => {
			const tb = new TreeBuilder(64);
			tb.open(0, NodeKind.root, 0, -1, 0, false);
			tb.open(1, NodeKind.heading, 0, 0, 1, false);
			tb.text(1, 2, 7);
			tb.close(1, 8);
			tb.open(2, NodeKind.paragraph, 9, 0, 0, false);
			tb.text(2, 9, 20);
			tb.close(2, 20);
			tb.close(0, 20);

			const nodes = tb.get_buffer();
			const root = nodes.get_node(0);
			expect(root.children.length).toBe(2);
			expect(nodes.get_node(root.children[0]).kind).toBe('heading');
			expect(nodes.get_node(root.children[1]).kind).toBe('paragraph');
		});

		it('handles nested inline nodes', () => {
			const tb = new TreeBuilder(64);
			tb.open(0, NodeKind.root, 0, -1, 0, false);
			tb.open(1, NodeKind.paragraph, 0, 0, 0, false);
			tb.text(1, 0, 5); // "hello "
			tb.open(2, NodeKind.strong_emphasis, 5, 1, 0, false);
			tb.text(2, 6, 11); // "world"
			tb.close(2, 12);
			tb.text(1, 12, 13); // "!"
			tb.close(1, 13);
			tb.close(0, 13);

			const nodes = tb.get_buffer();
			const root = nodes.get_node(0);
			const para = nodes.get_node(root.children[0]);
			expect(para.children.length).toBe(3);
			expect(nodes.get_node(para.children[0]).kind).toBe('text');
			expect(nodes.get_node(para.children[1]).kind).toBe('strong_emphasis');
			expect(nodes.get_node(para.children[2]).kind).toBe('text');
		});
	});

	describe('tight list unwrapping', () => {
		it('unwraps paragraphs in tight lists on close', () => {
			const tb = new TreeBuilder(64);
			tb.open(0, NodeKind.root, 0, -1, 0, false);
			tb.open(1, NodeKind.list, 0, 0, 0, false);

			// item 1
			tb.open(2, NodeKind.list_item, 0, 1, 0, false);
			tb.open(3, NodeKind.paragraph, 2, 2, 0, false);
			tb.text(3, 2, 8);
			tb.close(3, 8);
			tb.close(2, 8);

			// item 2
			tb.open(4, NodeKind.list_item, 10, 1, 0, false);
			tb.open(5, NodeKind.paragraph, 12, 4, 0, false);
			tb.text(5, 12, 18);
			tb.close(5, 18);
			tb.close(4, 18);

			// set tight=true before closing list
			tb.attr(1, 'ordered', false);
			tb.attr(1, 'start', 0);
			tb.attr(1, 'tight', true);
			tb.close(1, 18);
			tb.close(0, 18);

			const nodes = tb.get_buffer();
			const root = nodes.get_node(0);
			const list = nodes.get_node(root.children[0]);
			const item1 = nodes.get_node(list.children[0]);

			// Paragraphs should be unwrapped, item's children are text nodes directly
			for (const child_idx of item1.children) {
				const child = nodes.get_node(child_idx);
				expect(child.kind).not.toBe('paragraph');
			}
		});

		it('preserves paragraphs in loose lists', () => {
			const tb = new TreeBuilder(64);
			tb.open(0, NodeKind.root, 0, -1, 0, false);
			tb.open(1, NodeKind.list, 0, 0, 0, false);

			tb.open(2, NodeKind.list_item, 0, 1, 0, false);
			tb.open(3, NodeKind.paragraph, 2, 2, 0, false);
			tb.text(3, 2, 8);
			tb.close(3, 8);
			tb.close(2, 8);

			tb.open(4, NodeKind.list_item, 10, 1, 0, false);
			tb.open(5, NodeKind.paragraph, 12, 4, 0, false);
			tb.text(5, 12, 18);
			tb.close(5, 18);
			tb.close(4, 18);

			tb.attr(1, 'ordered', false);
			tb.attr(1, 'start', 0);
			tb.attr(1, 'tight', false);
			tb.close(1, 18);
			tb.close(0, 18);

			const nodes = tb.get_buffer();
			const root = nodes.get_node(0);
			const list = nodes.get_node(root.children[0]);
			const item1 = nodes.get_node(list.children[0]);

			// Paragraphs should be preserved in loose lists
			const has_paragraph = item1.children.some(
				(idx) => nodes.get_node(idx).kind === 'paragraph'
			);
			expect(has_paragraph).toBe(true);
		});
	});

	describe('code fence content', () => {
		it('sets value range for code fence via text()', () => {
			const tb = new TreeBuilder(64);
			tb.open(0, NodeKind.root, 0, -1, 0, false);
			tb.open(1, NodeKind.code_fence, 0, 0, 3, false);
			tb.attr(1, 'info_start', 3);
			tb.attr(1, 'info_end', 13);
			tb.text(1, 14, 30); // code content as value range
			tb.close(1, 33);
			tb.close(0, 33);

			const nodes = tb.get_buffer();
			const root = nodes.get_node(0);
			const fence = nodes.get_node(root.children[0]);
			expect(fence.kind).toBe('code_fence');
			expect(fence.value).toEqual([14, 30]);
			expect(fence.metadata.info_start).toBe(3);
			expect(fence.metadata.info_end).toBe(13);
			// No child nodes, content is value range
			expect(fence.children).toEqual([]);
		});
	});

	describe('NodeBuffer size', () => {
		it('counts all nodes including text children', () => {
			const tb = new TreeBuilder(64);
			tb.open(0, NodeKind.root, 0, -1, 0, false);
			tb.open(1, NodeKind.paragraph, 0, 0, 0, false);
			tb.text(1, 0, 5); // creates child text node
			tb.close(1, 5);
			tb.close(0, 5);

			const nodes = tb.get_buffer();
			// root (auto) + paragraph + text = 3
			expect(nodes.size).toBe(3);
		});

		it('heading text does not create extra nodes', () => {
			const tb = new TreeBuilder(64);
			tb.open(0, NodeKind.root, 0, -1, 0, false);
			tb.open(1, NodeKind.heading, 0, 0, 1, false);
			tb.text(1, 2, 7); // sets value range, no child node
			tb.close(1, 8);
			tb.close(0, 8);

			const nodes = tb.get_buffer();
			// root (auto) + heading = 2
			expect(nodes.size).toBe(2);
		});
	});
});
