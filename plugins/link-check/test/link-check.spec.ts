import { link_check, LinkCheckError } from '@mdsvex/plugin-link-check';
import type { LinkCheckOptions } from '@mdsvex/plugin-link-check';
import {
	compile,
	compile_async,
	compile_inputs,
	CompilerSession,
	PluginAsyncError,
	PluginTaskError,
} from 'mdsvex';
import { describe, expect, test } from 'vitest';

import { HeadingIds, heading_slug } from '../../../packages/parse/src/main';
import { PATHS } from '../../../packages/parse/test/plugin_harness';

const FILES: Record<string, string> = {
	'/site/guide.md': [
		'---',
		'title: Guide',
		'---',
		'',
		'# Guide',
		'',
		'## Install',
		'',
		'## Install',
		'',
		'<div id="extra"></div> <a name="old"></a>',
		'',
		':::note(id=careful)',
		'Careful.',
		':::',
		'',
		'A note[^a].',
		'',
		'[^a]: The note.',
		'',
	].join('\n'),
	'/site/notes.svx': '# Notes\n',
	'/site/broken.md': '---\ntitle: [\n---\n\n# Broken\n',
	'/site/routes/+page.md': '# Home\n',
	'/site/routes/setup/+page.md': '# Setup\n\n## Usage\n',
	'/site/routes/about.svx': '# About us\n',
	'/site/routes/docs/index.md': '# Docs\n\n## Start\n',
	'/site/routes/(app)/hidden/+page.md': '# Hidden\n',
};

async function read(path: string): Promise<string> {
	const text = FILES[path];
	if (text === undefined) throw new Error(`ENOENT ${path}`);
	return text;
}

type Options = NonNullable<Parameters<typeof compile_async>[1]>;

function run(source: string, options?: LinkCheckOptions, more?: Options) {
	return compile_async(source, {
		filename: '/site/routes/doc/+page.md',
		heading_ids: true,
		plugins: [link_check({ routes: '/site/routes', ...options })],
		read,
		...more,
	});
}

/** code and message of each warning, in the order they came */
async function warned(
	source: string,
	options?: LinkCheckOptions,
	more?: Options
): Promise<string[]> {
	const { warnings } = await run(source, options, more);
	return (warnings ?? []).map((w) => `${w.code} ${w.message}`);
}

/** the urls the warnings are about */
async function hrefs(
	source: string,
	options?: LinkCheckOptions,
	more?: Options
): Promise<string[]> {
	return (await warned(source, options, more)).map((w) => w.split(' ')[1]);
}

async function rejected(make: () => Promise<unknown>): Promise<any> {
	try {
		await make();
	} catch (error) {
		return error;
	}
	return undefined;
}

