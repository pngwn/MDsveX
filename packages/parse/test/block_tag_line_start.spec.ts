import { describe, expect, test } from 'vitest';

import { every_path, lines, sound_tree } from './stream_shape';

describe('a block level element that starts a line', () => {
	test.each([
		['<div></div>x\n', ['html tag="div"']],
		['<div>a</div>x\n', ['html tag="div"', '  text "a"']],
		['<div>a</div> x\n', ['html tag="div"', '  text "a"']],
		['<div>[a](/u) `b` {c}</div>x\n', null],
		['<div><span>a</span></div> x\n', null],
		['<div/>x\n', ['html tag="div" self_closing=true']],
		['<hr>x\n', ['html tag="hr" self_closing=true']],
	])('%j is a block and the text after it a paragraph', (source, block) => {
		const tree = every_path(source);
		expect(tree.split('\n').slice(-3)).toEqual([
			'  paragraph',
			'    text "x"',
			'  line_break',
		]);
		if (block !== null) {
			expect(tree).toBe(
				lines(
					'root',
					...block.map((row) => `  ${row}`),
					'  paragraph',
					'    text "x"',
					'  line_break'
				)
			);
		}
	});

	test('ends where it closes, and the line after it is a paragraph of its own', () => {
		expect(every_path('<div>a</div>\nb\n')).toBe(
			lines(
				'root',
				'  html tag="div"',
				'    text "a"',
				'  line_break',
				'  paragraph',
				'    text "b"',
				'  line_break'
			)
		);
	});

	test('reads what follows its close tag as the start of a line', () => {
		expect(every_path('<div>a</div># b\n')).toBe(
			lines(
				'root',
				'  html tag="div"',
				'    text "a"',
				'  heading depth=1 "b"',
				'    text "b"',
				'  line_break'
			)
		);
		expect(every_path('<div>a</div><b>c</b> d\n')).toBe(
			lines(
				'root',
				'  html tag="div"',
				'    text "a"',
				'  paragraph',
				'    html tag="b"',
				'      text "c"',
				'    text " d"',
				'  line_break'
			)
		);
	});

	test('is the same when it runs over lines', () => {
		expect(every_path('<div>\na\n</div>x\n')).toBe(
			lines(
				'root',
				'  html tag="div"',
				'    line_break',
				'    paragraph',
				'      text "a"',
				'    line_break',
				'  paragraph',
				'    text "x"',
				'  line_break'
			)
		);
	});

	test('one that never closes is literal text in a paragraph', () => {
		expect(every_path('<div>a `</div>` b\n')).toBe(
			lines(
				'root',
				'  paragraph',
				'    text "<div>"',
				'    text "a "',
				'    code_span "</div>"',
				'    text " b"',
				'  line_break'
			)
		);
	});

	test.each([
		'> <div>a</div>x\n',
		'- <div>a</div>x\n',
		'- a\n\n- <div>a</div>x\n',
		'<section>\n<div>a</div>x\n</section>\n',
		'{#if a}\n<div>a</div>x\n{/if}\n',
		':::note\n<div>a</div>x\n:::\n',
		'<div>*a</div>x\n',
		'<div><b>a</div>x\n',
		'a\n<div>b</div>c\nd\n',
	])('%j holds no text right under a container', (source) => {
		sound_tree(source);
	});

	test('one later in a paragraph is a tag like any other', () => {
		expect(every_path('<Badge /> <div>a</div>\n')).toBe(
			lines(
				'root',
				'  html tag="Badge" self_closing=true',
				'  text " "',
				'  html tag="div"',
				'    text "a"',
				'  line_break'
			)
		);
		expect(every_path('<Badge /> <div>a</div> x\n')).toBe(
			lines(
				'root',
				'  paragraph',
				'    html tag="Badge" self_closing=true',
				'    text " "',
				'    html tag="div"',
				'      text "a"',
				'    text " x"',
				'  line_break'
			)
		);
	});
});
