import { describe, expect, test } from 'vitest';

import { every_path, lines } from './stream_shape';

describe('an unclosed tag with a value over lines is text to its end', () => {
	test('when a list opens after its paragraph', () => {
		expect(every_path('<d>^<s c="\nq">\n\n7. _\n')).toBe(
			lines(
				'root',
				'  paragraph',
				'    text "<d>"',
				'    text "^"',
				'    text "<s c=\\"\\nq\\">"',
				'  line_break',
				'  line_break',
				'  list ordered=true start=7 tight=true',
				'    list_item',
				'      text "_"',
				'  line_break'
			)
		);
		expect(every_path('<d>^<s c="\nq">\n\n- a\n')).toBe(
			lines(
				'root',
				'  paragraph',
				'    text "<d>"',
				'    text "^"',
				'    text "<s c=\\"\\nq\\">"',
				'  line_break',
				'  line_break',
				'  list ordered=false start=0 tight=true',
				'    list_item',
				'      text "a"',
				'  line_break'
			)
		);
	});

	test('when a block quote opens after it in a list item', () => {
		expect(every_path('- <d>^<s c="\n  q">\n\n  > a\n\nb\n')).toBe(
			lines(
				'root',
				'  list ordered=false start=0 tight=true',
				'    list_item',
				'      text "<d>"',
				'      text "^"',
				'      text "<s c=\\"\\n  q\\">"',
				'      line_break',
				'      line_break',
				'      block_quote',
				'        paragraph',
				'          text "a"',
				'      line_break',
				'  line_break',
				'  paragraph',
				'    text "b"',
				'  line_break'
			)
		);
	});

	test('with an expression for the value', () => {
		expect(every_path('<d>^<s c={a\nb}>\n\n- a\n')).toBe(
			lines(
				'root',
				'  paragraph',
				'    text "<d>"',
				'    text "^"',
				'    text "<s c={a\\nb}>"',
				'  line_break',
				'  line_break',
				'  list ordered=false start=0 tight=true',
				'    list_item',
				'      text "a"',
				'  line_break'
			)
		);
	});
});
