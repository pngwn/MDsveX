import { describe, expect, test } from 'vitest';

import type { NodeView } from '../src/node_view';
import type { ParsePlugin } from '../src/plugin_types';
import { PATHS, expect_parity } from './plugin_harness';
import { every_path, lines, with_metadata } from './stream_shape';

const REVOKED: [string, string][] = [
	['an html tag in a paragraph', 'a <span>b\n'],
	['an html tag with attributes', 'x <a href="u" class="k">y\n'],
	['an html tag in a heading', '# a <span>b\n'],
	['an html tag in a list item', '- a <span>b\n- c\n'],
	['an html tag in a block quote', '> a <span>b\n'],
	['an html tag in a header cell', '| <span>a |\n|-|\n'],
	['an html tag in a body cell', '| a |\n|-|\n| <a href="u">b |\n'],
	['an html tag at the start of a line', '<div>\n\nx\n'],
	['an inline directive in a paragraph', 'a :y[b\n'],
	['an inline directive in a heading', '# ::z[\n\n'],
	['an inline directive in a table cell', '| :y[b |\n|-|\n'],
	['a link', '[a *b* c\n'],
	['an image', 'a ![b](c\n'],
	['a code span', 'a `b\n'],
	['a delimiter', 'a *b\n\n~~c\n'],
];

describe.each(PATHS)('a node repaired into text, %s', (_, run) => {
	test.each(REVOKED)('%s keeps no metadata', (_name, source) => {
		const out = run(source);
		expect(with_metadata(out.nodes, ['text', 'paragraph'])).toEqual([]);
	});

	test('keeps nothing its own handlers wrote', () => {
		const decorate = (node: NodeView) => {
			node.attrs.class = 'x';
			return () => {
				node.attrs.closed = true;
			};
		};
		const plugin: ParsePlugin = {
			html: { parse: decorate },
			directive_inline: { parse: decorate },
			link: { parse: decorate },
			code_span: { parse: decorate },
			strong_emphasis: { parse: decorate },
		};
		for (const [, source] of REVOKED) {
			const out = run(source, [plugin]);
			expect(with_metadata(out.nodes, ['text', 'paragraph']), source).toEqual(
				[]
			);
		}
	});

	test('keeps nothing the handler of another node wrote on it', () => {
		// the tag is still an element when its paragraph closes
		const plugin: ParsePlugin = {
			paragraph: {
				parse(node) {
					return () => {
						for (let c = node.first_child; c !== null; c = c.next) {
							if (c.type === 'html') c.attrs.seen = true;
						}
					};
				},
			},
		};
		const out = run('a <span>b\n\nc <i>d</i>\n', [plugin]);
		expect(with_metadata(out.nodes, ['text'])).toEqual([]);
		expect(with_metadata(out.nodes, ['html'])).toEqual(['html seen,tag']);
	});

	test('gets nothing back when a later revoke undoes a write to it', () => {
		// the paragraph of a tight item is revoked after the tag inside it
		const plugin: ParsePlugin = {
			paragraph: {
				parse(node) {
					return () => {
						for (let c = node.first_child; c !== null; c = c.next) {
							if (c.type !== 'html') continue;
							c.attrs.seen = true;
							delete c.attrs.tag;
						}
					};
				},
			},
		};
		const out = run('- a <span>b\n- c\n', [plugin]);
		expect(with_metadata(out.nodes, ['text'])).toEqual([]);
	});
});

describe('a node repaired into text', () => {
	test('builds one tree on every path', () => {
		for (const [, source] of REVOKED) expect_parity(source, () => []);
	});

	test('in a table cell is plain text', () => {
		expect(every_path('| <span>a |\n|-|\n| :y[b | \n')).toBe(
			lines(
				'root',
				'  table alignments=["none"] col_count=1',
				'    table_header',
				'      table_cell',
				'        text "<span>"',
				'        text "a"',
				'    table_row',
				'      table_cell',
				'        text ":y[b"'
			)
		);
	});

	test('in a paragraph is plain text', () => {
		expect(every_path('x <a href="u">y :z[w\n')).toBe(
			lines(
				'root',
				'  paragraph',
				'    text "x "',
				'    text "<a href=\\"u\\">"',
				'    text "y "',
				'    text ":z[w"',
				'  line_break'
			)
		);
	});
});
