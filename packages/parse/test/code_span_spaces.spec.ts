import { describe, expect, test } from 'vitest';

import { both, every_path, lines } from './stream_shape';

function span(source: string): string {
	return every_path(`a ${source} b\n`);
}

function para(code: string): string {
	return lines(
		'root',
		'  paragraph',
		'    text "a "',
		`    code_span ${JSON.stringify(code)}`,
		'    text " b"',
		'  line_break'
	);
}

describe('a code span of only spaces', () => {
	test.each([1, 2, 3, 4, 7])('keeps all %i of them', (count) => {
		const spaces = ' '.repeat(count);
		expect(span(`\`${spaces}\``)).toBe(para(spaces));
		expect(span(`\`\`${spaces}\`\``)).toBe(para(spaces));
	});

	test.each([
		['` a `', 'a'],
		['`  a  `', ' a '],
		['`   a `', '  a'],
		['`` ` ``', '`'],
		['` a`', ' a'],
		['`a `', 'a '],
	])('%j still loses one space on each side as padding', (source, code) => {
		expect(span(source)).toBe(para(code));
	});

	test('keeps them in a heading', () => {
		expect(every_path('# a `   ` b\n')).toBe(
			lines(
				'root',
				'  heading depth=1 "a `   ` b"',
				'    text "a "',
				'    code_span "   "',
				'    text " b"',
				'  line_break'
			)
		);
	});

	test.each([3, 4])('keeps all %i of them in a table cell', (count) => {
		const spaces = ' '.repeat(count);
		both(`x\`${spaces}\`y`, [
			'text "x"',
			`code_span ${JSON.stringify(spaces)}`,
			'text "y"',
		]);
		both(`x\`\`${spaces}\`\`y`, [
			'text "x"',
			`code_span ${JSON.stringify(spaces)}`,
			'text "y"',
		]);
	});
});