describe('within a page', () => {
	test('a fragment no element has is reported at the link', async () => {
		const { warnings } = await run(
			'# Title\n\nSee [the title](#title) and [more](#more).\n'
		);
		expect(warnings).toEqual([
			{
				code: 'missing_anchor',
				message:
					'#more links to no element of this document, none has the id "more"',
				start: { line: 3, column: 28 },
				plugin: 'link-check',
			},
		]);
	});

	test('an id that comes after the link counts', async () => {
		expect(
			await hrefs('[later](#later) [repeat](#later-1)\n\n# Later\n\n# Later\n')
		).toEqual([]);
	});

	test('every kind of id: headings, elements, a name, directive ids and footnotes', async () => {
		expect(
			await hrefs(
				[
					'[a](#heading) [b](#box) [c](#old) [d](#careful) [e](#fn-a) [f](#gone)',
					'',
					'## Heading',
					'',
					'<div id="box"></div> <a name="old"></a>',
					'',
					':::note(id=careful)',
					'Text[^a].',
					':::',
					'',
					'[^a]: The note.',
					'',
				].join('\n'),
				undefined,
				{ strict_directives: false }
			)
		).toEqual(['#gone']);
	});

	test('the top of the page and an empty fragment need no id', async () => {
		expect(await hrefs('[a](#top) [b](#) [c](#Top)\n')).toEqual([]);
	});

	test('a fragment is compared decoded', async () => {
		expect(
			await hrefs('# Café\n\n[a](#caf%C3%A9) [b](#café) [c](#cafe)\n')
		).toEqual(['#cafe']);
	});

	test('a link to this document by file or by route is a link within it', async () => {
		expect(
			await hrefs(
				'# Here\n\n[a](./+page.md#here) [b](/doc#here) [c](./+page.md#gone) [d](/doc#gone)\n'
			)
		).toEqual(['./+page.md#gone', '/doc#gone']);
	});

	test('without heading ids a heading has none to link to', async () => {
		expect(
			await hrefs('# Title\n\n[a](#title)\n', undefined, { heading_ids: false })
		).toEqual(['#title']);
	});

	test('urls with a scheme, an expression or a query alone are not checked', async () => {
		expect(
			await hrefs(
				'[a](https://example.com#x) [b](mailto:a@b.c) [c](#{id}) [d](?q=1) [e](//cdn.example.com/x#y)\n'
			)
		).toEqual([]);
	});

	test('a link inside an emphasis that never closes is still a link', async () => {
		expect(await hrefs('*open [a](#gone)\n')).toEqual(['#gone']);
	});

	test('what is not a link is not checked', async () => {
		expect(
			await hrefs('[a](#gone\n\n`[b](#gone)`\n\n<a href="#gone">c</a>\n')
		).toEqual([]);
	});

	test('ignore skips a url', async () => {
		const seen: unknown[] = [];
		expect(
			await hrefs('[a](#bib-x) [b](#gone)\n', {
				ignore: (href, filename) => {
					seen.push([href, filename]);
					return href.startsWith('#bib-');
				},
			})
		).toEqual(['#gone']);
		expect(seen).toEqual([
			['#bib-x', '/site/routes/doc/+page.md'],
			['#gone', '/site/routes/doc/+page.md'],
		]);
	});

	test('compile checks them too, it reads nothing', () => {
		const { warnings } = compile('# Title\n\n[a](#title) [b](#gone)\n', {
			heading_ids: true,
			plugins: [link_check({ documents: false })],
		});
		expect(warnings?.map((w) => w.code + ' ' + w.message)).toEqual([
			'missing_anchor #gone links to no element of this document, none has the id "gone"',
		]);
	});
});

