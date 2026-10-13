import { describe, expect, test } from 'vitest';

import { parse_markdown_svelte } from '../src/main';
import { take_footnote } from '../src/utils';
import { both, every_path, lines } from './stream_shape';

/** the inline children of the one paragraph of a line, every path agreeing */
function inline(source: string): string[] {
	const tree = every_path(source + '\n').split('\n');
	expect(tree.slice(0, 2)).toEqual(['root', '  paragraph']);
	expect(tree[tree.length - 1]).toBe('  line_break');
	return tree.slice(2, -1).map((row) => row.slice(4));
}

const REF = 'footnote_reference label="1"';

describe('a footnote reference', () => {
	test.each([
		['[^1]', [REF]],
		['a claim[^1], and more', ['text "a claim"', REF, 'text ", and more"']],
		['[^1][^note]', [REF, 'footnote_reference label="note"']],
		['[^a-b.c_d*e]', ['footnote_reference label="a-b.c_d*e"']],
		['[^ünï]', ['footnote_reference label="ünï"']],
		['*a[^1]*', ['strong_emphasis', '  text "a"', '  ' + REF]],
		['_[^1]_', ['emphasis', '  ' + REF]],
		['<b>x[^1]</b> y', ['html tag="b"', '  text "x"', '  ' + REF, 'text " y"']],
		['[^1](url)', [REF, 'text "(url)"']],
		['[^1]: ', [REF, 'text ": "']],
		['a [^1]: b', ['text "a "', REF, 'text ": b"']],
	])('%j', (source, kids) => {
		expect(inline(source)).toEqual(kids);
	});

	test.each([
		['\\[^1]', ['text "["', 'text "^"', 'text "1"', 'text "]"']],
		['[^]', ['text "["', 'text "^]"']],
		['[^a b]', ['text "["', 'text "^"', 'text "a b"', 'text "]"']],
		['[^a^]', ['text "["', 'superscript', '  text "a"', 'text "]"']],
		['[^a', ['text "["', 'text "^a"']],
		['`[^1]`', ['code_span "[^1]"']],
	])('%j is no reference', (source, kids) => {
		expect(inline(source)).toEqual(kids);
	});

	test('the text of a link holds it, as it holds a link', () => {
		expect(inline('[a [^1] b](/u)')).toEqual([
			'link href="/u"',
			'  text "a "',
			'  ' + REF,
			'  text " b"',
		]);
	});

	test('brackets that are no link hold it', () => {
		expect(inline('[see [^1]]')).toEqual([
			'text "["',
			'text "see "',
			REF,
			'text "]"',
		]);
	});

	test('is literal in the alt of an image and in directive text', () => {
		expect(inline('![a [^1] b](/u)').join('\n')).not.toContain('footnote');
		expect(inline(':tag[a [^1] b]').join('\n')).not.toContain('footnote');
	});

	test('a heading, a list item and a table cell hold it', () => {
		expect(every_path('# a[^1]\n\n- b[^1]\n')).toBe(
			lines(
				'root',
				'  heading depth=1 "a[^1]"',
				'    text "a"',
				'    ' + REF,
				'  line_break',
				'  line_break',
				'  list ordered=false start=0 tight=true',
				'    list_item',
				'      text "b"',
				'      ' + REF,
				'  line_break'
			)
		);
		both('a[^1]|[^1] b', ['text "a"', REF], [REF, 'text " b"']);
	});

	test('it spans its brackets and has no text of its own', () => {
		const source = 'a[^note] b\n';
		const { nodes } = parse_markdown_svelte(source);
		const paragraph = nodes.get_node(nodes.get_node(0).children[0]);
		const ref = nodes.get_node(paragraph.children[1]);
		expect(source.slice(ref.start, ref.end)).toBe('[^note]');
		expect(ref.children).toEqual([]);
		expect(ref.metadata).toEqual({ label: 'note' });
	});
});

const DEF = (label: string, ...kids: string[]): string[] => [
	`  footnote_definition label="${label}"`,
	'    paragraph',
	...kids.map((kid) => '      ' + kid),
];

