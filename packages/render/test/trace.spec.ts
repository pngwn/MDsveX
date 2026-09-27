import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { decode, encode } from '@jridgewell/sourcemap-codec';
import type { SourceMapMappings } from '@jridgewell/sourcemap-codec';
import { describe, expect, it } from 'vitest';
import { PFMParser } from '@mdsvex/parse';
import { TreeBuilder } from '@mdsvex/parse/tree-builder';

import { CursorHTMLRenderer, _capture_trace, _emit } from '../src/html_cursor';
import {
	MapSink,
	P_CODE,
	P_STRUCTURE,
	P_SVELTE,
	P_TEXT,
	R_CLOSE_SYNTAX,
	R_CONTENT,
	R_NODE,
	R_OPEN_SYNTAX,
	record_code,
} from '../src/mappings';
import {
	mapped_source_lines,
	trace_to_decoded,
	trace_to_v3,
} from '../src/sourcemap';
import type { MapTrace } from '../src/sourcemap';

const FIXTURES = resolve(
	dirname(fileURLToPath(import.meta.url)),
	'../../parse/test/fixtures'
);

function fixture_files(dir: string): string[] {
	const files: string[] = [];
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) files.push(...fixture_files(path));
		else if (/\.(md|svx)$/.test(entry.name)) files.push(path);
	}
	return files.sort();
}

const DOCS = [
	'',
	'plain\n',
	'# Title\n\nSome *emphasis* and `code` and [a link](/x).\n',
	'> quote\n> more\n\n- a\n- b\n\n1. one\n2. two\n',
	'<script>\n\tlet x = 1;\n</script>\n\n{x} and {#if x}yes{/if}\n',
	'```js\nconst a = 1;\nconst b = 2;\n```\n\n| a | b |\n| - | - |\n| 1 | 2 |\n',
	'line one\r\nline two\rline three\n\ntext &amp; <b>html</b>\n',
	'a  \nb\\\nc\n\n***\n\n<div>\n\nx\n\n</div>\n',
];

function render(source: string) {
	const tree = new TreeBuilder(source.length >> 3 || 128);
	new PFMParser(tree).parse(source);
	return tree.get_buffer();
}

/** the decoded lines of the full map, lines past its end left empty. */
function full_lines(map: { mappings: string }, count: number) {
	const decoded = decode(map.mappings);
	const lines: SourceMapMappings = [];
	for (let i = 0; i < count; i++) lines.push(decoded[i] ?? []);
	return lines;
}

/** trace_to_decoded against decoding trace_to_v3, for every line and for a sample. */
function check_trace(trace: MapTrace, source: string, html: string) {
	const full = trace_to_v3(trace, source, html, '/a/doc.svx');
	const count = html.split(/\r\n|\r|\n/).length;
	const want = full_lines(full, count);

	const every = Array.from({ length: count + 2 }, (_, i) => i);
	const all = trace_to_decoded(trace, source, html, every, '/a/doc.svx');
	expect({ ...all, mappings: '' }).toEqual({ ...full, mappings: '' });
	for (let i = 0; i < count + 2; i++) {
		expect(all.mappings[i] ?? [], `line ${i}`).toEqual(want[i] ?? []);
	}

	// a sparse request keeps its lines and leaves the rest empty
	const some = every.filter((i) => i % 3 === 1);
	const sparse = trace_to_decoded(trace, source, html, some, '/a/doc.svx');
	for (let i = 0; i < sparse.mappings.length; i++) {
		const expected = i % 3 === 1 ? (want[i] ?? []) : [];
		expect(sparse.mappings[i], `sparse line ${i}`).toEqual(expected);
	}
	expect(trace_to_decoded(trace, source, html, []).mappings).toEqual([]);
}

describe('update_trace', () => {
	it.each(DOCS)('trace_to_v3 equals update_v3: %j', (source) => {
		const nodes = render(source);
		const fused = new CursorHTMLRenderer({ cache: false });
		const want = fused.update_v3(nodes, source, source, '/a/doc.svx');
		const renderer = new CursorHTMLRenderer({ cache: false });
		const trace = renderer.update_trace(nodes, source);
		expect(renderer.html).toBe(fused.html);
		expect(
			JSON.stringify(trace_to_v3(trace, source, renderer.html, '/a/doc.svx'))
		).toBe(JSON.stringify(want));
	});

	it('keeps its trace when the renderer renders again', () => {
		const renderer = new CursorHTMLRenderer({ cache: false });
		const first = renderer.update_trace(render(DOCS[2]), DOCS[2]);
		const html = renderer.html;
		const before = JSON.stringify(trace_to_v3(first, DOCS[2], html));
		renderer.update_trace(render(DOCS[5]), DOCS[5]);
		expect(JSON.stringify(trace_to_v3(first, DOCS[2], html))).toBe(before);
	});

	it('keeps traces apart across slabs and for large documents', () => {
		// small traces share slabs, a large one gets its own array, and
		// enough of them fill several slabs
		const large = Array.from(
			{ length: 400 },
			(_, i) => `para ${i} with *em* and \`code\`\n`
		).join('\n');
		const sources = [...DOCS, large];
		const renderer = new CursorHTMLRenderer({ cache: false });
		const kept: { trace: MapTrace; source: string; html: string }[] = [];
		const want: string[] = [];
		for (let round = 0; round < 200; round++) {
			const source = sources[round % sources.length];
			const trace = renderer.update_trace(render(source), source);
			const html = renderer.html;
			expect(trace.split - trace.start).toBeGreaterThanOrEqual(0);
			expect(trace.end).toBeLessThanOrEqual(trace.buf.length);
			kept.push({ trace, source, html });
			const fused = new CursorHTMLRenderer({ cache: false });
			want.push(
				JSON.stringify(fused.update_v3(render(source), source, source))
			);
		}
		for (let i = 0; i < kept.length; i++) {
			const { trace, source, html } = kept[i];
			expect(
				JSON.stringify(trace_to_v3(trace, source, html)),
				`trace ${i}`
			).toBe(want[i]);
		}
		const regions = kept
			.map(({ trace }) => trace)
			.filter((t) => t.end > t.start);
		const bufs = new Set(regions.map((t) => t.buf));
		expect(bufs.size).toBeGreaterThan(3);
		const last = kept[sources.length - 1].trace;
		expect(last.start === 0 && last.end === last.buf.length).toBe(true);
		for (let i = 0; i < regions.length; i++) {
			for (let j = i + 1; j < regions.length; j++) {
				const a = regions[i];
				const b = regions[j];
				if (a.buf !== b.buf) continue;
				expect(a.end <= b.start || b.end <= a.start).toBe(true);
			}
		}
	});
});

