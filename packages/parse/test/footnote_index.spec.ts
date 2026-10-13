import { describe, expect, test } from 'vitest';

import {
	footnote_id,
	footnote_ids,
	footnote_index,
	footnote_ref_id,
} from '../src/buf_utils';
import { parse_markdown_svelte } from '../src/main';
import type { ParsePlugin } from '../src/plugin_types';
import { take_footnote } from '../src/utils';
import { expect_parity_logged } from './plugin_harness';

function index_of(source: string, optimistic = false) {
	const { nodes } = parse_markdown_svelte(source);
	const index = footnote_index(nodes, optimistic);
	if (index === null) return null;
	const label = (node: number): string => nodes.metadata_at(node)?.label;
	return {
		labels: index.labels,
		defined: index.definitions.map((node) => node !== 0xffffffff),
		counts: index.counts,
		// each reference in document order as its label, number and which one it is
		references: [...index.references]
			.sort((a, b) => nodes.start_at(a[0]) - nodes.start_at(b[0]))
			.map(
				([node, at]) => `${label(node)} ${Math.floor(at / 65536)}.${at % 65536}`
			),
		problems: index.problems.map(
			(p) => `${p.code} ${p.label} ${nodes.start_at(p.node)}`
		),
	};
}

describe('footnote_index', () => {
	test('a document with no footnote has none', () => {
		expect(index_of('a [b](c) \\[^d] `[^e]`\n')).toBe(null);
	});

	test('numbers by first reference, and counts each reference', () => {
		expect(index_of('[^b]: two\n\nx[^a] y[^b] z[^a]\n\n[^a]: one\n')).toEqual({
			labels: ['a', 'b'],
			defined: [true, true],
			counts: [2, 1],
			references: ['a 1.1', 'b 2.1', 'a 1.2'],
			problems: [],
		});
	});

	test('the references of the body come before those inside definitions', () => {
		expect(
			index_of(
				'[^1]: see[^3] and[^2]\n\na[^1] b[^2]\n\n[^2]: two\n[^3]: three\n'
			)
		).toEqual({
			labels: ['1', '2', '3'],
			defined: [true, true, true],
			counts: [1, 2, 1],
			references: ['3 3.1', '2 2.2', '1 1.1', '2 2.1'],
			problems: [],
		});
	});

	test('a reference with no definition is a problem and has no number', () => {
		expect(index_of('a[^x] b[^1]\n\n[^1]: one\n')).toEqual({
			labels: ['1'],
			defined: [true],
			counts: [1],
			references: ['1 1.1'],
			problems: ['footnote_undefined x 1'],
		});
	});

	test('a second definition is a problem, and nothing in it is numbered', () => {
		expect(
			index_of('a[^1]\n\n[^1]: one\n[^1]: again[^2]\n\n[^2]: two\n')
		).toEqual({
			labels: ['1'],
			defined: [true],
			counts: [1],
			references: ['1 1.1'],
			problems: ['footnote_duplicate 1 17', 'footnote_unused 2 34'],
		});
	});

	test('a definition only another unused one refers to is unused too', () => {
		expect(index_of('[^1]: one[^2]\n\n[^2]: two[^1]\n')).toEqual({
			labels: [],
			defined: [],
			counts: [],
			references: [],
			problems: ['footnote_unused 1 0', 'footnote_unused 2 15'],
		});
	});

	test('optimistic numbers a reference with no definition and reports nothing', () => {
		expect(index_of('a[^x] b[^1]\n\n[^1]: one\n[^1]: again\n', true)).toEqual({
			labels: ['x', '1'],
			defined: [false, true],
			counts: [1, 1],
			references: ['x 1.1', '1 2.1'],
			problems: [],
		});
	});

	test('labels match exactly, case included', () => {
		expect(index_of('a[^A]\n\n[^a]: one\n')?.problems).toEqual([
			'footnote_undefined A 1',
			'footnote_unused a 7',
		]);
	});

	test('the ids of a document are those of its definitions and its references', () => {
		const { nodes } = parse_markdown_svelte('a[^x] b[^y] c[^x]\n\n[^x]: one\n');
		expect(footnote_ids(footnote_index(nodes, true)!)).toEqual([
			'fn-x',
			'fnref-1',
			'fnref-1-2',
			'fnref-2',
		]);
		expect(footnote_id('a b')).toBe('fn-a b');
		expect(footnote_ref_id(3, 1)).toBe('fnref-3');
		expect(footnote_ref_id(3, 2)).toBe('fnref-3-2');
	});
});

describe('footnotes and parse plugins', () => {
	test('a handler for each kind runs, with the label and the text', () => {
		const { tree, log } = expect_parity_logged(
			'a[^1] b\n\n[^1]: The *source*.\n',
			(log) => {
				const plugin: ParsePlugin = {
					footnote_reference: {
						parse(node) {
							return () => {
								log.push(
									`reference ${node.attrs.label} "${node.text_content}"`
								);
								node.attrs.class = 'r';
							};
						},
					},
					footnote_definition: {
						parse(node) {
							return () => {
								log.push(
									`definition ${node.attrs.label} "${node.text_content}"`
								);
								node.attrs.class = 'd';
							};
						},
					},
					paragraph: {
						parse: (node) => () =>
							void log.push(`paragraph "${node.text_content}"`),
					},
				};
				return { plugins: [plugin] };
			},
			{ attrs: ['label', 'class'] }
		);
		expect(log).toEqual([
			'reference 1 ""',
			'paragraph "a b"',
			'paragraph "The source."',
			'definition 1 "The source."',
		]);
		expect(tree).toEqual([
			'root',
			[
				'paragraph',
				'text:a',
				'footnote_reference label="1" class="r"',
				'text: b',
			],
			[
				'footnote_definition label="1" class="d"',
				[
					'paragraph',
					'text:The ',
					['strong_emphasis', 'text:source'],
					'text:.',
				],
			],
		]);
	});

	test('a footnote a plugin makes is noted as one the parser made', () => {
		take_footnote();
		const { nodes } = parse_markdown_svelte('a b\n', {
			plugins: [
				{
					paragraph: {
						parse(node) {
							node.append('footnote_reference', { label: 'p' });
						},
					},
				},
			],
		});
		expect(take_footnote()).toBe(true);
		expect(footnote_index(nodes, true)?.labels).toEqual(['p']);
	});
});
