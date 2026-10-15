import { execFileSync } from 'node:child_process';
import {
	mkdirSync,
	mkdtempSync,
	realpathSync,
	rmSync,
	symlinkSync,
	utimesSync,
	writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
	count_words,
	page_data,
	PageDataError,
} from '@mdsvex/plugin-page-data';
import type { PageData, PageDataOptions } from '@mdsvex/plugin-page-data';
import { compile, compile_async, mdsvex, PluginAsyncError } from 'mdsvex';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';

import { PATHS } from '../../../packages/parse/test/plugin_harness';
import { write_app } from '../../test/app';

const HERE = dirname(fileURLToPath(import.meta.url));

type Options = Parameters<typeof compile>[1];

function run(source: string, options?: PageDataOptions, more?: Options) {
	return compile(source, {
		plugins: [page_data(options)],
		// the documents here use directives no component is given for
		strict_directives: false,
		...more,
	});
}

function page(
	source: string,
	options?: PageDataOptions,
	more?: Options
): PageData {
	return (run(source, options, more).data?.page ?? {}) as PageData;
}

function codes(source: string, options?: PageDataOptions, more?: Options) {
	return (run(source, options, more).warnings ?? []).map(
		(warning) => warning.code
	);
}

function words(source: string): number | undefined {
	return page(source).words;
}

function excerpt(
	source: string,
	options?: PageDataOptions['excerpt']
): string | undefined {
	return page(source, { excerpt: options }).excerpt;
}

function thrown(make: () => unknown): any {
	try {
		make();
	} catch (error) {
		return error;
	}
	return undefined;
}

/** a paragraph of this many words */
function prose(count: number): string {
	return Array.from({ length: count }, () => 'word').join(' ') + '\n';
}

describe('data', () => {
	test('every part is on but the edit url', () => {
		expect(
			run('# A *title*\n\nThe first paragraph.\n\nThe second one.\n').data
		).toEqual({
			page: {
				title: 'A title',
				excerpt: 'The first paragraph.',
				words: 8,
				minutes: 1,
			},
		});
	});

	test('the document exports it as plugin_data', () => {
		expect(run('Some words.\n').code).toContain(
			'export const plugin_data = {"page":{"excerpt":"Some words.","words":2,"minutes":1}};'
		);
	});

	test('an empty document has no page key', () => {
		expect(run('').data).toBeUndefined();
		expect(run('\n\n').data).toBeUndefined();
	});

	test('a document with nothing to read has no words and no other key', () => {
		for (const source of [
			'```js\nlet a = 1;\n```\n',
			'---\ndraft: true\n---\n',
			'<!-- a note -->\n',
			'***\n',
			'<script>\n\tlet a = 1;\n</script>\n',
		]) {
			expect(page(source), source).toEqual({ words: 0, minutes: 0 });
		}
	});

	test('one plugin serves many documents', () => {
		const plugins = [page_data()];
		const of = (source: string) => compile(source, { plugins }).data?.page;
		expect(of('# One\n\nfirst\n')).toEqual({
			title: 'One',
			excerpt: 'first',
			words: 2,
			minutes: 1,
		});
		expect(of('second doc\n')).toEqual({
			excerpt: 'second doc',
			words: 2,
			minutes: 1,
		});
	});
});

describe('words', () => {
	test('headings, paragraphs, list items, quotes and table cells are prose', () => {
		expect(
			words(
				[
					'# One two',
					'',
					'three four',
					'',
					'- five',
					'- six seven',
					'',
					'> eight',
					'',
					'| nine | ten |',
					'| --- | --- |',
					'| eleven | twelve thirteen |',
					'',
				].join('\n')
			)
		).toBe(13);
	});

	test('a code block is not counted, code in a sentence is', () => {
		expect(
			words('Run `npm install` first.\n\n```sh\nnpm install mdsvex\n```\n')
		).toBe(4);
	});

	test('markup, attributes, comments and expressions are not words', () => {
		expect(
			words(
				'One <span class="a b c" title="d e">two</span> <!-- three four --> {five + six} [seven](/eight "nine ten")\n'
			)
		).toBe(3);
	});

	test('the alt of an image is not read, a script and a style are not prose', () => {
		expect(
			words(
				'![three words here](a.png) one\n\n<script>\n\tlet a = 1;\n</script>\n\n<style>\n\tp { color: red; }\n</style>\n'
			)
		).toBe(1);
	});

	test('a word that markup splits is one word', () => {
		expect(words('un*believ*able re`act`ive [link](/a)ed\n')).toBe(3);
	});

	test('the lines of a paragraph are apart, with a soft or a hard break', () => {
		expect(words('one\ntwo\\\nthree\n')).toBe(3);
	});

	test('the last word of a block and the first of the next are two', () => {
		expect(
			words('# one\n## two\n- three\n- four\n\n| a |\n|---|\n| b |\n')
		).toBe(6);
	});

	test('what a container, an element, a component or a block holds is counted', () => {
		expect(
			words(
				':::note[one two]\nthree\n:::\n\n<div>\n\nfour five\n\n</div>\n\n<Card>six</Card>\n\n{#if open}\n\nseven\n\n{/if}\n'
			)
		).toBe(7);
	});

	test('a character reference is one character', () => {
		expect(words('a &amp; b&nbsp;c &#x4e2d;&#25991;\n')).toBe(6);
	});

	test('each cjk character is a word and the punctuation after it is none', () => {
		expect(words('你好,世界。\n')).toBe(4);
		expect(words('こんにちは、世界\n')).toBe(7);
		expect(words('안녕하세요 world\n')).toBe(6);
		expect(words('mdsvex は速い\n')).toBe(4);
	});

	test('minutes are the words over 200, to two decimals and then up', () => {
		expect(page('').minutes).toBeUndefined();
		expect(page(prose(1)).minutes).toBe(1);
		expect(page(prose(200)).minutes).toBe(1);
		// 1.005 minutes is 1.00 to two decimals, as reading-time has it
		expect(page(prose(201)).minutes).toBe(1);
		expect(page(prose(202)).minutes).toBe(2);
		expect(page(prose(1000)).minutes).toBe(5);
	});

	test('words_per_minute sets the pace', () => {
		const slow = { reading_time: { words_per_minute: 100 } };
		expect(page(prose(250), slow)).toMatchObject({ words: 250, minutes: 3 });
		expect(
			page(prose(250), { reading_time: { words_per_minute: 250 } }).minutes
		).toBe(1);
	});

	test('reading_time false leaves both out', () => {
		expect(page('some words\n', { reading_time: false })).toEqual({
			excerpt: 'some words',
		});
	});
});

