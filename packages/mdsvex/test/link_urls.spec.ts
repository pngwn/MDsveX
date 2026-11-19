import { describe, expect, test } from 'vitest';
import { compile, compile_inputs, CompilerSession } from '../src/main';
import { links_of } from '../src/link_urls';
import type { CompileOptions, RewriteContext, TraceTarget } from '../src/main';

const PAGE = '/site/src/routes/guide/+page.md';
const routed: CompileOptions = {
	filename: PAGE,
	links: { routes: '/site/src/routes' },
};

function href(doc: string, options: CompileOptions): string {
	const { code } = compile(doc, options);
	const m = /<a href=("[^"]*"|\{[^}]*\})/.exec(code);
	return m === null ? code : m[1];
}

function target(): TraceTarget {
	return {
		source: '',
		html: '',
		metadata: undefined,
		template: undefined,
		warnings: undefined,
		buf: new Uint32Array(0),
		start: 0,
		split: 0,
		end: 0,
	};
}

describe('rewrite', () => {
	test('a string replaces the url of a link, nothing keeps it', () => {
		const seen: [string, RewriteContext][] = [];
		const { code } = compile('[a](./a.md) [b](/b) ![c](/c.png)\n', {
			filename: '/docs/x.md',
			rewrite(url, ctx) {
				seen.push([url, ctx]);
				if (url === './a.md') return '/a';
				if (url === '/c.png') return '/static/c.png';
			},
		});
		expect(code).toBe(
			'<p><a href="/a">a</a> <a href="/b">b</a> <img src="/static/c.png" alt="c" /></p>'
		);
		expect(seen).toEqual([
			['./a.md', { filename: '/docs/x.md', type: 'link', written: './a.md' }],
			['/b', { filename: '/docs/x.md', type: 'link', written: '/b' }],
			['/c.png', { filename: '/docs/x.md', type: 'image', written: '/c.png' }],
		]);
	});

	test('is called once for a url however often the document has it', () => {
		const seen: string[] = [];
		compile('[a](/a) [b](/a) ![a](/a) [c](/a)\n\n[d](/a)\n', {
			rewrite: (url, { type }) => void seen.push(type + ' ' + url),
		});
		expect(seen).toEqual(['link /a', 'image /a']);
	});

	test('sees external urls, fragments and schemes', () => {
		const seen: string[] = [];
		compile(
			'[a](https://a.dev/x.md) [b](#top) [c](mailto:a@b.c) [d](//cdn/x) <https://e.dev>\n',
			{ rewrite: (url) => void seen.push(url) }
		);
		expect(seen).toEqual([
			'https://a.dev/x.md',
			'#top',
			'mailto:a@b.c',
			'//cdn/x',
			'https://e.dev',
		]);
	});

	test('never sees a url with a svelte expression or an empty one', () => {
		const seen: string[] = [];
		const { code } = compile('[a]({x}) [b](/p/{y}) [c]() ![d]({z})\n', {
			rewrite: (url) => (seen.push(url), '/never'),
		});
		expect(seen).toEqual([]);
		expect(code).toBe(
			'<p><a href="{x}">a</a> <a href="/p/{y}">b</a> <a>c</a> <img src="{z}" alt="d" /></p>'
		);
	});

	test('gets the url as written and its result is escaped as one', () => {
		const seen: string[] = [];
		const { code } = compile('[a](/a?x=1&amp;y=2) [b](/b)\n', {
			rewrite(url) {
				seen.push(url);
				return url === '/b' ? '/b?q="1"&r=<2>' : url;
			},
		});
		expect(seen).toEqual(['/a?x=1&amp;y=2', '/b']);
		expect(code).toBe(
			'<p><a href="/a?x=1&amp;y=2">a</a> <a href="/b?q=&quot;1&quot;&amp;r=&lt;2&gt;">b</a></p>'
		);
	});

	test('an empty string leaves the attribute out', () => {
		expect(compile('[a](/a)\n', { rewrite: () => '' }).code).toBe(
			'<p><a>a</a></p>'
		);
	});

	test('autolinks and links in every block are rewritten', () => {
		const { code } = compile(
			'# [h](/h)\n\n> [q](/q)\n\n- [l](/l)\n\n| [t](/t) |\n| --- |\n\n<https://e.dev>\n',
			{ rewrite: (url) => '/x' + url }
		);
		for (const to of ['/x/h', '/x/q', '/x/l', '/x/t', '/xhttps://e.dev'])
			expect(code).toContain(`href="${to}"`);
	});

	test('a typed anchor or image is left alone', () => {
		const seen: string[] = [];
		const { code } = compile(
			'<a href="/typed">a</a> <img src="/typed.png" alt="" />\n',
			{ rewrite: (url) => (seen.push(url), '/never') }
		);
		expect(seen).toEqual([]);
		expect(code).toContain('<a href="/typed">a</a>');
		expect(code).toContain('<img src="/typed.png" alt="" />');
	});

	test('an image that is imported is never offered', () => {
		const seen: string[] = [];
		const { code } = compile('![a](./a.png) ![b](/b.png)\n', {
			import_images: true,
			rewrite: (url) => (seen.push(url), '/r' + url),
		});
		expect(seen).toEqual(['/b.png']);
		expect(code).toContain("import __mdsvex_img_0 from './a.png';");
		expect(code).toContain('<img src={__mdsvex_img_0} alt="a" />');
		expect(code).toContain('<img src="/r/b.png" alt="b" />');
	});

	test('a replaced a and img take the rewritten url', () => {
		const { code } = compile('[a](/a) ![b](/b.png)\n', {
			components: [{ specifier: '#lib/md.ts', names: ['a', 'img'] }],
			rewrite: (url) => '/x' + url,
		});
		expect(code).toMatch(/<A_MDSVEX_G[^>]* href="\/x\/a"/);
		expect(code).toMatch(/<Img_MDSVEX_G[^>]* src="\/x\/b.png"/);
	});

	test('every kind of compile rewrites alike', () => {
		const doc = '# t\n\n[a](/a) and ![b](/b.png)\n';
		const options: CompileOptions = { rewrite: (url) => '/x' + url };
		const plain = compile(doc, options).code;
		expect(plain).toBe(
			'<h1>t</h1><p><a href="/x/a">a</a> and <img src="/x/b.png" alt="b" /></p>'
		);
		expect(compile(doc, { ...options, sourcemap: true }).code).toBe(plain);
		const session = new CompilerSession();
		expect(session.compile(doc, options).code).toBe(plain);
		expect(session.compile(doc, { ...options, sourcemap: true }).code).toBe(
			plain
		);
		// the session keeps its renderer, the next document has no lookup left
		expect(session.compile('[a](/a)\n').code).toBe('<p><a href="/a">a</a></p>');
	});

	test('a parse plugin or a compile inside one keeps its own rewrite', () => {
		const inner: string[] = [];
		const { code } = compile('# [a](/a)\n', {
			rewrite: (url) => '/outer' + url,
			parse_plugins: [
				{
					heading: {
						parse() {
							inner.push(
								compile('[b](/b)\n', { rewrite: (url) => '/inner' + url }).code
							);
						},
					},
				},
			],
		});
		expect(code).toBe('<h1><a href="/outer/a">a</a></h1>');
		expect(inner).toEqual(['<p><a href="/inner/b">b</a></p>']);
	});

	test('a document that waits between parse and render is rewritten at the render', () => {
		const session = new CompilerSession();
		const inputs = compile_inputs();
		inputs.links = links_of((url, ctx) => ctx.filename + url, undefined);
		inputs.filename = 'at-parse';
		const parsed = session.parse('[a](/a)\n', inputs);
		inputs.filename = 'other';
		const other = target();
		session.compile_into('[b](/b)\n', inputs, other);
		expect(other.html).toBe('<p><a href="other/b">b</a></p>');
		inputs.filename = 'at-render';
		session.render_into(parsed, inputs, other);
		expect(other.html).toBe('<p><a href="at-render/a">a</a></p>');
		inputs.links = undefined;
		session.compile_into('[c](/c)\n', inputs, other);
		expect(other.html).toBe('<p><a href="/c">c</a></p>');
	});

	test('rejects anything but a string or nothing', () => {
		expect(() => compile('[a](/a)\n', { rewrite: (() => 1) as never })).toThrow(
			'[mdsvex] rewrite must return a string or nothing, it returned number for "/a"'
		);
		expect(() => compile('a\n', { rewrite: 'x' as never })).toThrow(
			'[mdsvex] rewrite must be a function'
		);
	});
});

