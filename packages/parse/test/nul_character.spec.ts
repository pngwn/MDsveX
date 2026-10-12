import { describe, expect, test } from 'vitest';

import { PFMParser, ParseStallError } from '../src/main';
import { TreeBuilder } from '../src/tree_builder';
import { every_path, lines } from './stream_shape';

describe('a nul character', () => {
	test.each([
		[
			'# a\0b\n\npara\n',
			[
				'  heading depth=1 "a\0b"',
				'    text "a\0b"',
				'  line_break',
				'  line_break',
				'  paragraph',
				'    text "para"',
				'  line_break',
			],
		],
		[
			'a\0b\n\npara\n',
			[
				'  paragraph',
				'    text "a\0b"',
				'  line_break',
				'  line_break',
				'  paragraph',
				'    text "para"',
				'  line_break',
			],
		],
		[
			'> a\0b\n',
			['  block_quote', '    paragraph', '      text "a\0b"', '  line_break'],
		],
		[
			'*a\0b*\n',
			[
				'  paragraph',
				'    strong_emphasis',
				'      text "a\0b"',
				'  line_break',
			],
		],
		[
			'`a\0b` c\n',
			['  paragraph', '    code_span "a\0b"', '    text " c"', '  line_break'],
		],
		['\0\n', ['  paragraph', '    text "\0"', '  line_break']],
		[
			'a\n\0',
			['  paragraph', '    text "a"', '    soft_break', '    text "\0"'],
		],
	])('%j is text and the document goes on', (source, rows) => {
		expect(every_path(source)).toBe(lines('root', ...rows));
	});

	test('keeps a table whole', () => {
		expect(every_path('| a\0 | b |\n|-|-|\n| c | d\0 |\n| e | f |\n')).toBe(
			lines(
				'root',
				'  table alignments=["none","none"] col_count=2',
				'    table_header',
				'      table_cell',
				'        text "a\0"',
				'      table_cell',
				'        text "b"',
				'    table_row',
				'      table_cell',
				'        text "c"',
				'      table_cell',
				'        text "d\0"',
				'    table_row',
				'      table_cell',
				'        text "e"',
				'      table_cell',
				'        text "f"'
			)
		);
	});

	test.each([
		'- a\0b\n- c\n',
		'\0# a\n\nb\n',
		'#\0 a\n\nb\n',
		'```\0js\na\0\n```\n\nb\n',
		'<b a="\0">\0</b> c\n\nd\n',
		'<\0b>c</b>\n\nd\n',
		'{a\0} b\n\nc\n',
		'[a\0](/u\0 "t\0") b\n\nc\n',
		':::no\0te\na\n:::\n\nb\n',
		'::note[a\0b]\n\nc\n',
		'a\\\0b\n\nc\n',
		'a\n\0\n\0\nb\n',
		'> \0\n> a\n',
		'\0',
		'\0\0\0\n\0',
	])('%j is the same tree whole, fed and over the wire', (source) => {
		const tree = every_path(source);
		const last = source.trimEnd().split('\n').pop()!;
		if (/^[a-z]$/.test(last)) expect(tree).toContain(`text "${last}"`);
	});
});

describe('the loop guard', () => {
	test('throws a typed error in place of a truncated tree', () => {
		const parser = new PFMParser(new TreeBuilder(16));
		// a block that says it opened and reads nothing, as a parser bug would
		(parser as any).block_start = () => 1;
		let thrown: unknown;
		try {
			parser.parse('a\n\n# b\n');
		} catch (error) {
			thrown = error;
		}
		expect(thrown).toBeInstanceOf(ParseStallError);
		expect((thrown as ParseStallError).name).toBe('ParseStallError');
		expect((thrown as ParseStallError).offset).toBe(3);
	});
});