describe('count_words', () => {
	test('counts as reading-time does', () => {
		expect(count_words('')).toBe(0);
		expect(count_words('  \n\t ')).toBe(0);
		expect(count_words('one')).toBe(1);
		expect(count_words(' one  two\nthree\t')).toBe(3);
		expect(count_words('a - b')).toBe(3);
		expect(count_words('well-known co.uk')).toBe(2);
		expect(count_words('中文')).toBe(2);
		expect(count_words('中文, hello')).toBe(3);
		expect(count_words('hello中文world')).toBe(4);
		expect(count_words('中 。 a')).toBe(2);
		expect(count_words('カタカナ')).toBe(1);
		expect(count_words(String.fromCodePoint(0x20000) + 'a')).toBe(2);
	});
});

describe('excerpt', () => {
	test('the first paragraph as plain text', () => {
		expect(
			excerpt(
				'# Title\n\nAn *intro* with `code`, a [link](/x) &amp; more,\nover two lines.\n\nThe rest.\n'
			)
		).toBe('An intro with code, a link & more, over two lines.');
	});

	test('a paragraph with no text is passed over', () => {
		expect(
			excerpt('![hero](hero.png)\n\n<Hero />\n\n{intro}\n\nReal text.\n')
		).toBe('Real text.');
	});

	test('a paragraph in a quote, a list, a container or a block is not the first', () => {
		expect(
			excerpt(
				'> quoted\n\n- item\n\n  more\n\n:::note\ninside\n:::\n\n{#if a}\n\nmaybe\n\n{/if}\n\nTop level.\n'
			)
		).toBe('Top level.');
	});

	test('a paragraph in an element is', () => {
		expect(
			excerpt('<section>\n\nIn a section.\n\n</section>\n\nAfter.\n')
		).toBe('In a section.');
	});

	test('a document with no paragraph has none', () => {
		expect(excerpt('# Title\n\n- a list\n')).toBeUndefined();
	});

	test('with a more comment it is everything before it, headings left out', () => {
		expect(
			excerpt(
				'# Title\n\nOne.\n\n## Section\n\nTwo\nlines.\n\n- a\n- b\n\n> c\n\n<!-- more -->\n\nThree.\n'
			)
		).toBe('One. Two lines. a b c');
	});

	test('a footnote is no part of it, its number neither', () => {
		const source =
			'[^1]: The note.\n\nA claim[^1] made.\n\n[^b]: Second note.\n\nMore[^b].\n';
		expect(excerpt(source)).toBe('A claim made.');
		expect(excerpt(source.replace('More', '<!-- more -->\n\nMore'))).toBe(
			'A claim made.'
		);
		expect(page(source).words).toBe(8);
	});

	test('code blocks and tables are no part of it', () => {
		expect(
			excerpt(
				'One.\n\n```js\ncode\n```\n\n| a | b |\n|---|---|\n| c | d |\n\nTwo.\n\n<!--more-->\n\nThree.\n'
			)
		).toBe('One. Two.');
	});

	test('a more comment inside a paragraph cuts it there', () => {
		expect(excerpt('One.\n\nTwo and <!-- more --> the rest.\n\nThree.\n')).toBe(
			'One. Two and'
		);
	});

	test('a more comment in a list item or a quote counts', () => {
		expect(excerpt('Intro.\n\n- a\n- b <!-- more -->\n- c\n\nRest.\n')).toBe(
			'Intro. a b'
		);
		expect(excerpt('Intro.\n\n> a\n> <!-- more -->\n> b\n')).toBe('Intro. a');
	});

	test('only the first more comment counts, any other comment does not', () => {
		expect(
			excerpt(
				'One.\n\n<!-- less -->\n\nTwo.\n\n<!-- more -->\n\nThree.\n\n<!-- more -->\n'
			)
		).toBe('One. Two.');
	});

	test('a more comment with nothing before it leaves no excerpt', () => {
		expect(excerpt('<!-- more -->\n\nText.\n')).toBeUndefined();
		expect(excerpt('# Title\n\n<!-- more -->\n\nText.\n')).toBeUndefined();
	});

	test('more in a code block is code', () => {
		expect(excerpt('One.\n\n```html\n<!-- more -->\n```\n\nTwo.\n')).toBe(
			'One.'
		);
	});

	test('max_length cuts at the end of a word and adds an ellipsis', () => {
		const source = 'The quick brown fox jumps over the lazy dog.\n';
		expect(excerpt(source, { max_length: 44 })).toBe(
			'The quick brown fox jumps over the lazy dog.'
		);
		expect(excerpt(source, { max_length: 43 })).toBe(
			'The quick brown fox jumps over the lazy\u2026'
		);
		expect(excerpt(source, { max_length: 20 })).toBe(
			'The quick brown fox\u2026'
		);
		expect(excerpt(source, { max_length: 19 })).toBe('The quick brown\u2026');
		expect(excerpt(source, { max_length: 16 })).toBe('The quick brown\u2026');
		expect(excerpt(source, { max_length: 4 })).toBe('The\u2026');
	});

	test('the cut text is never longer than max_length', () => {
		const source = 'The quick brown fox jumps over the lazy dog.\n';
		for (let max = 1; max < 44; max++) {
			const cut = excerpt(source, { max_length: max })!;
			expect(Array.from(cut).length, String(max)).toBeLessThanOrEqual(max);
			expect(cut.endsWith('\u2026'), String(max)).toBe(true);
		}
	});

	test('a word longer than the room is cut inside', () => {
		expect(excerpt('Supercalifragilistic\n', { max_length: 6 })).toBe(
			'Super\u2026'
		);
	});

	test('text with no spaces is cut between two characters', () => {
		expect(
			excerpt('吾輩は猫である。名前はまだ無い。\n', { max_length: 8 })
		).toBe('吾輩は猫である\u2026');
		expect(excerpt('a😀😀😀😀b\n', { max_length: 4 })).toBe('a😀😀\u2026');
	});

	test('ellipsis is what a cut ends with, counted in the length', () => {
		const source = 'The quick brown fox jumps.\n';
		expect(excerpt(source, { max_length: 13, ellipsis: '...' })).toBe(
			'The quick...'
		);
		expect(excerpt(source, { max_length: 9, ellipsis: '' })).toBe('The quick');
	});

	test('max_length cuts what comes before a more comment too', () => {
		expect(
			excerpt('One two.\n\nThree four.\n\n<!-- more -->\n', { max_length: 15 })
		).toBe('One two. Three\u2026');
	});

	test('excerpt false leaves it out', () => {
		expect(page('some words\n', { excerpt: false })).toEqual({
			words: 2,
			minutes: 1,
		});
	});
});