describe('other documents', () => {
	test('by file, a missing id and a missing document', async () => {
		expect(
			await warned(
				'[a](../../guide.md#install) [b](../../guide.md#install-1) [c](../../guide.md#nope) [d](../../nope.md#x) [e](../../notes.svx)\n'
			)
		).toEqual([
			'missing_anchor ../../guide.md#nope links to /site/guide.md, which has no element with the id "nope"',
			'missing_document ../../nope.md#x links to /site/nope.md, which does not exist',
		]);
	});

	test('every kind of id of the other document', async () => {
		expect(
			await hrefs(
				'[a](../../guide.md#extra) [b](../../guide.md#old) [c](../../guide.md#careful) [d](../../guide.md#fn-a) [e](../../guide.md#guide)\n'
			)
		).toEqual([]);
	});

	test('a link with no fragment checks that the document is there', async () => {
		expect(await hrefs('[a](../../guide.md) [b](../../nope.svx)\n')).toEqual([
			'../../nope.svx',
		]);
	});

	test('a relative link to a file that is no document is not checked', async () => {
		expect(await hrefs('[a](./a.png) [b](./setup#x) [c](../setup/)\n')).toEqual(
			[]
		);
	});

	test('by route, each way a document can be one', async () => {
		expect(
			await hrefs(
				'[a](/#home) [b](/setup#usage) [c](/setup/#usage) [d](/about#about-us) [e](/docs#start) [f](/setup#nope) [g](/docs?x=1#nope)\n'
			)
		).toEqual(['/setup#nope', '/docs?x=1#nope']);
	});

	test('a route with no document is not reported, it may be a page that is none', async () => {
		expect(await hrefs('[a](/api/thing#x) [b](/hidden#x)\n')).toEqual([]);
	});

	test('a root url with no fragment is not read', async () => {
		let reads = 0;
		await run('[a](/setup) [b](/nowhere)\n', undefined, {
			read: async (path) => {
				reads++;
				return read(path);
			},
		});
		expect(reads).toBe(0);
	});

	test('without routes a root url is not checked', async () => {
		expect(
			await hrefs('[a](/setup#nope)\n', undefined, {
				plugins: [link_check()],
			})
		).toEqual([]);
	});

	test('the base comes off a root url written with it', async () => {
		expect(
			await hrefs(
				'[a](/docs-site/setup#usage) [b](/docs-site/setup#nope) [c](/docs-site#home)\n',
				{
					base: '/docs-site/',
				}
			)
		).toEqual(['/docs-site/setup#nope']);
	});

	test('extensions name what a document is', async () => {
		expect(
			await hrefs('[a](../../notes.svx#x) [b](../../guide.md#x)\n', {
				extensions: ['svx'],
			})
		).toEqual(['../../notes.svx#x']);
	});

	test('the headings of another document get ids as the option says', async () => {
		const slug = { slug: (text: string) => 'h-' + heading_slug(text) };
		expect(
			await hrefs('[a](../../notes.svx#h-notes) [b](../../notes.svx#notes)\n', {
				heading_ids: slug,
			})
		).toEqual(['../../notes.svx#notes']);
		expect(
			await hrefs('[a](../../notes.svx#notes)\n', { heading_ids: false })
		).toEqual(['../../notes.svx#notes']);
	});

	test('a document that does not compile is reported as unreadable', async () => {
		const [warning] = await warned('[a](../../broken.md#broken)\n');
		expect(warning).toMatch(
			/^missing_document \.\.\/\.\.\/broken\.md#broken links to \/site\/broken\.md, which could not be read: /
		);
	});

	test('a relative filename and routes are taken from the working directory', async () => {
		const cwd = process.cwd();
		const files = {
			[`${cwd}/pages/a.md`]: '[b](./b.md#here) [c](/b#gone)\n',
			[`${cwd}/pages/b.md`]: '# Here\n',
		};
		const { warnings } = await compile_async(files[`${cwd}/pages/a.md`], {
			filename: 'pages/a.md',
			heading_ids: true,
			plugins: [link_check({ routes: 'pages' })],
			read: async (path) => files[path] ?? Promise.reject(new Error('ENOENT')),
		});
		expect(warnings?.map((w) => w.message)).toEqual([
			'/b#gone links to pages/b.md, which has no element with the id "gone"',
		]);
	});

	test('with no filename only links within the page are checked', async () => {
		expect(
			await hrefs('[a](./nope.md#x) [b](#gone)\n', undefined, {
				filename: undefined,
			})
		).toEqual(['#gone']);
	});
});

