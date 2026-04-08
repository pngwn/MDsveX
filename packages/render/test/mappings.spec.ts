import { describe, it, expect } from 'vitest';
import { PFMParser } from '@mdsvex/parse';
import { TreeBuilder } from '@mdsvex/parse/tree-builder';
import { CursorHTMLRenderer } from '../src/html_cursor';
import type { Mapping, MappingData, MappingRole } from '../src/mappings';
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
			for (let f = 0; f < 5 && i < mappings.length && mappings[i] !== ',' && mappings[i] !== ';'; f++) {
				let value = 0, shift = 0, digit: number;
				do {
					digit = B64_LOOKUP[mappings.charCodeAt(i++)];
					value |= (digit & 0x1f) << shift;
					shift += 5;
				} while (digit & 0x20);
				seg.push(value & 1 ? -(value >>> 1) : value >>> 1);
			}
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

function byRole(mappings: Mapping<MappingData>[], role: MappingRole) {
	return mappings.filter(m => m.data.role === role);
}

function srcSlice(source: string, m: Mapping<MappingData>) {
	return source.slice(m.sourceOffsets[0], m.sourceOffsets[0] + m.lengths[0]);
}

function genSlice(html: string, m: Mapping<MappingData>) {
	const len = m.generatedLengths ? m.generatedLengths[0] : m.lengths[0];
	return html.slice(m.generatedOffsets[0], m.generatedOffsets[0] + len);
}

/** verify every mapping has valid offsets. */
function assertMappingsValid(
	source: string,
	html: string,
	mappings: Mapping<MappingData>[],
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
		}
	}
}

// ── mapping collection tests ──

