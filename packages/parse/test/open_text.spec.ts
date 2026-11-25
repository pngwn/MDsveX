import { describe, it, expect } from 'vitest';
import { PFMParser, NodeKind } from '../src/main';
import { TreeBuilder } from '../src/tree_builder';
import { NodeField } from '../src/utils';

const STRIDE = NodeField.stride;

/** the value of each leaf of the given kinds that has one, in document order */
function values(tree: TreeBuilder, source: string, kinds: number[]): string[] {
	const buf = tree.get_buffer();
	const n = buf._n;
	const out: string[] = [];
	for (let i = 0; i < buf._size; i++) {
		const b = i * STRIDE;
		if (!kinds.includes(n[b] & 0xff)) continue;
		const start = n[b + NodeField.value_start];
		const end = n[b + NodeField.value_end];
		if (end > start) out.push(source.slice(start, end));
	}
	return out;
}

function fed(source: string): TreeBuilder {
	const tree = new TreeBuilder(64);
	const parser = new PFMParser(tree);
	parser.init();
	parser.feed(source);
	return tree;
}

const TEXT = [NodeKind.text];

describe('show_open_text', () => {
	it('shows the text of a line that has not ended', () => {
		const source = 'The slow part';
		const tree = fed(source);
		expect(values(tree, source, TEXT)).toEqual([]);
		expect(tree.show_open_text(source)).toBe(true);
		expect(values(tree, source, TEXT)).toEqual(['The slow part']);
	});

	it('shows the text of a heading and of an open mark', () => {
		const heading = '# The C';
		const a = fed(heading);
		a.show_open_text(heading);
		expect(values(a, heading, TEXT)).toEqual(['The C']);

		const mark = 'a *b';
		const b = fed(mark);
		b.show_open_text(mark);
		expect(values(b, mark, TEXT)).toEqual(['a ', 'b']);
	});

	it('leaves out the spaces the parser would trim', () => {
		const source = 'one two  ';
		const tree = fed(source);
		tree.show_open_text(source);
		expect(values(tree, source, TEXT)).toEqual(['one two']);
	});

	it('shows a code fence up to the end of the source', () => {
		const source = '```js\nconst a = 1;\nconst b';
		const tree = fed(source);
		tree.show_open_text(source);
		expect(values(tree, source, [NodeKind.code_fence])).toEqual([
			'const a = 1;\nconst b',
		]);
	});

	it('holds a last fence line that may be the closing fence', () => {
		const source = '```js\nconst a = 1;\n``';
		const tree = fed(source);
		tree.show_open_text(source);
		expect(values(tree, source, [NodeKind.code_fence])).toEqual([
			'const a = 1;\n',
		]);
	});

	it('shows nothing of a fence whose info line has not ended', () => {
		const source = '```js';
		const tree = fed(source);
		expect(tree.show_open_text(source)).toBe(false);
	});

	it('changes nothing when every line has ended', () => {
		const source = 'one\n\ntwo\n\n';
		const tree = fed(source);
		const before = tree
			.get_buffer()
			._n.slice(0, tree.get_buffer()._size * STRIDE);
		expect(tree.show_open_text(source)).toBe(false);
		expect(
			tree.get_buffer()._n.slice(0, tree.get_buffer()._size * STRIDE)
		).toEqual(before);
	});
});

describe('hide_open_text', () => {
	const doc =
		'# Title *here*\n\nSome `code` and **strong** text\nover two lines.\n\n' +
		'- one\n- two `x`\n\n```ts\nconst a = `b`;\n```\n\n' +
		'| a | b |\n| - | - |\n| 1 | *2* |\n\n> quote <!-- note --> end\n';

	for (const size of [1, 2, 5, 13]) {
		it(`leaves the tree of a feed of ${size} as it was`, () => {
			const plain = new TreeBuilder(64);
			const plain_parser = new PFMParser(plain);
			plain_parser.init();
			const shown = new TreeBuilder(64);
			const shown_parser = new PFMParser(shown);
			shown_parser.init();
			for (let at = 0; at < doc.length; at += size) {
				const chunk = doc.slice(at, at + size);
				plain_parser.feed(chunk);
				shown.hide_open_text();
				shown_parser.feed(chunk);
				shown.show_open_text(doc.slice(0, at + size));
			}
			plain_parser.finish();
			shown.hide_open_text();
			shown_parser.finish();
			const a = plain.get_buffer();
			const b = shown.get_buffer();
			expect(b._size).toBe(a._size);
			expect(Array.from(b._n.slice(0, b._size * STRIDE))).toEqual(
				Array.from(a._n.slice(0, a._size * STRIDE))
			);
		});
	}
});
