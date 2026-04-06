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
		expect(buf._kinds[renderer.blocks[0].idx]).toBe(3); // heading
		expect(buf._kinds[renderer.blocks[1].idx]).toBe(7); // paragraph
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
			expect(buf._kinds[block.idx]).not.toBe(6); // line_break
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
});