describe('title', () => {
	test('the text of the first level 1 heading', () => {
		expect(
			page(
				'text\n\n## Not this\n\n# The *real* `one` &amp; more\n\n# Not this\n'
			).title
		).toBe('The real one & more');
	});

	test('not when the frontmatter has a title', () => {
		expect(
			page('---\ntitle: Written\n---\n\n# Heading\n').title
		).toBeUndefined();
		expect(page('---\ntitle: 2024\n---\n\n# Heading\n').title).toBeUndefined();
	});

	test('when the frontmatter has other keys, or an empty title', () => {
		expect(page('---\ndate: 2024-01-01\n---\n\n# Heading\n').title).toBe(
			'Heading'
		);
		expect(page('---\ntitle: ""\n---\n\n# Heading\n').title).toBe('Heading');
		expect(page('---\ntitle:\n---\n\n# Heading\n').title).toBe('Heading');
	});

	test('it never goes into metadata', () => {
		const result = run('---\ndate: today\n---\n\n# Heading\n');
		expect(result.metadata).toEqual({ date: 'today' });
		expect(run('# Heading\n').metadata).toBeUndefined();
	});

	test('a frontmatter parser of your own is the one asked', () => {
		const frontmatter = { parse: () => ({ title: 'From toml' }) };
		expect(
			page('---\nx\n---\n\n# Heading\n', undefined, { frontmatter }).title
		).toBeUndefined();
	});

	test('a heading in a quote, a list or a container is not the title', () => {
		expect(
			page('> # Quoted\n\n- # Listed\n\n:::note\n# Noted\n:::\n').title
		).toBeUndefined();
		expect(page('> # Quoted\n\n# Real\n').title).toBe('Real');
	});

	test('a heading with no text of its own is passed over', () => {
		expect(page('# {title}\n\n# Real\n').title).toBe('Real');
		expect(page('# {title}\n').title).toBeUndefined();
	});

	test('title false leaves it out', () => {
		expect(page('# Heading\n', { title: false }).title).toBeUndefined();
	});
});

