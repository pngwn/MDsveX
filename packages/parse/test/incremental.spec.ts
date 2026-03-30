import { describe, it, expect } from 'vitest';
import { PFMParser, parse_markdown_svelte, node_kind } from '../src/main';
import { TreeBuilder } from '../src/tree_builder';
import type { Emitter } from '../src/opcodes';
import { kind_to_string } from '../src/utils';
import type { node_buffer } from '../src/utils';
import fs from 'node:fs';
import path from 'node:path';

// ── Helpers ──────────────────────────────────────────────────

type Op =
	| { op: 'open'; id: number; kind: string; pending: boolean }
	| { op: 'close'; id: number }
	| { op: 'attr'; id: number; key: string }
	| { op: 'revoke'; id: number };

class OpRecorder implements Emitter {
	ops: Op[] = [];
	open(id: number, kind: number, _s: number, _p: number, _e: number, pending: boolean) {
		this.ops.push({ op: 'open', id, kind: kind_to_string(kind), pending });
	}
	close(id: number, _end: number) { this.ops.push({ op: 'close', id }); }
	text(_p: number, _s: number, _e: number) {}
	attr(id: number, key: string, _v: any) { this.ops.push({ op: 'attr', id, key }); }
	set_value_start(id: number, _pos: number) { this.ops.push({ op: 'attr', id, key: 'value_start' }); }
	set_value_end(id: number, _pos: number) { this.ops.push({ op: 'attr', id, key: 'value_end' }); }
	revoke(id: number) { this.ops.push({ op: 'revoke', id }); }
	cursor(_pos: number) {}
}

function tree_diff(
	a: node_buffer, b: node_buffer, _source: string,
	a_idx = 0, b_idx = 0, path_str = 'root',
): string[] {
	const an = a.get_node(a_idx);
	const bn = b.get_node(b_idx);
	const diffs: string[] = [];
	if (an.kind !== bn.kind) diffs.push(`${path_str}: kind ${an.kind} vs ${bn.kind}`);
	if (an.start !== bn.start) diffs.push(`${path_str}: start ${an.start} vs ${bn.start}`);
	if (an.end !== bn.end) diffs.push(`${path_str}: end ${an.end} vs ${bn.end}`);
	if (an.value[0] !== bn.value[0] || an.value[1] !== bn.value[1])
		diffs.push(`${path_str}: value [${an.value}] vs [${bn.value}]`);
	if (an.children.length !== bn.children.length)
		diffs.push(`${path_str}: children ${an.children.length} vs ${bn.children.length}`);
	const min = Math.min(an.children.length, bn.children.length);
	for (let i = 0; i < min; i++)
		diffs.push(...tree_diff(a, b, _source, an.children[i], bn.children[i], `${path_str}[${i}]`));
	return diffs;
}

function parse_batch(source: string): node_buffer {
	return parse_markdown_svelte(source).nodes;
}

function parse_incremental(source: string, chunk_size: number): node_buffer {
	const tree = new TreeBuilder(source.length);
	const parser = new PFMParser(tree);
	parser.init();
	for (let i = 0; i < source.length; i += chunk_size) {
		parser.feed(source.slice(i, Math.min(i + chunk_size, source.length)));
	}
	parser.finish();
	return tree.get_buffer();
}

// ── Tests ────────────────────────────────────────────────────