describe('reading', () => {
	test('what was read, and what was looked for, are dependencies', async () => {
		const { dependencies } = await run(
			'[a](../../guide.md#install) [b](../../nope.md) [c](/docs#start)\n'
		);
		expect(dependencies?.sort()).toEqual([
			'/site/guide.md',
			'/site/nope.md',
			'/site/routes/docs.md',
			'/site/routes/docs/+page.md',
			'/site/routes/docs/index.md',
		]);
	});

	test('a document with no link to another reads nothing and depends on nothing', async () => {
		const { dependencies } = await run('# A\n\n[a](#a)\n');
		expect(dependencies).toBeUndefined();
	});

	test('each document is read once for a compiler, and again once it changed', async () => {
		let reads = 0;
		const session = new CompilerSession();
		const plugins = [link_check()];
		const once = async () => {
			const inputs = compile_inputs({
				plugins,
				heading_ids: true,
				filename: '/site/doc.md',
				read: async (path) => {
					reads++;
					return read(path);
				},
			});
			const parsed = session.parse(
				'[a](./notes.svx#notes) [b](./notes.svx#added) [c](./guide.md#install)\n',
				inputs
			);
			await session.settle(parsed);
			return session.render(parsed, inputs).warnings?.map((w) => w.message);
		};
		expect(await once()).toEqual([
			'./notes.svx#added links to /site/notes.svx, which has no element with the id "added"',
		]);
		await once();
		expect(reads).toBe(2);
		const before = FILES['/site/notes.svx'];
		FILES['/site/notes.svx'] = '# Notes\n\n## Added\n';
		try {
			expect(await once()).toHaveLength(1);
			session.invalidate(['/site/notes.svx']);
			expect(await once()).toBeUndefined();
			expect(reads).toBe(3);
		} finally {
			FILES['/site/notes.svx'] = before;
		}
	});

	test('a document that is not there is read again by the next document', async () => {
		let reads = 0;
		const plugins = [link_check()];
		const counting = async (path: string) => {
			reads++;
			return read(path);
		};
		for (let i = 0; i < 2; i++)
			await compile_async('[a](./nope.md)\n', {
				filename: `/site/doc${i}.md`,
				plugins,
				read: counting,
			});
		expect(reads).toBe(2);
	});

	test('compile_async shares what it read across calls given the same plugins', async () => {
		let reads = 0;
		const plugins = [link_check()];
		for (let i = 0; i < 3; i++)
			await compile_async('[a](./guide.md#install)\n', {
				filename: `/site/doc${i}.md`,
				plugins,
				read: async (path) => {
					reads++;
					return read(path);
				},
			});
		expect(reads).toBe(1);
	});

	test('compile_async with no read option is a typed error', async () => {
		const error = await rejected(() =>
			compile_async('[a](./guide.md#x)\n', {
				filename: '/site/doc.md',
				plugins: [link_check()],
			})
		);
		expect(error).toBeInstanceOf(PluginTaskError);
		expect(error.cause).toBeInstanceOf(LinkCheckError);
		expect(error.cause.code).toBe('no_reader');
		expect(error.cause.message).toBe(
			'[@mdsvex/plugin-link-check] /site/doc.md links to /site/guide.md and the compile can not read it, it was given no read option, the vite plugin has one, compile_async takes one, or check links within a page alone with documents: false'
		);
	});

	test('compile throws a PluginAsyncError for a link to another document', () => {
		let error: unknown;
		try {
			compile('[a](./guide.md#x)\n', {
				filename: '/site/doc.md',
				plugins: [link_check()],
			});
		} catch (e) {
			error = e;
		}
		expect(error).toBeInstanceOf(PluginAsyncError);
	});

	test('documents false never reads, under compile or compile_async', async () => {
		let reads = 0;
		const options = {
			filename: '/site/doc.md',
			plugins: [link_check({ documents: false })],
			read: async (path: string) => {
				reads++;
				return read(path);
			},
		};
		expect(compile('[a](./nope.md#x)\n', options).warnings).toBeUndefined();
		expect(
			(await compile_async('[a](./nope.md#x)\n', options)).warnings
		).toBeUndefined();
		expect(reads).toBe(0);
	});
});

describe('strict', () => {
	test('a document with broken links fails with each of them, after the warnings', async () => {
		const error = await rejected(() =>
			run(
				'[a](#gone)\n\n[b](../../guide.md#nope) [c](#title)\n\n# Title\n\n[d](../../nope.md)\n',
				{
					strict: true,
				}
			)
		);
		expect(error).toBeInstanceOf(LinkCheckError);
		expect(error.code).toBe('broken');
		expect(error.message).toBe(
			[
				'[@mdsvex/plugin-link-check] /site/routes/doc/+page.md has 3 links that go nowhere:',
				'1:1 #gone links to no element of this document, none has the id "gone"',
				'3:1 ../../guide.md#nope links to /site/guide.md, which has no element with the id "nope"',
				'7:1 ../../nope.md links to /site/nope.md, which does not exist',
			].join('\n')
		);
		expect(error.links.map((l: any) => [l.href, l.line, l.column])).toEqual([
			['#gone', 1, 0],
			['../../guide.md#nope', 3, 0],
			['../../nope.md', 7, 0],
		]);
	});

	test('one broken link is named in the singular', async () => {
		const error = await rejected(() =>
			compile_async('[a](#gone)\n', { plugins: [link_check({ strict: true })] })
		);
		expect(error.message).toBe(
			'[@mdsvex/plugin-link-check] the document has a link that goes nowhere:\n1:1 #gone links to no element of this document, none has the id "gone"'
		);
	});

	test('a document whose links all go somewhere compiles, with no data', async () => {
		const { data, warnings } = await run(
			'# Title\n\n[a](#title) [b](../../guide.md#install)\n',
			{
				strict: true,
			}
		);
		expect(data).toBeUndefined();
		expect(warnings).toBeUndefined();
	});

	test('compile throws it too, for links within the page', () => {
		expect(() =>
			compile('[a](#gone)\n', {
				plugins: [link_check({ strict: true, documents: false })],
			})
		).toThrow(LinkCheckError);
	});

	test('without strict nothing is written to plugin_data', async () => {
		const { data, code } = await run('[a](#gone) [b](../../nope.md)\n');
		expect(data).toBeUndefined();
		expect(code).not.toContain('plugin_data');
	});
});