describe('edit url', () => {
	const base = 'https://github.com/you/site/edit/main';

	function edit(
		filename: string | undefined,
		option: PageDataOptions['edit_url']
	): string | undefined {
		return page('text\n', { edit_url: option }, { filename }).edit_url;
	}

	test('off by default', () => {
		expect(
			page('text\n', undefined, { filename: '/site/a.svx' }).edit_url
		).toBeUndefined();
	});

	test('a string is the base, the path is relative to the working directory', () => {
		const file = join(process.cwd(), 'src/routes/blog/+page.svx');
		const expected = base + '/src/routes/blog/+page.svx';
		expect(edit(file, base)).toBe(expected);
		expect(edit(file, base + '/')).toBe(expected);
		expect(edit(file, base + '//')).toBe(expected);
	});

	test('a root names the directory the path is relative to', () => {
		expect(
			edit('/repo/packages/site/docs/a.svx', { base, root: '/repo' })
		).toBe(base + '/packages/site/docs/a.svx');
		expect(
			edit('/repo/packages/site/docs/a.svx', {
				base,
				root: '/repo/packages/site/',
			})
		).toBe(base + '/docs/a.svx');
	});

	test('the path is encoded as a url', () => {
		expect(edit('/repo/my docs/[slug]/día.svx', { base, root: '/repo' })).toBe(
			base + '/my%20docs/%5Bslug%5D/d%C3%ADa.svx'
		);
	});

	test('a windows path gets forward slashes', () => {
		expect(edit('C:\\repo\\docs\\a.svx', { base, root: 'C:\\repo' })).toBe(
			base + '/docs/a.svx'
		);
		expect(edit('C:/repo/docs/a.svx', { base, root: 'C:\\repo\\' })).toBe(
			base + '/docs/a.svx'
		);
	});

	test('a document outside the root has none and is reported', () => {
		const option = { base, root: '/repo/site' };
		expect(edit('/repo/other/a.svx', option)).toBeUndefined();
		expect(edit('/repo/site-two/a.svx', option)).toBeUndefined();
		expect(
			run('text\n', { edit_url: option }, { filename: '/repo/other/a.svx' })
				.warnings
		).toEqual([
			{
				plugin: 'page',
				code: 'outside_root',
				message:
					'/repo/other/a.svx is not inside /repo/site, so it has no edit url, set the root of edit_url',
				start: { line: 1, column: 0 },
			},
		]);
	});

	test('a compile with no filename has none and is reported', () => {
		expect(edit(undefined, base)).toBeUndefined();
		expect(codes('text\n', { edit_url: base })).toEqual(['no_filename']);
		expect(codes('text\n', { edit_url: () => 'x' })).toEqual(['no_filename']);
		expect(codes('text\n')).toEqual([]);
	});

	test('a function is given the filename and returns the url or nothing', () => {
		const option = (filename: string) =>
			filename.endsWith('draft.svx') ? undefined : 'edit:' + filename;
		expect(edit('/a/post.svx', option)).toBe('edit:/a/post.svx');
		expect(edit('/a/draft.svx', option)).toBeUndefined();
		expect(
			codes('text\n', { edit_url: option }, { filename: '/a/draft.svx' })
		).toEqual([]);
	});

	test('a function that returns anything else throws', () => {
		const error = thrown(() =>
			run('text\n', { edit_url: (() => 1) as any }, { filename: '/a.svx' })
		);
		expect(error).toBeInstanceOf(PageDataError);
		expect(error.message).toBe(
			'[@mdsvex/plugin-page-data] edit_url must return a string or undefined, it returned 1'
		);
	});
});

