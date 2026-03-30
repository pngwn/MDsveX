import { describe, it, expect } from 'vitest';
import { PFMParser, WireEmitter, PFMDocument } from '@mdsvex/parse';
import { ComponentRenderer } from '../src/component';

// ── Helpers ──────────────────────────────────────────────────

function parse_to_doc(source: string): PFMDocument {
	const emitter = new WireEmitter();
	emitter.set_source(source);
	const parser = new PFMParser(emitter);
	parser.parse(source);
	const batch = emitter.flush();

	const doc = new PFMDocument();
	doc.apply(batch);
	return doc;
}

// ── ComponentRenderer ────────────────────────────────────────

describe('ComponentRenderer', () => {
	it('produces blocks with node references', () => {
		const doc = parse_to_doc('# Hello\n\nworld\n');
		const renderer = new ComponentRenderer();
		renderer.update(doc);

		expect(renderer.blocks.length).toBe(2);
		expect(renderer.blocks[0].node.kindName).toBe('heading');
		expect(renderer.blocks[1].node.kindName).toBe('paragraph');
	});

	it('each block has a unique id', () => {
		const doc = parse_to_doc('# Hello\n\nworld\n');
		const renderer = new ComponentRenderer();
		renderer.update(doc);

		expect(renderer.blocks[0].id).not.toBe(renderer.blocks[1].id);
	});

	it('blocks have version 0 on first update', () => {
		const doc = parse_to_doc('# Hello\n');
		const renderer = new ComponentRenderer();
		renderer.update(doc);

		expect(renderer.blocks[0].v).toBe(0);
	});

	it('skips line_break nodes', () => {
		const doc = parse_to_doc('# Hello\n\nworld\n');
		const renderer = new ComponentRenderer();
		renderer.update(doc);

		// Should only have heading + paragraph, no line_break blocks
		for (const block of renderer.blocks) {
			expect(block.node.kindName).not.toBe('line_break');
		}
	});

	it('incremental: closed blocks stop version bumping', () => {
		const emitter = new WireEmitter();
		const parser = new PFMParser(emitter);
		const doc = new PFMDocument();
		const renderer = new ComponentRenderer();

		parser.init();
		let acc = '';

		// Feed enough to close the heading
		const chunk1 = '# First\n\n';
		acc += chunk1;
		emitter.set_source(acc);
		parser.feed(chunk1);
		let batch = emitter.flush();
		if (batch.length) doc.apply(batch);
		renderer.update(doc);

		const heading_v = renderer.blocks[0]?.v;

		// Feed more content
		const chunk2 = 'second\n';
		acc += chunk2;
		emitter.set_source(acc);
		parser.feed(chunk2);
		batch = emitter.flush();
		if (batch.length) doc.apply(batch);

		emitter.set_source(acc);
		parser.finish();
		batch = emitter.flush();
		if (batch.length) doc.apply(batch);
		renderer.update(doc);

		// Heading block version should be frozen (closed)
		expect(renderer.blocks[0].v).toBe(heading_v);
		expect(renderer.blocks.length).toBe(2);
	});

	it('incremental: open blocks bump version', () => {
		const emitter = new WireEmitter();
		const parser = new PFMParser(emitter);
		const doc = new PFMDocument();
		const renderer = new ComponentRenderer();

		parser.init();
		let acc = '';

		// Feed partial paragraph
		const chunk1 = 'hel';
		acc += chunk1;
		emitter.set_source(acc);
		parser.feed(chunk1);
		let batch = emitter.flush();
		if (batch.length) doc.apply(batch);
		renderer.update(doc);

		const v1 = renderer.blocks[0]?.v ?? -1;

		// Feed more
		const chunk2 = 'lo\n';
		acc += chunk2;
		emitter.set_source(acc);
		parser.feed(chunk2);
		batch = emitter.flush();
		if (batch.length) doc.apply(batch);
		renderer.update(doc);

		// Version should have bumped
		expect(renderer.blocks[0].v).toBeGreaterThan(v1);
	});

	it('returns new array reference on change', () => {
		const doc = parse_to_doc('hello\n');
		const renderer = new ComponentRenderer();
		const first = renderer.update(doc);
		const second = renderer.update(doc);

		// Second update with same closed doc — no change, same reference
		expect(second).toBe(first);
	});

	it('reset clears all state', () => {
		const doc = parse_to_doc('hello\n');
		const renderer = new ComponentRenderer();
		renderer.update(doc);
		expect(renderer.blocks.length).toBe(1);

		renderer.reset();
		expect(renderer.blocks.length).toBe(0);
	});

	it('node references are the actual PFMDocument nodes', () => {
		const doc = parse_to_doc('# Title\n');
		const renderer = new ComponentRenderer();
		renderer.update(doc);

		// The node in the block should be the same reference as in the doc
		const block_node = renderer.blocks[0].node;
		expect(block_node).toBe(doc.root!.content.find(c => typeof c !== 'string'));
	});
});