describe('options', () => {
	test('an option of the wrong shape throws when the plugin is made', () => {
		for (const [options, message] of [
			[null, 'the options must be an object'],
			[{ routes: '' }, 'routes must be the path of a directory, got ""'],
			[{ routes: 3 }, 'routes must be the path of a directory, got 3'],
			[
				{ extensions: '.md' },
				'extensions must be an array of extensions such as .md',
			],
			[
				{ extensions: [''] },
				'extensions must be an array of extensions such as .md',
			],
			[{ base: 1 }, 'base must be a string, got 1'],
			[{ documents: 'yes' }, 'documents must be true or false, got "yes"'],
			[{ strict: 1 }, 'strict must be true or false, got 1'],
			[{ ignore: 'x' }, 'ignore must be a function'],
			[
				{ heading_ids: 'github' },
				'heading_ids must be true, false or an object with a slug function',
			],
		] as const) {
			let error: any;
			try {
				link_check(options as any);
			} catch (e) {
				error = e;
			}
			expect(error, message).toBeInstanceOf(LinkCheckError);
			expect(error.code).toBe('option');
			expect(error.message).toBe('[@mdsvex/plugin-link-check] ' + message);
		}
	});
});

describe('every parser path', () => {
	/** the codes and urls of the warnings and the dependencies, the same whole, fed and over the wire */
	async function checked(source: string, options?: LinkCheckOptions) {
		let first: unknown;
		for (const [name, path] of PATHS) {
			const bundle = link_check({ routes: '/site/routes', ...options });
			const { dispatcher, nodes } = path(source, {
				// mdsvex names the parse plugin of a bundle after the bundle
				plugins: [{ name: bundle.name, ...bundle.parse! }],
				document: { filename: '/site/routes/doc/+page.md', read },
				headings: new HeadingIds(heading_slug, () => false),
			});
			await dispatcher!.finish(nodes);
			const found = {
				warnings: (dispatcher!.warnings ?? []).map(
					(w) => `${w.code} ${w.message.split(' ')[0]}`
				),
				// tasks settle in another order on each path
				dependencies: dispatcher!.dependencies()?.sort(),
			};
			if (first === undefined) first = found;
			else expect(found, name).toEqual(first);
		}
		return first as { warnings: string[]; dependencies: string[] | undefined };
	}

	test('whole, fed and over the wire report the same links', async () => {
		const found = await checked(
			'# Title\n\n[a](#title) [b](#gone) [c](../../guide.md#nope) [d](/setup#usage) [e](../../nope.md)\n\n- [f](#later)\n- [g](#nowhere)\n\n## Later\n'
		);
		expect(found.warnings.sort()).toEqual([
			'missing_anchor #gone',
			'missing_anchor #nowhere',
			'missing_anchor ../../guide.md#nope',
			'missing_document ../../nope.md',
		]);
		expect(found.dependencies).toEqual([
			'/site/guide.md',
			'/site/nope.md',
			'/site/routes/setup.md',
			'/site/routes/setup/+page.md',
		]);
	});

	test('a link that is revoked is not checked, nor read for', async () => {
		for (const source of [
			'[a](../../nope.md#x\n',
			'[a](#gone\n',
			'[open [a](../../nope.md) and more\n',
			// an inline directive that never closes leaves its label as text
			':note[open [a](#gone) and [b](../../guide.md#nope)\n',
		]) {
			const found = await checked(source);
			expect(found.warnings, source).toEqual(
				source.startsWith('[open') ? ['missing_document ../../nope.md'] : []
			);
		}
		expect(
			(await checked('[a](../../nope.md#x\n')).dependencies
		).toBeUndefined();
	});

	test('a link that stays inside a construct that is revoked is checked', async () => {
		for (const source of [
			'*open [a](#gone) and [b](../../guide.md#nope)\n',
			'**open *[a](#gone)* and [b](../../guide.md#nope)\n',
			'<span>[a](#gone)\n\n[b](../../guide.md#nope)\n',
		]) {
			const found = await checked(source);
			expect(found.warnings.sort(), source).toEqual([
				'missing_anchor #gone',
				'missing_anchor ../../guide.md#nope',
			]);
		}
	});
});
