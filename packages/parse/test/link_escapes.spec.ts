import { describe, expect, test } from 'vitest';

import { every_path, lines } from './stream_shape';

function para(...kids: string[]): string {
	return lines(
		'root',
		'  paragraph',
		...kids.map((kid) => `    ${kid}`),
		'  line_break'
	);
}

describe('a backslash escape in a link destination or title', () => {
	test.each([
		['[a](/u\\)b "t \\" u")', 'href="/u)b" title="t \\" u"'],
		["[a](/u 't \\' u')", 'href="/u" title="t \' u"'],
		['[a](/u (t \\) u))', 'href="/u" title="t ) u"'],
		['[a](</u\\)b>)', 'href="/u)b"'],
		['[a](/u\\\\b)', 'href="/u\\\\b"'],
		['[a](/u\\*b "\\*t\\*")', 'href="/u*b" title="*t*"'],
		['[a](/u\\(b\\))', 'href="/u(b)"'],
	])('%j gives the character alone', (source, attrs) => {
		expect(every_path(`${source}\n`)).toBe(para(`link ${attrs}`, '  text "a"'));
	});

	test('is the same for an image', () => {
		expect(every_path('![a](/u\\)b "t \\" u")\n')).toBe(
			para('image src="/u)b" title="t \\" u"', '  text "a"')
		);
	});

	test('is the same in a link reference definition', () => {
		expect(every_path('[x]: /u\\)b "t \\" u"\n\n[a][x] ![b][x]\n')).toBe(
			lines(
				'root',
				'  definition label="x" href="/u)b" title="t \\" u"',
				'  line_break',
				'  paragraph',
				'    link href="/u)b" title="t \\" u"',
				'      text "a"',
				'    text " "',
				'    image src="/u)b" title="t \\" u"',
				'      text "b"',
				'  line_break'
			)
		);
	});

	test('keeps a backslash before a character that is no punctuation', () => {
		expect(every_path('[a](/u\\qb "t \\q u")\n')).toBe(
			para('link href="/u\\\\qb" title="t \\\\q u"', '  text "a"')
		);
	});

	test.each([
		['[a](/u "\\{t\\}")', 'href="/u" title="&#123;t&#125;"'],
		['[a](/\\{u\\})', 'href="/&#123;u&#125;"'],
		['[a](/u?b\\&amp;c)', 'href="/u?b&amp;amp;c"'],
	])(
		'%j keeps a brace and an ampersand literal as a character reference',
		(source, attrs) => {
			expect(every_path(`${source}\n`)).toBe(
				para(`link ${attrs}`, '  text "a"')
			);
		}
	);

	test('leaves a brace that is not escaped as the expression it is', () => {
		expect(every_path('[a](/{u} "{t}")\n')).toBe(
			para('link href="/{u}" title="{t}"', '  text "a"')
		);
	});
});

describe('a backslash before a space or a line end in a destination', () => {
	const DEFINED = (title: string): string =>
		`  definition label="a" href="/u\\\\"${title}`;

	const LINK = (attrs: string): string[] => [
		'  paragraph',
		`    link ${attrs}`,
		'      text "x"',
		'  line_break',
	];

	test('is literal and ends a definition destination', () => {
		expect(every_path('[a]: /u\\\n\n[x][a]\n')).toBe(
			lines('root', DEFINED(''), '  line_break', ...LINK('href="/u\\\\"'))
		);
		expect(every_path('[a]: /u\\ "t"\n\n[x][a]\n')).toBe(
			lines(
				'root',
				DEFINED(' title="t"'),
				'  line_break',
				...LINK('href="/u\\\\" title="t"')
			)
		);
	});

	test('leaves the next line to be the title', () => {
		expect(every_path('[a]: /u\\\n"t"\n\n[x][a]\n')).toBe(
			lines(
				'root',
				DEFINED(' title="t"'),
				'  line_break',
				...LINK('href="/u\\\\" title="t"')
			)
		);
	});

	test('ends a definition in a block quote', () => {
		expect(every_path('> [a]: /u\\\n> [x][a]\n')).toBe(
			lines(
				'root',
				'  block_quote',
				'    definition label="a" href="/u\\\\"',
				'    paragraph',
				'      link href="/u\\\\"',
				'        text "x"',
				'  line_break'
			)
		);
	});

	test('does not carry an angle destination over a line end', () => {
		expect(every_path('[a]: </u\\\n>\n\n[x][a]\n')).not.toContain('link');
	});

	test('ends an inline destination, which may not go on to the next line', () => {
		expect(every_path('[x](/u\\\n)\n')).toBe(
			para('text "[x"', 'text "](/u"', 'hard_break', 'text ")"')
		);
		expect(every_path('[x](/u\\ v)\n')).not.toContain('link');
	});
});