describe('last modified', () => {
	/** what a compile that waits leaves */
	async function later(
		source: string,
		options: PageDataOptions,
		more?: Options
	) {
		return compile_async(source, {
			plugins: [page_data(options)],
			...more,
		});
	}

	async function modified(
		filename: string | undefined,
		option: PageDataOptions['last_modified']
	): Promise<string | undefined> {
		const { data } = await later(
			'text\n',
			{ last_modified: option },
			{ filename }
		);
		return (data?.page as PageData | undefined)?.last_modified;
	}

	async function rejected(make: () => Promise<unknown>): Promise<any> {
		try {
			await make();
		} catch (error) {
			return error;
		}
		return undefined;
	}

	test('off by default, and compile takes the document then', () => {
		expect(page('text\n', undefined, { filename: '/a.svx' })).toEqual({
			excerpt: 'text',
			words: 1,
			minutes: 1,
		});
	});

	test('compile throws a PluginAsyncError, since the date is found later', () => {
		const error = thrown(() =>
			run('text\n', { last_modified: () => undefined }, { filename: '/a.svx' })
		);
		expect(error).toBeInstanceOf(PluginAsyncError);
	});

	describe('a function', () => {
		test('is given the filename, a Date or a string is the date as an ISO string', async () => {
			const seen: string[] = [];
			const option = async (filename: string) => {
				seen.push(filename);
				return new Date(Date.UTC(2026, 9, 15, 9, 30));
			};
			expect(await modified('/site/a.svx', option)).toBe(
				'2026-10-15T09:30:00.000Z'
			);
			expect(seen).toEqual(['/site/a.svx']);
			expect(await modified('/a.svx', () => '2026-10-15T11:30:00+02:00')).toBe(
				'2026-10-15T09:30:00.000Z'
			);
			expect(await modified('/a.svx', () => '2026-10-15')).toBe(
				'2026-10-15T00:00:00.000Z'
			);
		});

		test('nothing leaves the key out', async () => {
			const { data, warnings } = await later(
				'text\n',
				{ last_modified: async () => undefined },
				{ filename: '/a.svx' }
			);
			expect(data).toEqual({ page: { excerpt: 'text', words: 1, minutes: 1 } });
			expect(warnings).toBeUndefined();
		});

		test('the date is plain json in plugin_data', async () => {
			const { code } = await later(
				'text\n',
				{ last_modified: () => new Date(0) },
				{ filename: '/a.svx' }
			);
			expect(code).toContain(
				'export const plugin_data = {"page":{"excerpt":"text","words":1,"minutes":1,"last_modified":"1970-01-01T00:00:00.000Z"}};'
			);
		});

		test('a value that is no date rejects with a PageDataError', async () => {
			for (const [value, said] of [
				['yesterday', '"yesterday"'],
				[new Date(Number.NaN), 'an invalid Date'],
				[1700000000000, '1700000000000'],
				[null, 'null'],
			] as const) {
				const error = await rejected(() =>
					modified('/a.svx', (() => value) as any)
				);
				expect(error, said).toBeInstanceOf(PageDataError);
				expect(error.code).toBe('option');
				expect(error.message).toBe(
					`[@mdsvex/plugin-page-data] last_modified must give a date, a string a Date can read or undefined, it gave ${said}`
				);
			}
		});

		test('a compile with no filename has none and is reported', async () => {
			let called = false;
			const { data, warnings } = await later('text\n', {
				last_modified: () => {
					called = true;
					return new Date();
				},
			});
			expect(called).toBe(false);
			expect((data?.page as PageData).last_modified).toBeUndefined();
			expect(warnings?.map((w) => [w.code, w.message])).toEqual([
				[
					'no_filename',
					'the compile was given no filename, so the document has no last modified date',
				],
			]);
		});

		test('an empty document still has one', async () => {
			const { data } = await later(
				'',
				{ last_modified: () => new Date(0) },
				{ filename: '/a.svx' }
			);
			expect(data).toEqual({
				page: { last_modified: '1970-01-01T00:00:00.000Z' },
			});
		});
	});

	describe('fs', () => {
		let dir: string;
		beforeAll(() => {
			dir = mkdtempSync(join(tmpdir(), 'page-data-fs-'));
		});
		afterAll(() => rmSync(dir, { recursive: true, force: true }));

		test('is the modification time of the file', async () => {
			const file = join(dir, 'post.svx');
			writeFileSync(file, 'text\n');
			const when = new Date(Date.UTC(2025, 0, 2, 3, 4, 5));
			utimesSync(file, when, when);
			expect(await modified(file, 'fs')).toBe('2025-01-02T03:04:05.000Z');
		});

		test('a file that is not there has none and is reported', async () => {
			const file = join(dir, 'gone.svx');
			const { data, warnings } = await later(
				'text\n',
				{ last_modified: 'fs' },
				{ filename: file }
			);
			expect((data?.page as PageData).last_modified).toBeUndefined();
			expect(warnings?.map((w) => [w.code, w.message])).toEqual([
				['not_found', `${file} is not a file, so it has no last modified date`],
			]);
		});
	});

	describe('git', () => {
		let repo: string;

		function git(cwd: string, args: string[], date?: string) {
			return execFileSync(
				'git',
				[
					'-c',
					'user.name=Test',
					'-c',
					'user.email=test@example.com',
					'-c',
					'commit.gpgsign=false',
					...args,
				],
				{
					cwd,
					env: {
						...process.env,
						...(date && { GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date }),
					},
					stdio: ['ignore', 'pipe', 'pipe'],
				}
			).toString();
		}

		function commit(cwd: string, files: Record<string, string>, date: string) {
			for (const [name, text] of Object.entries(files)) {
				mkdirSync(dirname(join(cwd, name)), { recursive: true });
				writeFileSync(join(cwd, name), text);
			}
			git(cwd, ['add', '.']);
			git(cwd, ['commit', '-q', '-m', 'change'], date);
		}

		beforeAll(() => {
			// the real path, as git and vite give it, tmpdir is a link on macos
			repo = realpathSync.native(mkdtempSync(join(tmpdir(), 'page-data-git-')));
			git(repo, ['init', '-q']);
			commit(
				repo,
				{ 'a.svx': 'a\n', 'docs/b.svx': 'b\n', 'docs/old.svx': 'old\n' },
				'2024-03-01T10:00:00+01:00'
			);
			commit(repo, { 'docs/b.svx': 'b again\n' }, '2024-06-01T12:00:00Z');
			commit(repo, { 'a.svx': 'a again\n' }, '2025-01-01T00:00:00Z');
		});
		afterAll(() => rmSync(repo, { recursive: true, force: true }));

		test('is the date of the last commit that touched the file', async () => {
			const plugins = [page_data({ last_modified: 'git' })];
			const of = async (name: string) =>
				(
					(
						await compile_async('text\n', {
							plugins,
							filename: join(repo, name),
						})
					).data?.page as PageData
				).last_modified;
			expect(await of('a.svx')).toBe('2025-01-01T00:00:00.000Z');
			expect(await of('docs/b.svx')).toBe('2024-06-01T12:00:00.000Z');
			expect(await of('docs/old.svx')).toBe('2024-03-01T09:00:00.000Z');
		});

		test('one log serves every document of a compiler, a commit since is not seen', async () => {
			const plugins = [page_data({ last_modified: 'git' })];
			const of = async (list: typeof plugins, name: string) =>
				(
					(
						await compile_async('text\n', {
							plugins: list,
							filename: join(repo, name),
						})
					).data?.page as PageData
				).last_modified;
			expect(await of(plugins, 'a.svx')).toBe('2025-01-01T00:00:00.000Z');
			commit(repo, { 'docs/new.svx': 'new\n' }, '2025-02-01T00:00:00Z');
			try {
				expect(await of(plugins, 'docs/new.svx')).toBeUndefined();
				expect(
					await of([page_data({ last_modified: 'git' })], 'docs/new.svx')
				).toBe('2025-02-01T00:00:00.000Z');
			} finally {
				git(repo, ['reset', '-q', '--hard', 'HEAD~1']);
			}
		});

		test('a file that is not committed has none and is not reported', async () => {
			writeFileSync(join(repo, 'draft.svx'), 'draft\n');
			try {
				const { data, warnings } = await later(
					'text\n',
					{ last_modified: 'git' },
					{ filename: join(repo, 'draft.svx') }
				);
				expect((data?.page as PageData).last_modified).toBeUndefined();
				expect(warnings).toBeUndefined();
			} finally {
				rmSync(join(repo, 'draft.svx'));
			}
		});

		test('a path through a link is the file it links to', async () => {
			const link = realpathSync.native(
				mkdtempSync(join(tmpdir(), 'page-data-link-'))
			);
			try {
				// a junction on windows, which needs no rights a link does
				symlinkSync(join(repo, 'docs'), join(link, 'docs'), 'junction');
				expect(await modified(join(link, 'docs/b.svx'), 'git')).toBe(
					'2024-06-01T12:00:00.000Z'
				);
			} finally {
				rmSync(link, { recursive: true, force: true });
			}
		});

		test('a file that is not there has none and is reported', async () => {
			const { warnings } = await later(
				'text\n',
				{ last_modified: 'git' },
				{ filename: join(repo, 'gone.svx') }
			);
			expect(warnings?.map((w) => w.code)).toEqual(['not_found']);
		});

		test('a file whose commit is where a shallow clone was cut has none and is reported', async () => {
			const clone = realpathSync(
				mkdtempSync(join(tmpdir(), 'page-data-shallow-'))
			);
			try {
				git(clone, [
					'clone',
					'-q',
					'--depth',
					'2',
					pathToFileURL(repo).href,
					'.',
				]);
				const plugins = [page_data({ last_modified: 'git' })];
				const at = (name: string) =>
					compile_async('text\n', { plugins, filename: join(clone, name) });
				expect(((await at('a.svx')).data?.page as PageData).last_modified).toBe(
					'2025-01-01T00:00:00.000Z'
				);
				const cut = await at('docs/old.svx');
				expect((cut.data?.page as PageData).last_modified).toBeUndefined();
				expect(cut.warnings?.map((w) => [w.code, w.message])).toEqual([
					[
						'shallow_history',
						`the history of ${join(clone, 'docs/old.svx')} was cut by a shallow clone, so the date of its last commit is not known, fetch the whole history (fetch-depth: 0)`,
					],
				]);
			} finally {
				rmSync(clone, { recursive: true, force: true });
			}
		});

		test('a repository with no commit has no dates', async () => {
			const fresh = realpathSync.native(
				mkdtempSync(join(tmpdir(), 'page-data-fresh-'))
			);
			try {
				git(fresh, ['init', '-q']);
				writeFileSync(join(fresh, 'a.svx'), 'a\n');
				const { data, warnings } = await later(
					'text\n',
					{ last_modified: 'git' },
					{ filename: join(fresh, 'a.svx') }
				);
				expect((data?.page as PageData).last_modified).toBeUndefined();
				expect(warnings).toBeUndefined();
			} finally {
				rmSync(fresh, { recursive: true, force: true });
			}
		});

		test('a document outside a repository rejects with a PageDataError', async () => {
			const outside = realpathSync(
				mkdtempSync(join(tmpdir(), 'page-data-none-'))
			);
			try {
				writeFileSync(join(outside, 'a.svx'), 'a\n');
				const error = await rejected(() =>
					modified(join(outside, 'a.svx'), 'git')
				);
				expect(error).toBeInstanceOf(PageDataError);
				expect(error.code).toBe('git');
				expect(error.message).toContain(
					`[@mdsvex/plugin-page-data] last_modified is 'git' and ${join(outside, 'a.svx')} is not inside a git repository: `
				);
			} finally {
				rmSync(outside, { recursive: true, force: true });
			}
		});
	});

	test("'git' and 'fs' throw a PageDataError where there is no node, a function does not", () => {
		const versions = process.versions;
		for (const option of ['git', 'fs'] as const) {
			vi.stubGlobal('process', { ...process, versions: {} });
			let error;
			try {
				error = thrown(() => page_data({ last_modified: option }));
				expect(
					thrown(() => page_data({ last_modified: () => undefined }))
				).toBeUndefined();
			} finally {
				vi.unstubAllGlobals();
			}
			expect(process.versions).toBe(versions);
			expect(error).toBeInstanceOf(PageDataError);
			expect(error.code).toBe('node');
			expect(error.message).toBe(
				`[@mdsvex/plugin-page-data] last_modified is '${option}', which needs node, give last_modified a function to find the date here`
			);
		}
	});
});

