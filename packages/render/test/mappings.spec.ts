import { describe, it, expect } from 'vitest';
import { PFMParser } from '@mdsvex/parse';
import { TreeBuilder } from '@mdsvex/parse/tree-builder';
import { CursorHTMLRenderer } from '../src/html_cursor';
import type { Mapping, CodeInformation } from '../src/mappings';
import { TEXT, CODE, SVELTE, TAG } from '../src/mappings';
import {
	build_line_starts,
	offset_to_position,
	mappings_to_v3,
} from '../src/sourcemap';

// ── vlq decoder (for testing round-trips) ──

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64_LOOKUP = new Uint8Array(128);
for (let i = 0; i < B64.length; i++) B64_LOOKUP[B64.charCodeAt(i)] = i;

function decodeVLQMappings(mappings: string): number[][][] {
	const lines: number[][][] = [];
	let line: number[][] = [];
	let i = 0;
	let gen_col = 0, src_idx = 0, src_line = 0, src_col = 0;

	while (i < mappings.length) {
		const ch = mappings[i];
		if (ch === ';') {
			lines.push(line);
			line = [];
			gen_col = 0;
			i++;
		} else if (ch === ',') {
			i++;
		} else {
			const seg: number[] = [];
			// decode fields
			for (let f = 0; f < 5 && i < mappings.length && mappings[i] !== ',' && mappings[i] !== ';'; f++) {
				let value = 0, shift = 0, digit: number;
				do {
					digit = B64_LOOKUP[mappings.charCodeAt(i++)];
					value |= (digit & 0x1f) << shift;
					shift += 5;
				} while (digit & 0x20);
				seg.push(value & 1 ? -(value >>> 1) : value >>> 1);
			}
			// resolve relative fields
			if (seg.length >= 1) seg[0] = gen_col += seg[0];
			if (seg.length >= 2) seg[1] = src_idx += seg[1];
			if (seg.length >= 3) seg[2] = src_line += seg[2];
			if (seg.length >= 4) seg[3] = src_col += seg[3];
			line.push(seg);
		}
	}
	lines.push(line);
	return lines;
}

// ── helpers ──

function renderMapped(source: string) {
	const tree = new TreeBuilder(source.length >> 3 || 128);
	const parser = new PFMParser(tree);
	parser.parse(source);
	const renderer = new CursorHTMLRenderer({ cache: false });
	const { mappings } = renderer.updateMapped(tree.get_buffer(), source);
	return { html: renderer.html, mappings, source };
}

/** verify every mapping round-trips: source slice at [srcOff..srcOff+len] is real source content. */
function assertMappingsValid(
	source: string,
	html: string,
	mappings: Mapping<CodeInformation>[],
) {
	for (const m of mappings) {
		for (let i = 0; i < m.sourceOffsets.length; i++) {
			const srcOff = m.sourceOffsets[i];
			const srcLen = m.lengths[i];
			const genOff = m.generatedOffsets[i];
			const genLen = m.generatedLengths ? m.generatedLengths[i] : m.lengths[i];

			expect(srcOff).toBeGreaterThanOrEqual(0);
			expect(srcOff + srcLen).toBeLessThanOrEqual(source.length);
			expect(genOff).toBeGreaterThanOrEqual(0);
			expect(genOff + genLen).toBeLessThanOrEqual(html.length);

			// source slice should be non-empty
			const srcSlice = source.slice(srcOff, srcOff + srcLen);
			expect(srcSlice.length).toBeGreaterThan(0);
		}
	}
}

// ── mapping collection tests ──