describe('Mapping collection', () => {
	it('paragraph emits node + content mappings', () => {
		const { html, mappings, source } = renderMapped('hello world\n');
		assertMappingsValid(source, html, mappings);

		const nodes = byRole(mappings, 'node');
		const contents = byRole(mappings, 'content');
		expect(nodes.length).toBeGreaterThanOrEqual(1);
		expect(contents.length).toBe(1);

		// content maps text accurately
		expect(srcSlice(source, contents[0])).toBe('hello world');
		expect(genSlice(html, contents[0])).toBe('hello world');

		// node span covers full <p>...</p>
		const pNode = nodes.find(m => genSlice(html, m).startsWith('<p'));
		expect(pNode).toBeDefined();
	});

	it('heading emits node + open_syntax + close_syntax + content', () => {
		const { html, mappings, source } = renderMapped('### hello\n');
		assertMappingsValid(source, html, mappings);

		const nodes = byRole(mappings, 'node');
		const opens = byRole(mappings, 'open_syntax');
		const closes = byRole(mappings, 'close_syntax');
		const contents = byRole(mappings, 'content');

		expect(nodes.length).toBeGreaterThanOrEqual(1);
		expect(opens.length).toBeGreaterThanOrEqual(1);
		expect(contents.length).toBe(1);

		// content: hello → hello
		expect(srcSlice(source, contents[0])).toBe('hello');

		// open_syntax: <h3> maps to ### (source marker)
		const headingOpen = opens.find(m => genSlice(html, m).startsWith('<h'));
		expect(headingOpen).toBeDefined();
		expect(srcSlice(source, headingOpen!)).toBe('### ');

		// node span covers full <h3>hello</h3>
		const headingNode = nodes.find(m => genSlice(html, m).includes('<h3>'));
		expect(headingNode).toBeDefined();
	});

	it('emphasis emits open/close syntax mapping to markers', () => {
		const { html, mappings, source } = renderMapped('_hello_\n');
		assertMappingsValid(source, html, mappings);

		const opens = byRole(mappings, 'open_syntax');
		const closes = byRole(mappings, 'close_syntax');

		// find the emphasis open_syntax (maps <em> → _)
		const emOpen = opens.find(m => genSlice(html, m).includes('<em'));
		expect(emOpen).toBeDefined();
		expect(srcSlice(source, emOpen!)).toBe('_');

		const emClose = closes.find(m => genSlice(html, m).includes('</em>'));
		expect(emClose).toBeDefined();
		expect(srcSlice(source, emClose!)).toBe('_');
	});

	it('code span emits content with CODE capabilities', () => {
		const { html, mappings, source } = renderMapped('use `code` here\n');
		assertMappingsValid(source, html, mappings);

		const contents = byRole(mappings, 'content');
		const codeContent = contents.find(m => srcSlice(source, m) === 'code');
		expect(codeContent).toBeDefined();
		expect(codeContent!.data.semantic).toBe(true);
		expect(codeContent!.data.verification).toBeUndefined();
	});

	it('code fence emits content + node + syntax', () => {
		const { html, mappings, source } = renderMapped('```js\nconst x = 1;\n```\n');
		assertMappingsValid(source, html, mappings);

		const contents = byRole(mappings, 'content');
		const codeContent = contents.find(m => srcSlice(source, m).includes('const x'));
		expect(codeContent).toBeDefined();

		const opens = byRole(mappings, 'open_syntax');
		expect(opens.length).toBeGreaterThanOrEqual(1);
	});

	it('uses generatedLengths when escape changes length', () => {
		const { html, mappings, source } = renderMapped('a & b\n');
		assertMappingsValid(source, html, mappings);

		const contents = byRole(mappings, 'content');
		const textContent = contents[0];
		expect(textContent.generatedLengths).toBeDefined();
		expect(textContent.generatedLengths![0]).toBeGreaterThan(textContent.lengths[0]);
	});

	it('no generatedLengths when escape does not change length', () => {
		const { html, mappings, source } = renderMapped('hello\n');
		assertMappingsValid(source, html, mappings);

		const contents = byRole(mappings, 'content');
		expect(contents[0].generatedLengths).toBeUndefined();
	});

	it('nodeIndex is stable and matches cursor index', () => {
		const { mappings } = renderMapped('# Title\n\npara\n');

		// all mappings for the same node should share nodeIndex
		const byNode = new Map<number, MappingData[]>();
		for (const m of mappings) {
			const arr = byNode.get(m.data.nodeIndex) ?? [];
			arr.push(m.data);
			byNode.set(m.data.nodeIndex, arr);
		}

		// each node should have at most one of each role
		for (const [, entries] of byNode) {
			const roles = entries.map(e => e.role);
			const unique = new Set(roles);
			expect(unique.size).toBe(roles.length);
		}
	});

	it('close_syntax source range does not span entire document for container nodes', () => {
		const { html, mappings, source } = renderMapped('# Title\n\nparagraph text\n');
		assertMappingsValid(source, html, mappings);

		const closes = byRole(mappings, 'close_syntax');
		for (const m of closes) {
			// no close_syntax source range should be more than half the document —
			// a bogus range from offset 0 to the node end would be caught here
			expect(m.lengths[0]).toBeLessThan(source.length / 2);
		}
	});

	it('paragraph close_syntax is zero-width (no markdown close marker)', () => {
		const { html, mappings, source } = renderMapped('hello world\n');
		assertMappingsValid(source, html, mappings);

		const closes = byRole(mappings, 'close_syntax');
		const paraClose = closes.find(m => genSlice(html, m).includes('</p>'));
		expect(paraClose).toBeDefined();
		// paragraphs have no closing syntax in markdown — source length should be 0
		expect(paraClose!.lengths[0]).toBe(0);
	});

	it('paragraph open_syntax is zero-width (no markdown open marker)', () => {
		const { html, mappings, source } = renderMapped('hello world\n');
		assertMappingsValid(source, html, mappings);

		const opens = byRole(mappings, 'open_syntax');
		const paraOpen = opens.find(m => genSlice(html, m).includes('<p'));
		expect(paraOpen).toBeDefined();
		expect(paraOpen!.lengths[0]).toBe(0);
	});

	it('heading open_syntax maps to marker, close_syntax is zero-width', () => {
		const { html, mappings, source } = renderMapped('### hello\n');
		assertMappingsValid(source, html, mappings);

		const opens = byRole(mappings, 'open_syntax');
		const headingOpen = opens.find(m => genSlice(html, m).startsWith('<h'));
		expect(headingOpen).toBeDefined();
		expect(srcSlice(source, headingOpen!)).toBe('### ');

		const closes = byRole(mappings, 'close_syntax');
		const headingClose = closes.find(m => genSlice(html, m).includes('</h'));
		expect(headingClose).toBeDefined();
		expect(headingClose!.lengths[0]).toBe(0);
	});

	it('code fence open_syntax maps to opening fence, close_syntax to closing fence', () => {
		const src = '```js\ncode\n```\n';
		const { html, mappings, source } = renderMapped(src);
		assertMappingsValid(source, html, mappings);

		const opens = byRole(mappings, 'open_syntax');
		const fenceOpen = opens.find(m => genSlice(html, m).includes('<pre>'));
		expect(fenceOpen).toBeDefined();
		expect(srcSlice(source, fenceOpen!)).toContain('```js');

		const closes = byRole(mappings, 'close_syntax');
		const fenceClose = closes.find(m => genSlice(html, m).includes('</code></pre>'));
		expect(fenceClose).toBeDefined();
		expect(srcSlice(source, fenceClose!)).toContain('```');
	});

	it('emphasis open/close syntax maps to single marker chars', () => {
		const { html, mappings, source } = renderMapped('_hello_\n');
		assertMappingsValid(source, html, mappings);

		const opens = byRole(mappings, 'open_syntax');
		const emOpen = opens.find(m => genSlice(html, m).includes('<em'));
		expect(emOpen).toBeDefined();
		expect(srcSlice(source, emOpen!)).toBe('_');
		expect(emOpen!.lengths[0]).toBe(1);

		const closes = byRole(mappings, 'close_syntax');
		const emClose = closes.find(m => genSlice(html, m).includes('</em>'));
		expect(emClose).toBeDefined();
		expect(srcSlice(source, emClose!)).toBe('_');
		expect(emClose!.lengths[0]).toBe(1);
	});

	it('mustache emits content + node + syntax', () => {
		const { html, mappings, source } = renderMapped('{name}\n');
		assertMappingsValid(source, html, mappings);

		const contents = byRole(mappings, 'content');
		const svelte = contents.filter(m => m.data.completion === true);
		expect(svelte.length).toBeGreaterThanOrEqual(1);
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

	it('v3 excludes syntax spans', () => {
		const { html, mappings, source } = renderMapped('### hello\n');

		// enriched mappings have syntax spans
		const opens = byRole(mappings, 'open_syntax');
		expect(opens.length).toBeGreaterThan(0);

		// v3 should only have content + node anchors
		const v3 = mappings_to_v3(mappings, source, html);
		expect(v3.mappings).toMatch(/^[A-Za-z0-9+/,;]*$/);
	});

	it('vlq decodes correctly and maps to right positions', () => {
		const { html, mappings, source } = renderMapped('hello world\n');
		const v3 = mappings_to_v3(mappings, source, html);

		const decoded = decodeVLQMappings(v3.mappings);
		expect(decoded.length).toBeGreaterThan(0);
		expect(decoded[0].length).toBeGreaterThan(0);

		// find the segment that maps the text content
		const textSeg = decoded[0].find(s => s.length >= 1 && html.slice(s[0], s[0] + 5) === 'hello');
		expect(textSeg).toBeDefined();
		expect(textSeg!.length).toBe(4);

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
});
