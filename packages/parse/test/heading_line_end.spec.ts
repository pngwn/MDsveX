import { describe, expect, test } from 'vitest';

import { every_path, lines } from './stream_shape';

describe('a construct at the end of a heading line', () => {
	test.each([
		['<!--', ['text "<"', 'text "!--"'], '--> b', ['text "--> b"']],
		['{b', ['text "{b"'], '} c', ['text "} c"']],
		['{@html b', ['text "{@html b"'], '} c', ['text "} c"']],
		['<i', ['text "<i"'], 'x="y">b</i>', ['text "x=\\"y\\">b"', 'text "</i>"']],
		['<i x="', ['text "<i x=\\""'], '">b', ['text "\\">b"']],
		[
			'<script>',
			['text "<script>"'],
			'x</script>',
			['text "x"', 'text "</script>"'],
		],
		['<style>', ['text "<style>"'], '</style>', ['text "</style>"']],
	])(
		'%j ends with the heading and the next line is a paragraph',
		(open, last, next, para) => {
			expect(every_path(`# a ${open}\n${next}\n`)).toBe(
				lines(
					'root',
					`  heading depth=1 "a ${open.replace(/"/g, '\\"')}"`,
					'    text "a "',
					...last.map((kid) => `    ${kid}`),
					'  line_break',
					'  paragraph',
					...para.map((kid) => `    ${kid}`),
					'  line_break'
				)
			);
		}
	);

	test('the heading of a block quote ends on its line', () => {
		expect(every_path('> # a <!--\n> --> b\n')).toBe(
			lines(
				'root',
				'  block_quote',
				'    heading depth=1 "a <!--"',
				'      text "a "',
				'      text "<"',
				'      text "!--"',
				'    paragraph',
				'      text "--> b"',
				'  line_break'
			)
		);
	});

	test.each([
		['<i>x</i>', ['html tag="i"', '  text "x"']],
		['<!-- x -->', ['html_comment " x "']],
		['{x}', ['mustache "x"']],
		['{@html x}', ['svelte_tag tag="html" "x"']],
		['<script>x</script>', ['html tag="script"']],
		['<img alt="x">', ['html tag="img" alt="x" self_closing=true']],
	])('%j that ends on the line is read as before', (inline, kids) => {
		expect(every_path(`# a ${inline} b\n\nc\n`)).toBe(
			lines(
				'root',
				`  heading depth=1 "a ${inline.replace(/"/g, '\\"')} b"`,
				'    text "a "',
				...kids.map((kid) => `    ${kid}`),
				'    text " b"',
				'  line_break',
				'  line_break',
				'  paragraph',
				'    text "c"',
				'  line_break'
			)
		);
	});
});