describe('trace_to_decoded', () => {
	it.each(DOCS)('matches the decoded full map: %j', (source) => {
		const renderer = new CursorHTMLRenderer({ cache: false });
		const trace = renderer.update_trace(render(source), source);
		check_trace(trace, source, renderer.html);
	});

	it('matches the decoded full map for every parser fixture', () => {
		const files = fixture_files(FIXTURES);
		expect(files.length).toBeGreaterThan(100);
		const renderer = new CursorHTMLRenderer({ cache: false });
		for (const file of files) {
			const source = readFileSync(file, 'utf8');
			const trace = renderer.update_trace(render(source), source);
			check_trace(trace, source, renderer.html);
		}
	});

	it('orders overlapping runs one character at a time like the encoder', () => {
		const source = 'abcdef\nghijkl\nmnopqr\n';
		const out = ['abc', 'd\nf', 'X', 'yz\n', 'w'];
		const sink = new MapSink();
		sink.begin(true);
		_emit(sink, 0, 2, 0, 6, 0, record_code(P_TEXT, R_CONTENT));
		_emit(sink, 1, 2, 8, 9, 1, record_code(P_CODE, R_CONTENT));
		_emit(sink, 2, 3, 14, 15, 2, record_code(P_SVELTE, R_NODE));
		_emit(sink, 3, 4, 7, 10, 3, record_code(P_TEXT, R_CONTENT));
		_emit(sink, 1, 2, 3, 3, 3, record_code(P_TEXT, R_CONTENT));
		_emit(sink, 0, 1, 0, 0, 0, record_code(P_STRUCTURE, R_OPEN_SYNTAX));
		_emit(sink, 4, 5, 20, 21, 4, record_code(P_STRUCTURE, R_CLOSE_SYNTAX));
		const trace = _capture_trace(sink, out);
		check_trace(trace, source, out.join(''));
	});
});

describe('mapped_source_lines', () => {
	function lines_of(mappings: SourceMapMappings) {
		const lines = new Set<number>();
		for (const line of mappings)
			for (const segment of line) if (segment.length > 1) lines.add(segment[2]);
		return [...lines].sort((a, b) => a - b);
	}
	const sorted = (lines: number[] | null) =>
		lines && [...new Set(lines)].sort((a, b) => a - b);

	it('finds the source lines of encoded and decoded mappings', () => {
		const cases: SourceMapMappings[] = [
			[],
			[[]],
			[[[0]], [], [[4], [7]]],
			[[[0, 0, 0, 0], [3]], [[1, 0, 5, 2, 0]], [], [[0, 0, 2, 9]]],
			[
				[
					[0, 0, 900, 0],
					[2, 0, 17, 33],
					[5, 0, 0, 1],
				],
				[[1, 0, 1000000, 2]],
			],
		];
		for (const mappings of cases) {
			const want = lines_of(mappings);
			expect(sorted(mapped_source_lines(encode(mappings)))).toEqual(want);
			expect(sorted(mapped_source_lines(mappings))).toEqual(want);
		}
	});

	it('gives up on mappings decoders could read differently', () => {
		const bad = [
			'AA', // two fields
			'AAA', // three fields
			'AAAAAA', // six fields
			'A,,A', // an empty segment
			'AACA,ACBA', // a second source
			'AABA', // a negative zero line
			'A!AA', // not a base64 digit
			'AAg', // a value cut short
			'AAggggggggA', // a value too long for int32
		];
		for (const mappings of bad) {
			expect(mapped_source_lines(mappings), mappings).toBeNull();
		}
		expect(mapped_source_lines([[[0, 1, 0, 0]]])).toBeNull();
		expect(mapped_source_lines([[[0, 0]]])).toBeNull();
		expect(mapped_source_lines([[[0, 0, -1, 0]]])).toBeNull();
		expect(mapped_source_lines({} as never)).toBeNull();
	});
});