describe('options', () => {
	test('an option of the wrong shape throws when the plugin is made', () => {
		for (const [options, message] of [
			[
				{ reading_time: 200 },
				'reading_time must be true, false or an object of options, got 200',
			],
			[
				{ reading_time: { words_per_minute: 0 } },
				'reading_time.words_per_minute must be a number above 0, got 0',
			],
			[
				{ reading_time: { words_per_minute: '200' } },
				'reading_time.words_per_minute must be a number above 0, got "200"',
			],
			[
				{ excerpt: 140 },
				'excerpt must be true, false or an object of options, got 140',
			],
			[
				{ excerpt: { max_length: 0 } },
				'excerpt.max_length must be a whole number above 0, got 0',
			],
			[
				{ excerpt: { max_length: 1.5 } },
				'excerpt.max_length must be a whole number above 0, got 1.5',
			],
			[
				{ excerpt: { ellipsis: 3 } },
				'excerpt.ellipsis must be a string, got 3',
			],
			[{ title: 'yes' }, 'title must be true or false, got "yes"'],
			[
				{ edit_url: true },
				'edit_url must be a base url, an object with a base and a root, or a function, got true',
			],
			[
				{ edit_url: { root: '/a' } },
				'edit_url must be a base url, an object with a base and a root, or a function, got {"root":"/a"}',
			],
			[
				{ edit_url: '' },
				'edit_url must be a base url, an object with a base and a root, or a function, got ""',
			],
			[
				{ last_modified: 'mtime' },
				`last_modified must be 'git', 'fs' or a function, got "mtime"`,
			],
			[
				{ last_modified: true },
				`last_modified must be 'git', 'fs' or a function, got true`,
			],
		] as const) {
			const error = thrown(() => page_data(options as any));
			expect(error, message).toBeInstanceOf(PageDataError);
			expect(error.name).toBe('PageDataError');
			expect(error.code).toBe('option');
			expect(error.message).toBe('[@mdsvex/plugin-page-data] ' + message);
		}
	});
});