describe('a footnote definition', () => {
	test('is a block that holds a paragraph', () => {
		expect(every_path('[^1]: The *source*.\n')).toBe(
			lines(
				'root',
				...DEF(
					'1',
					'text "The "',
					'strong_emphasis',
					'  text "source"',
					'text "."'
				),
				'  line_break'
			)
		);
	});

	test('its paragraph goes on over the next lines, indented or not', () => {
		expect(every_path('[^1]: one\ntwo\n    three\n\nafter\n')).toBe(
			lines(
				'root',
				...DEF(
					'1',
					'text "one"',
					'soft_break',
					'text "two"',
					'soft_break',
					'text "three"'
				),
				'  line_break',
				'  line_break',
				'  paragraph',
				'    text "after"',
				'  line_break'
			)
		);
	});

	test('ends a paragraph, so two definitions on two lines are two', () => {
		expect(every_path('text\n[^1]: one\n[^2]: two\n')).toBe(
			lines(
				'root',
				'  paragraph',
				'    text "text"',
				'  line_break',
				...DEF('1', 'text "one"'),
				'  line_break',
				...DEF('2', 'text "two"'),
				'  line_break'
			)
		);
	});

	test('a blank line ends it, what follows is no part of it', () => {
		expect(every_path('[^1]: one\n\n    two\n')).toBe(
			lines(
				'root',
				...DEF('1', 'text "one"'),
				'  line_break',
				'  line_break',
				'  paragraph',
				'    text "two"',
				'  line_break'
			)
		);
	});

	test('a block on the next line ends it', () => {
		expect(every_path('[^1]: one\n# two\n')).toBe(
			lines(
				'root',
				...DEF('1', 'text "one"'),
				'  line_break',
				'  heading depth=1 "two"',
				'    text "two"',
				'  line_break'
			)
		);
	});

	test('holds a reference, a link and a label with any character but a bracket', () => {
		expect(every_path('[^a.b]: see[^2] and [x](/u)\n')).toBe(
			lines(
				'root',
				...DEF(
					'a.b',
					'text "see"',
					'footnote_reference label="2"',
					'text " and "',
					'link href="/u"',
					'  text "x"'
				),
				'  line_break'
			)
		);
	});

	test.each([
		['[^1]:', ['footnote_reference label="1"', 'text ":"']],
		['[^1]:   ', ['footnote_reference label="1"', 'text ":   "']],
		['[^1] : a', ['footnote_reference label="1"', 'text " : a"']],
		['\\[^1]: a', ['text "["', 'text "^"', 'text "1"', 'text "]: a"']],
		['[^a b]: c', ['text "["', 'text "^"', 'text "a b"', 'text "]: c"']],
	])('%j is no definition', (source, kids) => {
		expect(inline(source)).toEqual(kids);
	});

	test('a link reference definition can not start with a caret', () => {
		expect(every_path('[^note]: Word\n\n[x][^note]\n')).toBe(
			lines(
				'root',
				...DEF('note', 'text "Word"'),
				'  line_break',
				'  line_break',
				'  paragraph',
				'    text "[x"',
				'    text "]"',
				'    footnote_reference label="note"',
				'  line_break'
			)
		);
	});

	test.each([
		[
			'a block quote',
			'> [^1]: one\n> two\n>\n> after\n',
			[
				'  block_quote',
				'    footnote_definition label="1"',
				'      paragraph',
				'        text "one"',
				'        soft_break',
				'        text "two"',
				'    line_break',
				'    paragraph',
				'      text "after"',
				'  line_break',
			],
		],
		[
			'a list item',
			'- a\n\n  [^1]: one\n  two\n\n  after\n',
			[
				'  list ordered=false start=0 tight=false',
				'    list_item',
				'      paragraph',
				'        text "a"',
				'      footnote_definition label="1"',
				'        paragraph',
				'          text "one"',
				'          soft_break',
				'          text "two"',
				'      paragraph',
				'        text "after"',
				'  line_break',
			],
		],
		[
			'an element',
			'<div>\n[^1]: one\n</div>\n',
			[
				'  html tag="div"',
				'    line_break',
				'    footnote_definition label="1"',
				'      paragraph',
				'        text "one"',
				'    line_break',
				'  line_break',
			],
		],
		[
			'a svelte block',
			'{#if a}\n[^1]: one\n{/if}\n',
			[
				'  svelte_block tag="if"',
				'    svelte_branch tag="if" "a"',
				'      line_break',
				'      footnote_definition label="1"',
				'        paragraph',
				'          text "one"',
				'      line_break',
				'  line_break',
			],
		],
		[
			'a directive',
			':::box\n[^1]: one\n:::\n',
			[
				'  directive_container name="box"',
				'    footnote_definition label="1"',
				'      paragraph',
				'        text "one"',
				'    line_break',
			],
		],
	])('%s holds it', (_, source, tree) => {
		expect(every_path(source)).toBe(lines('root', ...tree));
	});

	test('a line that leaves the block quote ends it', () => {
		expect(every_path('> [^1]: one\ntwo\n')).toBe(
			lines(
				'root',
				'  block_quote',
				'    footnote_definition label="1"',
				'      paragraph',
				'        text "one"',
				'  line_break',
				'  paragraph',
				'    text "two"',
				'  line_break'
			)
		);
	});

	test('it ends a table', () => {
		expect(every_path('| a |\n|---|\n| b |\n[^1]: one\n')).toBe(
			lines(
				'root',
				'  table alignments=["none"] col_count=1',
				'    table_header',
				'      table_cell',
				'        text "a"',
				'    table_row',
				'      table_cell',
				'        text "b"',
				...DEF('1', 'text "one"'),
				'  line_break'
			)
		);
	});

	test('the node spans its line and its paragraph starts at the text', () => {
		const source = '[^note]:   one\ntwo\n\nafter\n';
		const { nodes } = parse_markdown_svelte(source);
		const definition = nodes.get_node(nodes.get_node(0).children[0]);
		expect(definition.kind).toBe('footnote_definition');
		expect(definition.metadata).toEqual({ label: 'note' });
		expect(source.slice(definition.start, definition.end)).toBe(
			'[^note]:   one\ntwo'
		);
		const paragraph = nodes.get_node(definition.children[0]);
		expect(source.slice(paragraph.start, paragraph.end)).toBe('one\ntwo');
	});
});

test('a parse notes that it made a footnote, once', () => {
	take_footnote();
	parse_markdown_svelte('a [b](c) ^d^ \\[^e]\n');
	expect(take_footnote()).toBe(false);
	parse_markdown_svelte('a[^1]\n');
	expect(take_footnote()).toBe(true);
	expect(take_footnote()).toBe(false);
	parse_markdown_svelte('[^1]: a\n');
	expect(take_footnote()).toBe(true);
});
