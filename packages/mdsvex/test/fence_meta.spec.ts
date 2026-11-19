import { describe, expect, test } from 'vitest';

import { compile, fence_meta } from '../src/compile';
import type { FenceMeta, ParsePlugin } from '../src/compile';

describe('fence_meta', () => {
	test('splits the language from the meta and reads its parts', () => {
		expect(
			fence_meta('ts [app.ts] {1,3} wrap tab=2 src=./app.ts#L1-L9')
		).toEqual({
			lang: 'ts',
			meta: '[app.ts] {1,3} wrap tab=2 src=./app.ts#L1-L9',
			title: 'app.ts',
			src: './app.ts#L1-L9',
			props: [
				['wrap', true],
				['tab', '2'],
			],
			parts: ['[app.ts]', '{1,3}', 'wrap', 'tab=2', 'src=./app.ts#L1-L9'],
		});
	});

	test.each<[string, string | undefined, Partial<FenceMeta>]>([
		['no info string', '', { lang: '', meta: '' }],
		['a node that is no fence', undefined, { lang: '', meta: '' }],
		['a language alone', 'js', { lang: 'js', meta: '' }],
		[
			'a tab after the language',
			'js\ttwoslash',
			{ lang: 'js', meta: 'twoslash' },
		],
		[
			'a quoted title with spaces',
			'js title="my file.js" caption=\'a "b"\'',
			{ title: 'my file.js', caption: 'a "b"', props: [] },
		],
		[
			'a bracket title with spaces',
			'js [my file.js] flag',
			{ title: 'my file.js', props: [['flag', true]] },
		],
		[
			'the first of two titles',
			'js [one] title="two"',
			{ title: 'one', parts: ['[one]', 'title="two"'] },
		],
		[
			'what the highlighter claims, which is no prop',
			'js {1,3-5} /word/ twoslash eval :line-numbers=4 showLineNumbers',
			{
				props: [],
				parts: [
					'{1,3-5}',
					'/word/',
					'twoslash',
					'eval',
					':line-numbers=4',
					'showLineNumbers',
				],
			},
		],
		[
			'a quoted src',
			'ts src="./my file.ts" [x]',
			{ lang: 'ts', src: './my file.ts', title: 'x', props: [] },
		],
		[
			'src with no language',
			'src=./a.ts wrap',
			{
				lang: '',
				meta: 'src=./a.ts wrap',
				src: './a.ts',
				props: [['wrap', true]],
			},
		],
		[
			'an expression value, which is no prop yet',
			'js max={limit} min=1',
			{ props: [['min', '1']] },
		],
	])('%s', (_name, info, expected) => {
		expect(fence_meta(info)).toMatchObject(expected);
	});

	test('a plugin reads the info string of a fence at its open', () => {
		const seen: FenceMeta[] = [];
		const read: ParsePlugin = {
			code_fence: {
				parse(node) {
					const meta = fence_meta(node.info);
					seen.push(meta);
					if (meta.title !== undefined) node.attrs['data-title'] = meta.title;
				},
			},
		};
		const { code } = compile(
			'```ts [app.ts] wrap\nlet a;\n```\n\n```\nplain\n```\n',
			{ parse_plugins: [read] }
		);
		expect(seen.map((m) => [m.lang, m.title, m.props])).toEqual([
			['ts', 'app.ts', [['wrap', true]]],
			['', undefined, []],
		]);
		// the language is the one the fence renders with
		expect(code).toContain('class="language-ts"');
	});
});