describe('every parser path', () => {
	/** the data of a document, the same whole, fed and over the wire */
	function parsed(
		source: string,
		options?: PageDataOptions,
		frontmatter?: Record<string, unknown>
	): PageData | undefined {
		let first: PageData | undefined;
		for (let i = 0; i < PATHS.length; i++) {
			const [name, path] = PATHS[i];
			const bundle = page_data(options);
			const { dispatcher, nodes } = path(source, {
				// mdsvex names the parse plugin of a bundle after the bundle
				plugins: [{ name: bundle.name, ...bundle.parse! }],
				document: { filename: '/repo/doc.svx', frontmatter: () => frontmatter },
			});
			expect(dispatcher!.finish(nodes), name).toBeUndefined();
			expect(dispatcher!.quiet(), name).toBe(true);
			const found = dispatcher!.data()?.page as PageData | undefined;
			if (i === 0) first = found;
			else expect(found, name).toEqual(first);
		}
		return first;
	}

	test('whole, fed and over the wire give the same data', () => {
		expect(
			parsed(
				'---\ndate: today\n---\n\n# A *title* here\n\nThe `first` paragraph &amp;\nits second line.\n\n- one\n- two\n\n> three\n\n<!-- more -->\n\n```js\ncode here\n```\n\n| a | b |\n|---|---|\n| c | d |\n\nThe end.\n',
				{ edit_url: { base: 'https://e.dit/', root: '/repo' } },
				{ date: 'today' }
			)
		).toEqual({
			title: 'A title here',
			excerpt: 'The first paragraph & its second line. one two three',
			words: 19,
			minutes: 1,
			edit_url: 'https://e.dit/doc.svx',
		});
	});

	test('a title and a first paragraph that hold an unclosed delimiter', () => {
		expect(
			parsed('# A *title\n\nThe _first paragraph `with [a link](\n\nMore.\n')
		).toEqual({
			title: 'A *title',
			excerpt: 'The _first paragraph `with [a link](',
			words: 9,
			minutes: 1,
		});
	});

	test('a first paragraph that starts with a tag that never closes', () => {
		expect(parsed('<span>The first\nparagraph.\n\nMore.\n')).toMatchObject({
			excerpt: '<span>The first paragraph.',
			words: 4,
		});
	});

	test('the paragraphs of a tight list are not the first paragraph', () => {
		expect(parsed('- one\n- two\n\nThe first.\n')).toMatchObject({
			excerpt: 'The first.',
			words: 4,
		});
	});

	test('a more comment inside emphasis that never closes', () => {
		expect(
			parsed('One.\n\nTwo *and <!-- more --> the rest.\n\nThree.\n')
		).toEqual({
			excerpt: 'One. Two *and',
			words: 6,
			minutes: 1,
		});
	});

	test('a more comment inside an element that never closes', () => {
		expect(
			parsed('One.\n\n<div>\n\nTwo.\n\n<!-- more -->\n\nThree.\n')
		).toMatchObject({
			excerpt: 'One. <div> Two.',
		});
	});

	test('a more comment inside a link that never closes', () => {
		expect(parsed('One [two <!-- more --> three](\n\nFour.\n')).toMatchObject({
			excerpt: 'One [two',
		});
	});

	test('a more comment in the paragraph of a tight list item', () => {
		expect(parsed('Intro.\n\n- a\n- b <!-- more --> c\n- d\n')).toMatchObject({
			excerpt: 'Intro. a b',
			words: 5,
		});
	});

	test('a last modified date, once the hook has waited', async () => {
		for (let i = 0; i < PATHS.length; i++) {
			const [name, path] = PATHS[i];
			const bundle = page_data({ last_modified: async () => new Date(0) });
			const { dispatcher, nodes } = path('# A\n\nb c\n', {
				plugins: [{ name: bundle.name, ...bundle.parse! }],
				document: { filename: '/repo/doc.svx' },
			});
			await dispatcher!.finish(nodes);
			expect(dispatcher!.data(), name).toEqual({
				page: {
					title: 'A',
					excerpt: 'b c',
					words: 3,
					minutes: 1,
					last_modified: '1970-01-01T00:00:00.000Z',
				},
			});
		}
	});

	test('the frontmatter the host gives decides the title', () => {
		expect(parsed('# Heading\n', undefined, { title: 'Written' })).toEqual({
			words: 1,
			minutes: 1,
		});
		expect(parsed('# Heading\n', undefined, undefined)?.title).toBe('Heading');
	});
});

