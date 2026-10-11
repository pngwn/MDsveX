import { describe, expect, test } from 'vitest';

import { both, checked_tree, lines } from './stream_shape';

describe('whitespace after an inline node that starts a table cell', () => {
	test('after emphasis', () => {
		both('*b* c', ['strong_emphasis', '  text "b"', 'text " c"']);
		both('_b_ c', ['emphasis', '  text "b"', 'text " c"']);
		both('~b~ c', ['subscript', '  text "b"', 'text " c"']);
	});

	test('in a padded cell', () => {
		both(' *b* c ', ['strong_emphasis', '  text "b"', 'text " c"']);
	});

	test('before a char that is not plain text', () => {
		both('_b_ #c', ['emphasis', '  text "b"', 'text " #c"']);
		both('*b* `c', [
			'strong_emphasis',
			'  text "b"',
			'text " "',
			'text "`"',
			'text "c"',
		]);
	});

	test('more than one space, and a tab', () => {
		both('*b*  c', ['strong_emphasis', '  text "b"', 'text "  c"']);
		both('*b*\tc', ['strong_emphasis', '  text "b"', 'text "\tc"']);
	});

	test('after a link, an image and an element', () => {
		both('[b](u) c', ['link href="u"', '  text "b"', 'text " c"']);
		both('![b](u) c', ['image src="u"', '  text "b"', 'text " c"']);
		both('<b>y</b> c', ['html tag="b"', '  text "y"', 'text " c"']);
	});

	test('between two inline nodes', () => {
		both('*b* _c_', [
			'strong_emphasis',
			'  text "b"',
			'text " "',
			'emphasis',
			'  text "c"',
		]);
	});

	test('in a later cell of the row', () => {
		both(
			'a|*b* c',
			['text "a"'],
			['strong_emphasis', '  text "b"', 'text " c"']
		);
	});

	test('in the header of a table after a body row, and after none', () => {
		const header = [
			'    table_header',
			'      table_cell',
			'        strong_emphasis',
			'          text "b"',
			'        text " c"',
		];
		const table = '  table alignments=["none"] col_count=1';
		expect(checked_tree('|*b* c|\n|-|\n|y|\n\n|*b* c|\n|-|\n')).toBe(
			lines(
				'root',
				table,
				...header,
				'    table_row',
				'      table_cell',
				'        text "y"',
				'  line_break',
				table,
				...header
			)
		);
	});
});
