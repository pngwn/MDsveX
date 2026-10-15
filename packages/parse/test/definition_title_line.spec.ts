import { describe, expect, test } from 'vitest';

import { every_path, lines } from './stream_shape';

const DEFINED = (title?: string): string =>
	`  definition label="foo" href="/url"${title === undefined ? '' : ` title="${title}"`}`;

const LINK = (title?: string): string[] => [
	'  paragraph',
	`    link href="/url"${title === undefined ? '' : ` title="${title}"`}`,
	'      text "x"',
	'  line_break',
];

describe('a line after a definition that starts like a title', () => {
	test('text after the title leaves the definition without one', () => {
		expect(every_path('[foo]: /url\n"title" ok\n\n[x][foo]\n')).toBe(
			lines(
				'root',
				DEFINED(),
				'  paragraph',
				'    text "\\"title\\" ok"',
				'  line_break',
				'  line_break',
				...LINK()
			)
		);
	});

	test('with single quotes and with parentheses', () => {
		expect(every_path("[foo]: /url\n'title' ok\n\n[x][foo]\n")).toBe(
			lines(
				'root',
				DEFINED(),
				'  paragraph',
				'    text "\'title\' ok"',
				'  line_break',
				'  line_break',
				...LINK()
			)
		);
		expect(every_path('[foo]: /url\n(title) ok\n\n[x][foo]\n')).toBe(
			lines(
				'root',
				DEFINED(),
				'  paragraph',
				'    text "(title) ok"',
				'  line_break',
				'  line_break',
				...LINK()
			)
		);
	});

	test('a title over two lines with text after it', () => {
		expect(every_path('[foo]: /url\n"title\nmore" ok\n\n[x][foo]\n')).toBe(
			lines(
				'root',
				DEFINED(),
				'  paragraph',
				'    text "\\"title"',
				'    soft_break',
				'    text "more\\" ok"',
				'  line_break',
				'  line_break',
				...LINK()
			)
		);
	});

	test('a title alone on the line is the title', () => {
		expect(every_path('[foo]: /url\n"title"\n\n[x][foo]\n')).toBe(
			lines('root', DEFINED('title'), '  line_break', ...LINK('title'))
		);
	});

	test('spaces after the title are not text', () => {
		expect(every_path('[foo]: /url\n"title"  \n\n[x][foo]\n')).toBe(
			lines('root', DEFINED('title'), '  line_break', ...LINK('title'))
		);
	});

	test('the last line of the document, which uses the definition', () => {
		expect(every_path('[foo]: /url\n"title" [x][foo]')).toBe(
			lines(
				'root',
				DEFINED(),
				'  paragraph',
				'    text "\\"title\\" "',
				'    link href="/url"',
				'      text "x"'
			)
		);
	});
});
