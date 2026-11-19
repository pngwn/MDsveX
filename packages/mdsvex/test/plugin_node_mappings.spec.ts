import { describe, expect, test } from 'vitest';

import { mappings_to_v3 } from '@mdsvex/render/sourcemap';

import { compile, CompilerSession } from '../src/main';
import type { ParsePlugin } from '../src/main';

/** the role, source text and generated text of every mapping */
function spans(source: string, plugin: ParsePlugin) {
	const out = compile(source, { parse_plugins: [plugin], sourcemap: true });
	const code = out.code;
	for (const m of out.mappings!) {
		expect(m.sourceOffsets[0] + m.lengths[0]).toBeLessThanOrEqual(
			source.length
		);
	}
	return out.mappings!.map((m) => [
		m.data.role,
		source.slice(m.sourceOffsets[0], m.sourceOffsets[0] + m.lengths[0]),
		code.slice(
			m.generatedOffsets[0],
			m.generatedOffsets[0] + (m.generatedLengths ?? m.lengths)[0]
		),
	]);
}

describe('the mappings of a node a parse plugin adds', () => {
	test('an appended node has no source and no record', () => {
		const got = spans('some text\n', {
			paragraph: {
				parse: (node) => () => {
					node.append('link', { href: '/x' }).append('text', 'more');
				},
			},
		});
		expect(got).toEqual([
			['content', 'some text', 'some text'],
			['node', 'some text', '<p>some text<a href="/x">more</a></p>'],
			['open_syntax', '', '<p>'],
			['close_syntax', '', '</p>'],
		]);
	});

	test('a prepended node has no record', () => {
		const got = spans('some text\n', {
			paragraph: {
				parse: (node) => () => {
					node.prepend('emphasis').append('text', 'first');
				},
			},
		});
		expect(got.filter((s) => s[2].includes('<em>'))).toEqual([
			['node', 'some text', '<p><em>first</em>some text</p>'],
		]);
		expect(got).toContainEqual(['content', 'some text', 'some text']);
	});

	test('a wrapper from wrap_inner has no record, its children keep theirs', () => {
		const got = spans('some _text_\n', {
			paragraph: {
				parse: (node) => () => void node.wrap_inner('strong_emphasis'),
			},
		});
		expect(got.filter((s) => s[2].startsWith('<strong>some'))).toEqual([]);
		expect(got).toContainEqual(['node', '_text_', '<em>text</em>']);
		expect(got).toContainEqual(['content', 'some ', 'some ']);
	});

	test('an appended image and thematic break have no record', () => {
		const got = spans('> quoted\n', {
			block_quote: {
				parse: (node) => () => {
					node.append('image', { src: '/a.png' });
					node.append('thematic_break');
				},
			},
		});
		expect(got.filter((s) => s[2].startsWith('<img'))).toEqual([]);
		expect(got.filter((s) => s[2].startsWith('<hr'))).toEqual([]);
		expect(got).toContainEqual(['content', 'quoted', 'quoted']);
	});

	const link: ParsePlugin = {
		paragraph: {
			parse: (node) => () => {
				node.append('link', { href: '/x' }).append('text', 'more');
			},
		},
	};

	test('a trace has no point for an appended node', () => {
		const source = 'line one\n\nsome text\n';
		const { code, trace } = new CompilerSession().compile_trace(source, [link]);
		const words = trace.buf.subarray(trace.start, trace.split);
		const second = code.indexOf('<p>some');
		for (let i = 0; i < words.length; i += 3) {
			// the words are gen, src, len triples
			if (words[i] >= second) expect(words[i + 1]).toBeGreaterThanOrEqual(10);
		}
		expect(code).toContain('<p>some text<a href="/x">more</a></p>');
	});

	test('compile_v3 matches the object path', () => {
		const source = 'line one\n\nsome text\n';
		const got = new CompilerSession().compile_v3(source, '/a.svx', [link]);
		const out = compile(source, { parse_plugins: [link], sourcemap: true });
		expect(JSON.stringify(got.map)).toBe(
			JSON.stringify(mappings_to_v3(out.mappings!, source, out.code, '/a.svx'))
		);
	});
});