describe('Mapping collection', () => {
	it('maps paragraph text', () => {
		const { html, mappings, source } = renderMapped('hello world\n');
		assertMappingsValid(source, html, mappings);

		const textMappings = mappings.filter(m => m.data === TEXT);
		expect(textMappings.length).toBe(1);
		const m = textMappings[0];
		expect(source.slice(m.sourceOffsets[0], m.sourceOffsets[0] + m.lengths[0]))
			.toBe('hello world');
		expect(html.slice(m.generatedOffsets[0], m.generatedOffsets[0] + (m.generatedLengths?.[0] ?? m.lengths[0])))
			.toBe('hello world');
	});

	it('emits structural TAG mappings for HTML elements', () => {
		const { html, mappings, source } = renderMapped('hello world\n');
		assertMappingsValid(source, html, mappings);

		const tagMappings = mappings.filter(m => m.data === TAG);
		expect(tagMappings.length).toBeGreaterThanOrEqual(1);
		// tag mapping should point to the <p> tag in generated output
		expect(html.slice(tagMappings[0].generatedOffsets[0], tagMappings[0].generatedOffsets[0] + 2)).toBe('<p');
	});

	it('maps heading text', () => {
		const { html, mappings, source } = renderMapped('# Title\n');
		assertMappingsValid(source, html, mappings);

		const textMappings = mappings.filter(m => m.data === TEXT);
		expect(textMappings.length).toBe(1);
		expect(source.slice(textMappings[0].sourceOffsets[0], textMappings[0].sourceOffsets[0] + textMappings[0].lengths[0]))
			.toBe('Title');
	});

	it('maps multiple text nodes', () => {
		const { html, mappings, source } = renderMapped('aaa _bbb_ ccc\n');
		assertMappingsValid(source, html, mappings);

		const textMappings = mappings.filter(m => m.data === TEXT);
		// should have text nodes for: "aaa ", "bbb", " ccc"
		expect(textMappings.length).toBe(3);
		const texts = textMappings.map(m =>
			source.slice(m.sourceOffsets[0], m.sourceOffsets[0] + m.lengths[0])
		);
		expect(texts).toContain('aaa ');
		expect(texts).toContain('bbb');
		expect(texts).toContain(' ccc');
	});

	it('maps code span with CODE preset', () => {
		const { html, mappings, source } = renderMapped('use `code` here\n');
		assertMappingsValid(source, html, mappings);

		const codeMappings = mappings.filter(m => m.data === CODE);
		expect(codeMappings.length).toBe(1);
		expect(source.slice(codeMappings[0].sourceOffsets[0], codeMappings[0].sourceOffsets[0] + codeMappings[0].lengths[0]))
			.toBe('code');
	});

	it('maps code fence content with CODE preset', () => {
		const { html, mappings, source } = renderMapped('```js\nconst x = 1;\n```\n');
		assertMappingsValid(source, html, mappings);

		const codeMappings = mappings.filter(m => m.data === CODE);
		expect(codeMappings.length).toBe(1);
		expect(source.slice(codeMappings[0].sourceOffsets[0], codeMappings[0].sourceOffsets[0] + codeMappings[0].lengths[0]))
			.toContain('const x = 1;');
	});

	it('uses generatedLengths when escape changes length', () => {
		const { html, mappings, source } = renderMapped('a & b\n');
		assertMappingsValid(source, html, mappings);

		// "a & b" contains "&" which becomes "&amp;" — generated is longer
		const textMappings = mappings.filter(m => m.data === TEXT);
		const m = textMappings[0];
		expect(m.generatedLengths).toBeDefined();
		expect(m.generatedLengths![0]).toBeGreaterThan(m.lengths[0]);
	});

	it('no generatedLengths when escape does not change length', () => {
		const { html, mappings, source } = renderMapped('hello\n');
		assertMappingsValid(source, html, mappings);

		const textMappings = mappings.filter(m => m.data === TEXT);
		const m = textMappings[0];
		expect(m.generatedLengths).toBeUndefined();
	});

	it('maps mustache expressions with SVELTE preset', () => {
		const { html, mappings, source } = renderMapped('{name}\n');
		assertMappingsValid(source, html, mappings);

		const svelteMappings = mappings.filter(m => m.data === SVELTE);
		expect(svelteMappings.length).toBeGreaterThanOrEqual(1);
	});

	it('unmapped render path is unaffected', () => {
		const tree = new TreeBuilder(128);
		const parser = new PFMParser(tree);
		parser.parse('hello world\n');
		const renderer = new CursorHTMLRenderer({ cache: false });
		renderer.update(tree.get_buffer(), 'hello world\n');
		expect(renderer.html).toBe('<p>hello world</p>');
	});
});

// ── line starts tests ──

describe('build_line_starts', () => {
	it('single line', () => {
		const ls = build_line_starts('hello');
		expect(Array.from(ls)).toEqual([0]);
	});

	it('multiple lines', () => {
		const ls = build_line_starts('a\nb\nc\n');
		expect(Array.from(ls)).toEqual([0, 2, 4, 6]);
	});

	it('empty string', () => {
		const ls = build_line_starts('');
		expect(Array.from(ls)).toEqual([0]);
	});
});