describe('links.routes', () => {
	test.each([
		['./other.md', '/guide/other'],
		['other.md', '/guide/other'],
		['./other.md#x', '/guide/other#x'],
		['./other.md?tab=a#x', '/guide/other?tab=a#x'],
		['../+page.md', '/'],
		['../about/+page.md', '/about'],
		['../about/+page.md#team', '/about#team'],
		['./+page.md#top', '/guide#top'],
		['./deep/nested/+page.md', '/guide/deep/nested'],
		['../(marketing)/pricing/+page.md', '/pricing'],
		['../blog/index.md', '/blog'],
		['../index.md', '/'],
		['../a%20b/+page.md', '/a%20b'],
		['./+page@.md', '/guide'],
		['./x.svx', '/guide/x'],
		['././../guide/./x.md', '/guide/x'],
	])('%s becomes %s', (url, route) => {
		expect(href(`[a](${url})\n`, routed)).toBe(`"${route}"`);
	});

	test.each([
		'https://example.com/x.md',
		'//example.com/x.md',
		'mailto:a@b.md',
		'#x.md',
		'?x.md',
		'/abs/x.md',
		'./x.png',
		'./x.mdx',
		'./md',
		'../../lib/x.md',
		'../../../../../x.md',
		'../[slug]/+page.md',
		'./a&amp;b.md',
		'./a\\b.md',
		'./{x}.md',
	])('%s is left as written', (url) => {
		expect(href(`[a](${url})\n`, routed)).toBe(`"${url}"`);
	});

	test('images are never routes', () => {
		expect(compile('![a](./other.md)\n', routed).code).toBe(
			'<p><img src="./other.md" alt="a" /></p>'
		);
	});

	test('a document outside the routes links into them', () => {
		expect(
			href('[a](../src/routes/about/+page.md)\n', {
				filename: '/site/docs/x.md',
				links: { routes: '/site/src/routes' },
			})
		).toBe('"/about"');
	});

	test('relative paths compare as written', () => {
		expect(
			href('[a](./b.md)\n', {
				filename: 'docs/guide/a.md',
				links: { routes: './docs/' },
			})
		).toBe('"/guide/b"');
	});

	test('windows paths', () => {
		expect(
			href('[a](../about/+page.md#x)\n', {
				filename: 'C:\\site\\src\\routes\\guide\\+page.md',
				links: { routes: 'C:\\site\\src\\routes' },
			})
		).toBe('"/about#x"');
		expect(
			href('[a](./b.md)\n', {
				filename: 'C:/site/docs/a.md',
				links: { routes: 'C:\\site\\docs\\' },
			})
		).toBe('"/b"');
	});

	test('extensions say which files are documents', () => {
		const options: CompileOptions = {
			filename: '/docs/a.mdx',
			links: { routes: '/docs', extensions: ['.mdx', 'markdown'] },
		};
		expect(href('[a](./b.mdx)\n', options)).toBe('"/b"');
		expect(href('[a](./b.markdown)\n', options)).toBe('"/b"');
		expect(href('[a](./b.md)\n', options)).toBe('"./b.md"');
	});

	test('without a filename a relative link has nothing to resolve against', () => {
		expect(href('[a](./b.md)\n', { links: { routes: '/docs' } })).toBe(
			'"./b.md"'
		);
	});

	test('rewrite gets the route and the url as written', () => {
		const seen: unknown[] = [];
		expect(
			href('[a](./other.md#x)\n', {
				...routed,
				rewrite(url, ctx) {
					seen.push([url, ctx.written]);
					return url.replace(/(#|$)/, '/$1');
				},
			})
		).toBe('"/guide/other/#x"');
		expect(seen).toEqual([['/guide/other#x', './other.md#x']]);
	});
});

describe('links.base', () => {
	const based: CompileOptions = { links: { base: '/docs' } };

	test('a string goes in front of every root url', () => {
		expect(compile('[a](/a) ![b](/b.png) [c](/)\n', based).code).toBe(
			'<p><a href="/docs/a">a</a> <img src="/docs/b.png" alt="b" /> <a href="/docs/">c</a></p>'
		);
	});

	test.each([
		'https://example.com/a',
		'//example.com/a',
		'mailto:a@b.c',
		'#a',
		'?a',
		'./a',
		'a',
		'../a',
		'/{x}',
	])('%s is left as written', (url) => {
		expect(href(`[a](${url})\n`, based)).toBe(`"${url}"`);
	});

	test('a trailing slash of the base is dropped, an empty base is none', () => {
		expect(href('[a](/a)\n', { links: { base: '/docs/' } })).toBe('"/docs/a"');
		expect(href('[a](/a)\n', { links: { base: '/' } })).toBe('"/a"');
		expect(href('[a](/a)\n', { links: { base: '' } })).toBe('"/a"');
		expect(href('[a](/a)\n', { links: { base: 'https://x.dev/docs/' } })).toBe(
			'"https://x.dev/docs/a"'
		);
	});

	test('follows routes and rewrite', () => {
		expect(
			href('[a](./other.md#x)\n', {
				...routed,
				links: { routes: '/site/src/routes', base: '/docs' },
			})
		).toBe('"/docs/guide/other#x"');
		expect(
			href('[a](wiki:Page)\n', {
				links: { base: '/docs' },
				rewrite: (url) =>
					url.startsWith('wiki:') ? '/wiki/' + url.slice(5) : undefined,
			})
		).toBe('"/docs/wiki/Page"');
	});

	test('an imported function is called with the url at run time', () => {
		const options: CompileOptions = {
			links: { base: { import: 'resolve', from: '$app/paths' } },
		};
		expect(compile('[a](/a#x) ![b](/b.png) [c](./c)\n', options).code).toBe(
			"<script>\nimport { resolve as __mdsvex_base } from '$app/paths';\n</script>" +
				"<p><a href={__mdsvex_base('/a#x')}>a</a> " +
				'<img src={__mdsvex_base(\'/b.png\')} alt="b" /> ' +
				'<a href="./c">c</a></p>'
		);
	});

	test('a document with no root url imports nothing', () => {
		expect(
			compile('[a](./a) [b](https://b.dev)\n', {
				links: { base: { import: 'resolve', from: '$app/paths' } },
			}).code
		).toBe('<p><a href="./a">a</a> <a href="https://b.dev">b</a></p>');
	});

	test('the url is a javascript string there, its references decoded', () => {
		const options: CompileOptions = {
			links: { base: { import: 'resolve', from: '$app/paths' } },
		};
		expect(href("[a](/a?x=1&amp;y='2')\n", options)).toBe(
			"{__mdsvex_base('/a?x=1&y=\\'2\\'')}"
		);
		// no table of named references is bundled, so this one stays as written
		expect(href('[a](/a&copy;)\n', options)).toBe('"/a&copy;"');
	});

	test('the import joins the script of the document and its image imports', () => {
		const { code } = compile(
			'<script>\nlet a = 1;\n</script>\n\n[a](/a) ![b](./b.png)\n',
			{
				import_images: true,
				links: { base: { import: 'resolve', from: '$app/paths' } },
			}
		);
		expect(code).toContain(
			"import __mdsvex_img_0 from './b.png';\nimport { resolve as __mdsvex_base } from '$app/paths';"
		);
		expect(code).toContain('let a = 1;');
		expect(code).toContain("href={__mdsvex_base('/a')}");
		expect(code).toContain('src={__mdsvex_img_0}');
	});

	test('the binding avoids a name the document holds', () => {
		const { code } = compile('[a](/a) `__mdsvex_base`\n', {
			links: { base: { import: 'resolve', from: '$app/paths' } },
		});
		expect(code).toContain('import { resolve as __mdsvex_base_ } from');
		expect(code).toContain("href={__mdsvex_base_('/a')}");
	});

	test('a default export is imported as one', () => {
		expect(
			compile('[a](/a)\n', {
				links: { base: { import: 'default', from: '#lib/base.js' } },
			}).code
		).toContain("import __mdsvex_base from '#lib/base.js';");
	});
});

describe('links options', () => {
	test.each([
		[{ links: 'x' }, 'links must be an object'],
		[{ links: { routes: 1 } }, 'links.routes must be a directory path'],
		[{ links: { routes: '' } }, 'links.routes must be a directory path'],
		[{ links: { base: 1 } }, 'links.base must be a string or { import, from }'],
		[
			{ links: { base: { import: 'a b', from: 'x' } } },
			'links.base.import must be the name of an export',
		],
		[
			{ links: { base: { import: 'a' } } },
			'links.base must be a string or { import, from }',
		],
		[{ links: { extensions: '.md' } }, 'links.extensions must be an array'],
		[
			{ links: { base: true } },
			'links.base: true takes the vite plugin, which reads the base of vite',
		],
	])('%j throws', (options, message) => {
		expect(() => compile('a\n', options as never)).toThrow(
			'[mdsvex] ' + message
		);
	});

	test('a document without the options is untouched by a session that had them', () => {
		const session = new CompilerSession();
		session.compile('[a](/a)\n', { links: { base: '/docs' } });
		expect(session.compile('[a](/a)\n').code).toBe('<p><a href="/a">a</a></p>');
		expect(session.compile('[a](/a)\n', { sourcemap: true }).code).toBe(
			'<p><a href="/a">a</a></p>'
		);
	});
});