describe('vite plugin', () => {
	test('the plugins option takes it and the filename is the id', async () => {
		const [plugin] = mdsvex({
			plugins: [
				page_data({ edit_url: { base: 'https://e.dit', root: '/app' } }),
			],
		});
		const transform = plugin.transform as Function;
		const result = await transform.call(
			{ addWatchFile() {} },
			'# Hello\n\nSome words here.\n',
			'/app/src/doc.svx'
		);
		expect(result.code).toContain(
			'"page":{"title":"Hello","excerpt":"Some words here.","words":4,"minutes":1,"edit_url":"https://e.dit/src/doc.svx"}'
		);
	});

	test('it waits for the last modified date', async () => {
		const [plugin] = mdsvex({
			plugins: [
				page_data({
					last_modified: async (file) =>
						file === '/app/src/doc.svx' ? new Date(0) : undefined,
				}),
			],
		});
		const transform = plugin.transform as Function;
		const result = await transform.call(
			{ addWatchFile() {} },
			'Some words.\n',
			'/app/src/doc.svx'
		);
		expect(result.code).toContain(
			'"page":{"excerpt":"Some words.","words":2,"minutes":1,"last_modified":"1970-01-01T00:00:00.000Z"}'
		);
	});
});

describe('as published', () => {
	test('the files it publishes are the ones its exports name', async () => {
		const root = write_app(HERE, {}, [dirname(HERE)]);
		try {
			const entry = createRequire(join(root, 'index.js')).resolve(
				'@mdsvex/plugin-page-data'
			);
			expect(entry).toBe(
				join(
					root,
					'node_modules',
					'@mdsvex',
					'plugin-page-data',
					'dist',
					'index.js'
				)
			);
			const installed = await import(pathToFileURL(entry).href);
			expect(
				compile('# A\n\nb c\n', { plugins: [installed.page_data()] }).data
			).toEqual({
				page: { title: 'A', excerpt: 'b c', words: 3, minutes: 1 },
			});
			expect(installed.count_words('a b')).toBe(2);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
