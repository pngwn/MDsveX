import { describe, it, expect } from 'vitest';
import { PFMParser, WireEmitter } from '@mdsvex/parse';
import { TreeBuilder } from '@mdsvex/parse/tree-builder';
import { WireTreeBuilder } from '@mdsvex/parse/wire-tree-builder';
import { ComponentRenderer } from '../src/component';

//  Helpers

function parse_to_buf(source: string) {
	const tree = new TreeBuilder(source.length >> 3 || 128);
	const parser = new PFMParser(tree);
	parser.parse(source);
	return { buf: tree.get_buffer(), source };
}

//  ComponentRenderer

describe('ComponentRenderer', () => {
	it('produces blocks with buffer indices', () => {
		const { buf, source } = parse_to_buf('# Hello\n\nworld\n');
		const renderer = new ComponentRenderer();
		renderer.update(buf, source);

		expect(renderer.blocks.length).toBe(2);
		// Verify the indices point to real nodes
		expect(buf.kind_at(renderer.blocks[0].idx)).toBe(3); // heading
		expect(buf.kind_at(renderer.blocks[1].idx)).toBe(7); // paragraph
	});

	it('each block has a unique idx', () => {
		const { buf, source } = parse_to_buf('# Hello\n\nworld\n');
		const renderer = new ComponentRenderer();
		renderer.update(buf, source);

		expect(renderer.blocks[0].idx).not.toBe(renderer.blocks[1].idx);
	});

	it('blocks have version 0 on first update', () => {
		const { buf, source } = parse_to_buf('# Hello\n');
		const renderer = new ComponentRenderer();
		renderer.update(buf, source);

		expect(renderer.blocks[0].v).toBe(0);
	});

	it('skips line_break nodes', () => {
		const { buf, source } = parse_to_buf('# Hello\n\nworld\n');
		const renderer = new ComponentRenderer();
		renderer.update(buf, source);

		for (const block of renderer.blocks) {
			expect(buf.kind_at(block.idx)).not.toBe(6); // line_break
		}
	});

	it('incremental: closed blocks stop version bumping', () => {
		const tree = new TreeBuilder(128);
		const parser = new PFMParser(tree);
		const renderer = new ComponentRenderer();

		parser.init();

		parser.feed('# First\n\n');
		renderer.update(tree.get_buffer(), '# First\n\n');
		const heading_v = renderer.blocks[0]?.v;

		parser.feed('second\n');
		parser.finish();
		renderer.update(tree.get_buffer(), '# First\n\nsecond\n');

		expect(renderer.blocks[0].v).toBe(heading_v);
		expect(renderer.blocks.length).toBe(2);
	});

	it('incremental: open blocks bump version', () => {
		const tree = new TreeBuilder(128);
		const parser = new PFMParser(tree);
		const renderer = new ComponentRenderer();

		parser.init();

		parser.feed('hel');
		renderer.update(tree.get_buffer(), 'hel');
		const v1 = renderer.blocks[0]?.v ?? -1;

		parser.feed('lo\n');
		renderer.update(tree.get_buffer(), 'hello\n');

		expect(renderer.blocks[0].v).toBeGreaterThan(v1);
	});

	it('returns new array reference on change', () => {
		const { buf, source } = parse_to_buf('hello\n');
		const renderer = new ComponentRenderer();
		const first = renderer.update(buf, source);
		const second = renderer.update(buf, source);

		// Second update with same closed doc, no change, same reference
		expect(second).toBe(first);
	});

	it('reset clears all state', () => {
		const { buf, source } = parse_to_buf('hello\n');
		const renderer = new ComponentRenderer();
		renderer.update(buf, source);
		expect(renderer.blocks.length).toBe(1);

		renderer.reset();
		expect(renderer.blocks.length).toBe(0);
	});

	it('stores buffer and source references', () => {
		const { buf, source } = parse_to_buf('# Title\n');
		const renderer = new ComponentRenderer();
		renderer.update(buf, source);

		expect(renderer.buf).toBe(buf);
		expect(renderer.source).toBe(source);
	});

	it('incremental: a block follows the node that took the place of a guess', () => {
		const source = 'One.\n\n<Metronome />\n\nTwo.\n';
		const tree = new TreeBuilder(128);
		const parser = new PFMParser(tree);
		const renderer = new ComponentRenderer();
		parser.init();

		let guess = -1;
		let drawn: { idx: number; v: number } | undefined;
		for (let i = 0; i <= source.length; i++) {
			if (i < source.length) parser.feed(source[i]);
			else parser.finish();
			const buf = tree.get_buffer();
			renderer.update(buf, source.slice(0, i + 1));

			const children: number[] = [];
			for (
				let child = buf.first_child_at(0);
				child !== 0xffffffff && buf.parent_at(child) === 0;
				child = buf.next_at(child)
			) {
				if (buf.kind_at(child) !== 6) children.push(child);
			}
			expect(
				renderer.blocks.map((b) => b.idx),
				String(i)
			).toEqual(children);

			// the paragraph the parser opens at the end of the tag
			if (source[i] === '>') guess = renderer.blocks[1].idx;
			// the html node that replaced it gets an entry of its own, so it draws
			if (source[i] === '\n' && source[i - 1] === '\n' && guess !== -1) {
				drawn ??= renderer.blocks[1];
			}
		}

		expect(tree.get_buffer().kind_at(guess)).toBe(7);
		expect(drawn!.idx).not.toBe(guess);
		expect(tree.get_buffer().kind_at(renderer.blocks[1].idx)).toBe(2);
		// closed since, its version is frozen
		expect(renderer.blocks[1].v).toBe(drawn!.v);
	});

	it('incremental: blocks the tree no longer has are dropped', () => {
		const tree = new TreeBuilder(128);
		const parser = new PFMParser(tree);
		const renderer = new ComponentRenderer();
		parser.init();
		parser.feed('one\n\ntwo\n');
		renderer.update(tree.get_buffer(), 'one\n\ntwo\n');
		expect(renderer.blocks.length).toBe(2);

		const other = new TreeBuilder(128);
		new PFMParser(other).parse('one\n');
		const blocks = renderer.update(other.get_buffer(), 'one\n');
		expect(blocks.length).toBe(1);
	});
});