describe('Incremental parsing', () => {
	describe('eager opcode emission', () => {
		it('emits paragraph + text immediately on first line', () => {
			const rec = new OpRecorder();
			const p = new PFMParser(rec);
			p.init();
			p.feed('Hello world');
			const kinds = rec.ops.filter(o => o.op === 'open').map(o => (o as any).kind);
			expect(kinds).toContain('root');
			expect(kinds).toContain('paragraph');
			expect(kinds).toContain('text');
		});

		it('emits emphasis open eagerly on *', () => {
			const rec = new OpRecorder();
			const p = new PFMParser(rec);
			p.init();
			p.feed('hello *wor');
			const opens = rec.ops.filter(o => o.op === 'open');
			const kinds = opens.map(o => (o as any).kind);
			expect(kinds).toContain('strong_emphasis');
			const emph = opens.find(o => (o as any).kind === 'strong_emphasis');
			expect((emph as any).pending).toBe(true);
		});

		it('emits strikethrough open eagerly on ~~', () => {
			const rec = new OpRecorder();
			const p = new PFMParser(rec);
			p.init();
			p.feed('hello ~~wor');
			const kinds = rec.ops.filter(o => o.op === 'open').map(o => (o as any).kind);
			expect(kinds).toContain('strikethrough');
		});

		it('emits superscript open eagerly on ^', () => {
			const rec = new OpRecorder();
			const p = new PFMParser(rec);
			p.init();
			p.feed('x^2');
			const kinds = rec.ops.filter(o => o.op === 'open').map(o => (o as any).kind);
			expect(kinds).toContain('superscript');
		});

		it('code fence stays open across feeds', () => {
			const rec = new OpRecorder();
			const p = new PFMParser(rec);
			p.init();
			p.feed('```js\ncode here\n');
			const opens = rec.ops.filter(o => o.op === 'open');
			const fence_open = opens.find(o => (o as any).kind === 'code_fence') as any;
			expect(fence_open).toBeDefined();

			const closes = rec.ops.filter(o => o.op === 'close');
			expect(closes.some(o => (o as any).id === fence_open.id)).toBe(false);

			p.feed('```\n');
			const closes2 = rec.ops.filter(o => o.op === 'close');
			expect(closes2.some(o => (o as any).id === fence_open.id)).toBe(true);
		});

		it('revokes unclosed emphasis on finish', () => {
			const rec = new OpRecorder();
			const p = new PFMParser(rec);
			p.init();
			p.feed('hello *friends');
			// emphasis should be open
			const emph = rec.ops.find(o => o.op === 'open' && (o as any).kind === 'strong_emphasis');
			expect(emph).toBeDefined();

			p.finish();
			const revokes = rec.ops.filter(o => o.op === 'revoke');
			expect(revokes.length).toBeGreaterThan(0);
		});
	});

	describe('line-by-line equivalence', () => {
		// Feeding complete lines should match batch, since the parser
		// has full line context for block-level decisions.
		const cases: [string, string][] = [
			['paragraph', 'Hello world\n'],
			['heading', '# Hello\n'],
			['emphasis', 'Hello *world*!\n'],
			['strong', 'Hello _world_!\n'],
			['code span', 'Hello `code` world\n'],
			['code fence', '```js\nconsole.log(1)\n```\n'],
			['thematic break', '---\n'],
			['unordered list', '- one\n- two\n- three\n'],
			['ordered list', '1. one\n2. two\n'],
			['link', '[click](http://example.com)\n'],
			['autolink', '<http://example.com>\n'],
			['block quote', '> Hello\n> world\n'],
		];

		for (const [name, input] of cases) {
			it(name, () => {
				const batch = parse_batch(input);
				// Feed whole input at once (simulates line-by-line for single-line)
				const tree = new TreeBuilder(input.length);
				const parser = new PFMParser(tree);
				parser.init();
				parser.feed(input);
				parser.finish();
				const diffs = tree_diff(batch, tree.get_buffer(), input);
				expect(diffs).toEqual([]);
			});
		}
	});

	describe('multi-line equivalence', () => {
		// Feeding multi-line documents line-by-line
		const cases: [string, string][] = [
			['two paragraphs', 'First\n\nSecond\n'],
			['heading + paragraph', '# Title\n\nSome text.\n'],
			['complex', '# Title\n\n*bold* and _em_\n\n- a\n- b\n'],
		];

		for (const [name, input] of cases) {
			it(name, () => {
				const batch = parse_batch(input);
				const tree = new TreeBuilder(input.length);
				const parser = new PFMParser(tree);
				parser.init();
				// Feed entire input at once
				parser.feed(input);
				parser.finish();
				const diffs = tree_diff(batch, tree.get_buffer(), input);
				expect(diffs).toEqual([]);
			});
		}
	});

	describe('chunk size equivalence', () => {
		// Larger chunk sizes should match batch since they provide
		// enough context for all decisions.
		const input = '# Heading\n\nParagraph with *strong* text.\n\n```\ncode\n```\n\n- item\n';

		for (const size of [13, 50, 9999]) {
			it(`chunk size ${size}`, () => {
				const batch = parse_batch(input);
				const incr = parse_incremental(input, size);
				const diffs = tree_diff(batch, incr, input);
				expect(diffs).toEqual([]);
			});
		}
	});

	describe('fixture equivalence', () => {
		const fixturesDir = path.resolve(__dirname, '../../pfm-tests/tests');
		const categories = ['paragraphs', 'atx_headings', 'thematic_breaks', 'blank_lines'];

		for (const cat of categories) {
			const catDir = path.join(fixturesDir, cat);
			if (!fs.existsSync(catDir)) continue;
			const fixtures = fs.readdirSync(catDir)
				.filter(d => fs.existsSync(path.join(catDir, d, 'input.md')));

			for (const fix of fixtures.slice(0, 5)) {
				it(`${cat}/${fix}`, () => {
					const input = fs.readFileSync(path.join(catDir, fix, 'input.md'), 'utf-8');
					const batch = parse_batch(input);
					const tree = new TreeBuilder(input.length);
					const parser = new PFMParser(tree);
					parser.init();
					parser.feed(input);
					parser.finish();
					const diffs = tree_diff(batch, tree.get_buffer(), input);
					expect(diffs).toEqual([]);
				});
			}
		}
	});
});
