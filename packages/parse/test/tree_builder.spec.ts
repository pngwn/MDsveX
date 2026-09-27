import { describe, it, expect } from 'vitest';
import { PFMParser } from '../src/main';
import type { Emitter } from '../src/opcodes';
import { TreeBuilder } from '../src/tree_builder';
import { NodeBuffer, NodeKind } from '../src/utils';

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

// forwards every opcode to a builder with every non-root id moved by an
// offset, so no id lands on its slot and the builder has to map them
class ShiftedIds implements Emitter {
	constructor(
		private out: Emitter,
		private offset: number
	) {}
	private shift(id: number): number {
		return id <= 0 ? id : id + this.offset;
	}
	open(
		id: number,
		kind: NodeKind,
		start: number,
		parent: number,
		extra: number,
		pending: boolean
	): void {
		this.out.open(
			this.shift(id),
			kind,
			start,
			this.shift(parent),
			extra,
			pending
		);
	}
	close(id: number, end: number): void {
		this.out.close(this.shift(id), end);
	}
	text(parent: number, start: number, end: number): void {
		this.out.text(this.shift(parent), start, end);
	}
	attr(id: number, key: string, value: any): void {
		this.out.attr(this.shift(id), key, value);
	}
	set_value_start(id: number, pos: number): void {
		this.out.set_value_start(this.shift(id), pos);
	}
	set_value_end(id: number, pos: number): void {
		this.out.set_value_end(this.shift(id), pos);
	}
	revoke(id: number, source_text?: string): void {
		this.out.revoke(this.shift(id), source_text);
	}
	commit(id: number): void {
		this.out.commit(this.shift(id));
	}
	cursor(pos: number): void {
		this.out.cursor(pos);
	}
}

function dump(nodes: NodeBuffer, index = 0): unknown {
	const node = nodes.get_node(index);
	return {
		kind: node.kind,
		start: node.start,
		end: node.end,
		value: node.value,
		metadata: node.metadata,
		pending: nodes._pending_nodes[index],
		children: node.children.map((child) => dump(nodes, child)),
	};
}

describe('TreeBuilder ids as indices', () => {
	const docs = [
		'| a | b |\n| - | - |\n| x | |\n\nafter *the* table\n',
		'<div>\nunclosed html block\n\n- item *one*\n- item two\n\npara `code` end\n',
		'- tight\n- list\n\n1. loose\n\n2. list\n\n> quote **strong\n',
		'text with snake_case and *unclosed emphasis\n\n| h |\n| - |\n| c |\n',
		'<span>inline <b>open\n\n# heading {x}\n\n```js\ncode\n```\n',
	];

	for (const doc of docs) {
		it(`builds the same tree with ids as slots and with a map: ${JSON.stringify(doc)}`, () => {
			const direct = new TreeBuilder(8);
			new PFMParser(direct).parse(doc);
			const mapped = new TreeBuilder(8);
			new PFMParser(new ShiftedIds(mapped, 1000)).parse(doc);
			expect(dump(direct.get_buffer())).toEqual(dump(mapped.get_buffer()));
		});
	}

	it('keeps ids equal to slots, so the builder never needs its id map', () => {
		for (const doc of docs) {
			const tb = new TreeBuilder(8);
			new PFMParser(tb).parse(doc);
			expect((tb as unknown as { id_to_index: unknown }).id_to_index).toBe(
				null
			);
		}
	});
});

describe('parser id tables', () => {
	const docs = [
		'- tight\n- list\n\n1. loose\n\n2. list\n\n> quote **strong\n',
		'<div>\nunclosed html block\n\n- item *one*\n- item two\n\npara `code` end\n',
		'text *a* _b_ ~~c~~ [link](x) ![img](y) <span>open\n\n| h | i |\n| - | - |\n| c | d |\n'.repeat(
			40
		),
	];

	function parse_whole(doc: string): unknown {
		const tb = new TreeBuilder(8);
		new PFMParser(tb).parse(doc);
		return dump(tb.get_buffer());
	}

	it('keeps interleaved incremental parsers apart', () => {
		const expected = docs.map(parse_whole);
		const builders = docs.map(() => new TreeBuilder(8));
		const parsers = builders.map((tb) => new PFMParser(tb));
		for (const p of parsers) p.init();
		const longest = Math.max(...docs.map((d) => d.length));
		for (let at = 0; at < longest; at += 7) {
			for (let i = 0; i < docs.length; i++) {
				const chunk = docs[i].slice(at, at + 7);
				if (chunk.length > 0) parsers[i].feed(chunk);
			}
		}
		for (const p of parsers) p.finish();
		builders.forEach((tb, i) =>
			expect(dump(tb.get_buffer())).toEqual(expected[i])
		);
	});

	it('gives the same trees when one parser is reused across documents', () => {
		const expected = docs.map(parse_whole);
		const tb = new TreeBuilder(8);
		const parser = new PFMParser(tb);
		for (const order of [
			[2, 0, 1],
			[0, 2, 1, 0],
		]) {
			for (const i of order) {
				tb.reset();
				parser.parse(docs[i]);
				expect(dump(tb.get_buffer())).toEqual(expected[i]);
			}
		}
	});
});