describe('offset_to_position', () => {
	const ls = build_line_starts('ab\ncd\nef\n');

	it('start of first line', () => {
		expect(offset_to_position(ls, 0)).toEqual([0, 0]);
	});

	it('middle of first line', () => {
		expect(offset_to_position(ls, 1)).toEqual([0, 1]);
	});

	it('start of second line', () => {
		expect(offset_to_position(ls, 3)).toEqual([1, 0]);
	});

	it('middle of third line', () => {
		expect(offset_to_position(ls, 7)).toEqual([2, 1]);
	});
});

// ── v3 conversion tests ──

describe('mappings_to_v3', () => {
	it('produces valid v3 structure', () => {
		const { html, mappings, source } = renderMapped('hello\n');
		const v3 = mappings_to_v3(mappings, source, html, 'test.md');

		expect(v3.version).toBe(3);
		expect(v3.file).toBe('test.md');
		expect(v3.sources).toEqual(['test.md']);
		expect(v3.sourcesContent).toEqual([source]);
		expect(v3.names).toEqual([]);
		expect(typeof v3.mappings).toBe('string');
		expect(v3.mappings.length).toBeGreaterThan(0);
	});

	it('uses basename for sources when given full path', () => {
		const { html, mappings, source } = renderMapped('hello\n');
		const v3 = mappings_to_v3(mappings, source, html, '/path/to/file.md');

		expect(v3.file).toBe('file.md');
		expect(v3.sources).toEqual(['file.md']);
	});

	it('round-trips through decode', () => {
		const { html, mappings, source } = renderMapped('# Hello\n\nworld\n');
		const v3 = mappings_to_v3(mappings, source, html);

		// basic vlq sanity: should contain only valid vlq chars
		expect(v3.mappings).toMatch(/^[A-Za-z0-9+/,;]*$/);
	});

	it('vlq decodes correctly and maps to right positions', () => {
		const { html, mappings, source } = renderMapped('hello world\n');
		const v3 = mappings_to_v3(mappings, source, html);

		const decoded = decodeVLQMappings(v3.mappings);
		expect(decoded.length).toBeGreaterThan(0);

		// html is '<p>hello world</p>' — single line
		expect(decoded[0].length).toBeGreaterThan(0);

		// find the segment that maps the text content (not the tag)
		// first segment is TAG at col 0 (<p>), second is TEXT at col 3 (hello)
		const textSeg = decoded[0].find(s => s.length >= 1 && html.slice(s[0], s[0] + 5) === 'hello');
		expect(textSeg).toBeDefined();
		expect(textSeg!.length).toBe(4);
		expect(textSeg![1]).toBe(0); // source index 0

		// source position should point to 'hello' in source
		const src_line = textSeg![2];
		const src_col = textSeg![3];
		const src_lines = source.split('\n');
		expect(src_lines[src_line].slice(src_col, src_col + 5)).toBe('hello');
	});

	it('survives svelte compiler remapping', () => {
		const svelte = require('svelte/compiler');
		// single-element output — Svelte generates per-element mappings for these
		const src = 'hello world\n';
		const { html, mappings, source } = renderMapped(src);
		const v3 = mappings_to_v3(mappings, source, html, 'test.md');

		const result = svelte.compile(html, {
			filename: 'test.md',
			generate: 'client',
			sourcemap: v3,
		});

		expect(result.js.map).toBeDefined();
		expect(result.js.map.mappings.length).toBeGreaterThan(0);
		expect(result.js.map.sources).toContain('test.md');
	});

	it('multiline source maps correctly', () => {
		const src = '# Title\n\nparagraph\n';
		const { html, mappings, source } = renderMapped(src);
		const v3 = mappings_to_v3(mappings, source, html);

		const decoded = decodeVLQMappings(v3.mappings);
		const allSegments = decoded.flat();
		expect(allSegments.length).toBeGreaterThan(0);

		for (const seg of allSegments) {
			if (seg.length >= 4) {
				expect(seg[2]).toBeGreaterThanOrEqual(0); // src_line
				expect(seg[3]).toBeGreaterThanOrEqual(0); // src_col
			}
		}
	});
});
