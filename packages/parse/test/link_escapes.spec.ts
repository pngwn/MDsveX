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
