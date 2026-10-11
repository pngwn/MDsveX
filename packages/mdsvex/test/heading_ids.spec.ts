import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import GithubSlugger, { slug as github_slug } from 'github-slugger';
import { describe, expect, test } from 'vitest';

import {
	compile,
	compile_inputs,
	CompilerSession,
	heading_slug,
} from '../src/main';
import type {
	CompileOptions,
	ComponentSource,
	HeadingSlug,
	ParsePlugin,
	TraceTarget,
} from '../src/main';

const FIXTURES = resolve(
	dirname(fileURLToPath(import.meta.url)),
	'../../parse/test/fixtures'
);

const ON: CompileOptions = { heading_ids: true };

/** the body after the generated script */
function body(code: string): string {
	return code.replace(/^<script>\n[^]*?<\/script>/, '');
}

/** the id of every element that has one, in document order */
function ids(code: string): string[] {
	return Array.from(code.matchAll(/ id="([^"]*)"/g), (m) => m[1]);
}

/** the id of the one heading in raw, undefined when it has none */
function id_of(raw: string, options: CompileOptions = ON): string | undefined {
	return ids(compile(raw, options).code)[0];
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

/** the html of every entry point, which must all be the same */
function compile_every(raw: string, options: CompileOptions): string {
	const plain = compile(raw, options).code;
	const { parse_plugins, components, directives } = options;
	expect(compile(raw, { ...options, sourcemap: true }).code).toBe(plain);
	// twice over one session, the second document meets a used arena
	const session = new CompilerSession();
	for (let pass = 0; pass < 2; pass++) {
		expect(session.compile(raw, options).code).toBe(plain);
		expect(session.compile(raw, { ...options, sourcemap: true }).code).toBe(
			plain
		);
		expect(
			session.compile_v3(
				raw,
				'doc.svx',
				parse_plugins,
				components,
				undefined,
				options,
				directives,
				undefined,
				undefined,
				options
			).code
		).toBe(plain);
		expect(
			session.compile_trace(
				raw,
				parse_plugins,
				components,
				undefined,
				options,
				directives,
				undefined,
				undefined,
				options
			).code
		).toBe(plain);
		const into = target();
		session.compile_trace_into(
			raw,
			parse_plugins,
			into,
			components,
			undefined,
			options,
			directives,
			undefined,
			undefined,
			undefined,
			options
		);
		expect(into.html).toBe(plain);
	}
	return plain;
}

describe('heading text', () => {
	test('markup characters go, the text of inline markup stays', () => {
		expect(id_of('## Hello *bold* _em_ ~~gone~~ world')).toBe(
			'hello-bold-em-gone-world'
		);
		expect(id_of('## H^2^ and H~2~O')).toBe('h2-and-h2o');
		expect(id_of('## a \\* b \\_ c')).toBe('a--b-_-c');
		expect(id_of('###### deep   ')).toBe('deep');
	});

	test('a code span contributes its content, a highlight hint does not', () => {
		expect(id_of('## The `heading_ids` option')).toBe('the-heading_ids-option');
		expect(id_of('## `a < b` and `*raw*`')).toBe('a--b-and-raw');
		expect(id_of('## Use `#!js const x` now')).toBe('use-const-x-now');
		expect(id_of('## `&amp;`')).toBe('amp');
	});

	test('a link contributes its text, an image its alt', () => {
		expect(id_of('## See [the *docs*](/docs "title") now')).toBe(
			'see-the-docs-now'
		);
		expect(id_of('## ![a *cat* photo](/cat.png) Cats')).toBe(
			'a-cat-photo-cats'
		);
		expect(id_of('## [![logo](/l.png) home](/)')).toBe('logo-home');
		expect(id_of('## [ref] and ![pic]\n\n[ref]: /a\n[pic]: /b.png')).toBe(
			'ref-and-pic'
		);
	});

	test('an expression contributes nothing', () => {
		expect(id_of('## Version {version} notes')).toBe('version--notes');
		expect(id_of('## {title}')).toBeUndefined();
		expect(id_of('## Raw {@html markup} here')).toBe('raw--here');
		// the parser reads block tags in a line as expressions around plain text
		expect(id_of('## Plan {#if pro}pro{/if}')).toBe('plan-pro');
	});

	test('a component contributes nothing, an element its text', () => {
		expect(id_of('## Install <Badge>new</Badge>')).toBe('install');
		expect(id_of('## Install <Badge />')).toBe('install');
		expect(id_of('## A <ui.Tag>x</ui.Tag> B')).toBe('a--b');
		expect(id_of('## A <svelte:element this="b">x</svelte:element> B')).toBe(
			'a--b'
		);
		expect(id_of('## Press <kbd>Ctrl</kbd> + <kbd>C</kbd>')).toBe(
			'press-ctrl--c'
		);
		expect(id_of('## A <my-el>custom *el*</my-el>')).toBe('a-custom-el');
		expect(id_of('## A <!-- note --> B')).toBe('a--b');
	});

	test('a directive is a component, so it contributes nothing', () => {
		const options: CompileOptions = {
			heading_ids: true,
			directives: [{ specifier: 'mdsvex:directives', names: ['badge'] }],
		};
		expect(id_of('## Install :badge[new]', options)).toBe('install');
		expect(
			id_of('## Install :other[new]', { ...ON, strict_directives: false })
		).toBe('install');
	});

	test('a numeric reference is its character, a named one is dropped', () => {
		expect(id_of('## caf&#233; and caf&#xE9;')).toBe('café-and-café');
		expect(id_of('## Q&amp;A')).toBe('qa');
		expect(id_of('## Tom &amp; Jerry &copy; &mdash; &nbsp;')).toBe(
			'tom--jerry'
		);
		// not a reference, so the renderer shows it and the slug keeps its letters
		expect(id_of('## AT&T; and &nope;')).toBe('att-and-nope');
		expect(id_of('## a&#0;b&#xD800;c&#1114112;d')).toBe('abcd');
	});

	test('the ends are trimmed, runs inside are kept as github keeps them', () => {
		expect(id_of('## {a} Title {b}')).toBe('title');
		expect(id_of('## A & B')).toBe('a--b');
	});
});

describe('the default slug', () => {
	const ordinary = [
		'Hello World',
		'Getting started',
		'What is mdsvex?',
		'Options: the `highlight` option',
		'heading_ids',
		'snake_case and kebab-case',
		'1. First steps',
		'C++ / C# & Rust',
		'It\'s a "quoted" title',
		'Ünïcödé Çafé',
		'你好，世界',
		'Привет мир',
		'日本語 の 見出し',
		'العربية',
		'emoji 🎉 party 👩‍💻',
		'  spaced   out  ',
		'tab\tseparated',
		'UPPER lower MiXeD',
		'a.b.c (v1.2.3) [beta]',
		'100% — sure… “really”',
		'½ cup · №5 · x² · Ⅷ',
		'under_score __dunder__',
		'--flag and -x',
		'',
		'!!!',
	];

	test('is what github-slugger makes', () => {
		for (const text of ordinary)
			expect([text, heading_slug(text)]).toEqual([text, github_slug(text)]);
	});

	test('is what github-slugger makes of every fixture line', () => {
		const lines = new Set<string>();
		(function read(dir: string) {
			for (const entry of readdirSync(dir, { withFileTypes: true })) {
				const path = join(dir, entry.name);
				if (entry.isDirectory()) read(path);
				else if (/\.(md|svx)$/.test(entry.name))
					for (const line of readFileSync(path, 'utf8').split(/\r?\n/))
						lines.add(line);
			}
		})(FIXTURES);
		expect(lines.size).toBeGreaterThan(1000);
		for (const line of lines)
			expect([line, heading_slug(line)]).toEqual([line, github_slug(line)]);
	});

	test('differs for a code point only by keeping one unicode has named since', () => {
		// github-slugger drops what unicode 13 had not assigned, the engine keeps later letters
		const newer = /[\p{L}\p{M}\p{N}\p{Alphabetic}]/u;
		let differ = 0;
		for (let code = 0; code <= 0x10ffff; code++) {
			if (code >= 0xd800 && code <= 0xdfff) continue;
			const ch = String.fromCodePoint(code);
			const ours = heading_slug(ch);
			const theirs = github_slug(ch);
			if (ours === theirs) continue;
			differ++;
			if (theirs !== '' || ours !== ch.toLowerCase() || !newer.test(ch))
				throw new Error(
					`U+${code.toString(16)}: ${JSON.stringify(ours)} against ${JSON.stringify(theirs)}`
				);
		}
		expect(differ).toBeLessThan(20000);
		expect(heading_slug('\u{1F600}')).toBe('');
	});
});

describe('duplicate ids', () => {
	test('get -1, -2 and so on, as github-slugger numbers them', () => {
		const titles = ['Dup', 'Dup', 'dup 1', 'Dup', 'DUP', 'Dup 1', 'other'];
		const slugger = new GithubSlugger();
		const want = titles.map((t) => slugger.slug(t));
		expect(want).toEqual([
			'dup',
			'dup-1',
			'dup-1-1',
			'dup-2',
			'dup-3',
			'dup-1-2',
			'other',
		]);
		const raw = titles.map((t) => `## ${t}`).join('\n\n');
		expect(ids(compile(raw, ON).code)).toEqual(want);
	});

	test('the repeated headers fixture', () => {
		const raw = readFileSync(
			join(FIXTURES, 'markdown/repeated-headers.md'),
			'utf8'
		);
		expect(compile_every(raw, ON)).toBe(
			'<h1 id="same-title">Same Title</h1><p>some text</p><h1 id="same-title-1">Same Title</h1>'
		);
	});

	test('each document starts over', () => {
		const session = new CompilerSession();
		for (let i = 0; i < 3; i++) {
			expect(ids(session.compile('# A\n\n# A', ON).code)).toEqual(['a', 'a-1']);
			expect(ids(compile('# A\n\n# A', ON).code)).toEqual(['a', 'a-1']);
		}
	});
});

describe('a heading that has an id', () => {
	const fixed: ParsePlugin = {
		heading: {
			parse(node) {
				return () => {
					if (node.text_content === 'Fixed') node.attrs.id = 'intro';
				};
			},
		},
	};

	test('keeps the id a parse plugin set, and no made id takes it', () => {
		const raw = '## Intro\n\n## Fixed\n\n## Intro\n\n## Intro 1';
		expect(
			ids(compile_every(raw, { heading_ids: true, parse_plugins: [fixed] }))
		).toEqual(['intro-1', 'intro', 'intro-2', 'intro-1-1']);
	});

	test('an id on a heading typed as html is taken too, the html is not touched', () => {
		const raw =
			'## Later\n\n<h2 id="later">typed</h2>\n\n<h3>no id</h3>\n\n<div>\n\n<h4 id="deep">in a div</h4>\n\n## Deep\n\n</div>\n\ntext <h5 id="inline">x</h5>\n\n## Inline';
		const code = compile_every(raw, ON);
		expect(code).toContain('<h2 id="later-1">Later</h2>');
		expect(code).toContain('<h2 id="later">typed</h2>');
		expect(code).toContain('<h3>no id</h3>');
		expect(code).toContain('<h2 id="deep-1">Deep</h2>');
		expect(code).toContain('<h2 id="inline-1">Inline</h2>');
	});

	test('only a heading takes an id, and only one that is text', () => {
		const raw =
			'<div id="box">x</div>\n\n<h2 id={dynamic}>x</h2>\n\n## Box\n\n## Dynamic';
		expect(ids(compile(raw, ON).code)).toEqual(['box', 'box', 'dynamic']);
	});

	test('an id a plugin took away again is made', () => {
		const plugin: ParsePlugin = {
			heading: {
				parse(node) {
					node.attrs.id = 'gone';
					node.attrs.class = 'kept';
					delete node.attrs.id;
				},
			},
		};
		expect(
			compile('## Title', { heading_ids: true, parse_plugins: [plugin] }).code
		).toBe('<h2 class="kept" id="title">Title</h2>');
	});
});

describe('a heading whose text slugs to nothing', () => {
	test('gets no id, and does not count as a duplicate', () => {
		const raw = '## ???\n\n##\n\n## {title}\n\n## !!!\n\n## Real';
		expect(compile_every(raw, ON)).toBe(
			'<h2>???</h2><h2></h2><h2>{title}</h2><h2>!!!</h2><h2 id="real">Real</h2>'
		);
	});
});

describe('where the pass runs', () => {
	test('after the fused plugins and ahead of the sequential ones', () => {
		const log: string[] = [];
		const fused: ParsePlugin = {
			heading: {
				parse(node) {
					log.push(`fused open ${node.attrs.id}`);
					return () => {
						log.push(`fused close ${node.text_content} ${node.attrs.id}`);
						if (node.text_content === 'Two') node.attrs.id = 'second';
					};
				},
			},
		};
		const sequential: ParsePlugin = {
			sequential: true,
			heading: {
				parse(node) {
					log.push(`sequential ${node.attrs.id}`);
					node.prepend('link', { href: '#' + node.attrs.id });
				},
			},
		};
		const want = [
			'fused open undefined',
			'fused close One undefined',
			'fused open undefined',
			'fused close Two undefined',
			'sequential one',
			'sequential second',
		];
		const raw = '# One\n\n# Two';
		const options: CompileOptions = {
			heading_ids: true,
			// the order in the array does not move the pass
			parse_plugins: [sequential, fused],
		};
		const html =
			'<h1 id="one"><a href="#one"></a>One</h1><h1 id="second"><a href="#second"></a>Two</h1>';

		expect(compile(raw, options).code).toBe(html);
		expect(log).toEqual(want);

		const session = new CompilerSession();
		for (let i = 0; i < 2; i++) {
			log.length = 0;
			expect(session.compile(raw, options).code).toBe(html);
			expect(log).toEqual(want);
		}
		expect(compile_every(raw, options)).toBe(html);
	});

	test('a sequential plugin sees no id with the option off', () => {
		const seen: unknown[] = [];
		const sequential: ParsePlugin = {
			sequential: true,
			heading: {
				parse(node) {
					seen.push(node.attrs.id);
				},
			},
		};
		compile('# One', { parse_plugins: [sequential] });
		compile('# One', { parse_plugins: [sequential], heading_ids: false });
		expect(seen).toEqual([undefined, undefined]);
	});

	test('the text is read through a wrapper a fused plugin made', () => {
		const wrap: ParsePlugin = {
			heading: {
				parse(node) {
					const link = node.wrap_inner('link');
					return () => {
						link.attrs.href = '/x';
					};
				},
			},
		};
		expect(
			compile_every('## Wrapped *text*', {
				heading_ids: true,
				parse_plugins: [wrap],
			})
		).toBe(
			'<h2 id="wrapped-text"><a href="/x">Wrapped <strong>text</strong></a></h2>'
		);
	});

	test('a compile started in a plugin handler gets its own ids', () => {
		const inner: string[] = [];
		const reenter: ParsePlugin = {
			heading: {
				parse() {
					inner.push(
						compile('# In\n\n# In', ON).code,
						compile('# In', { parse_plugins: [{ heading: { parse() {} } }] })
							.code
					);
				},
			},
		};
		const session = new CompilerSession();
		expect(
			session.compile('# Out\n\n# Out', {
				heading_ids: true,
				parse_plugins: [reenter],
			}).code
		).toBe('<h1 id="out">Out</h1><h1 id="out-1">Out</h1>');
		expect(inner).toEqual([
			'<h1 id="in">In</h1><h1 id="in-1">In</h1>',
			'<h1>In</h1>',
			'<h1 id="in">In</h1><h1 id="in-1">In</h1>',
			'<h1>In</h1>',
		]);
	});
});

describe('the heading_ids option', () => {
	test('is off by default and with false', () => {
		const raw = '# One\n\n## Two';
		const off = '<h1>One</h1><h2>Two</h2>';
		expect(compile_every(raw, {})).toBe(off);
		expect(compile_every(raw, { heading_ids: false })).toBe(off);
		expect(compile(raw).code).toBe(off);
	});

	test('true and an object without slug use the default slug', () => {
		const raw = '# One *two*';
		const on = '<h1 id="one-two">One <strong>two</strong></h1>';
		expect(compile_every(raw, { heading_ids: true })).toBe(on);
		expect(compile_every(raw, { heading_ids: {} })).toBe(on);
	});

	test('slug gets the text and the depth, its result is made unique', () => {
		const calls: [string, unknown][] = [];
		const slug: HeadingSlug = (text, heading) => {
			calls.push([text, { ...heading }]);
			return text === 'none' ? '' : 'x';
		};
		const raw = '# A *b* `c`\n\n### {skip} Two\n\n## none\n\n###### A';
		expect(compile(raw, { heading_ids: { slug } }).code).toBe(
			'<h1 id="x">A <strong>b</strong> <code>c</code></h1><h3 id="x-1">{skip} Two</h3><h2>none</h2><h6 id="x-2">A</h6>'
		);
		expect(calls).toEqual([
			['A b c', { depth: 1 }],
			['Two', { depth: 3 }],
			['none', { depth: 2 }],
			['A', { depth: 6 }],
		]);
	});

	test('slug can build on the default one', () => {
		const slug: HeadingSlug = (text, { depth }) =>
			`h${depth}-${heading_slug(text)}`;
		expect(
			ids(
				compile_every('# Same\n\n## Same\n\n## Same', { heading_ids: { slug } })
			)
		).toEqual(['h1-same', 'h2-same', 'h2-same-1']);
	});

	test('slug is not called for a heading that has an id', () => {
		const texts: string[] = [];
		const plugin: ParsePlugin = {
			heading: {
				parse(node) {
					if (node.depth === 1) node.attrs.id = 'top';
				},
			},
		};
		compile('# One\n\n## Two', {
			parse_plugins: [plugin],
			heading_ids: {
				slug(text) {
					texts.push(text);
					return text;
				},
			},
		});
		expect(texts).toEqual(['Two']);
	});

	test('a slug that returns no string throws', () => {
		expect(() =>
			compile('# A', { heading_ids: { slug: (() => 1) as any } })
		).toThrow('[mdsvex] heading_ids.slug must return a string, it returned 1');
		expect(() =>
			compile('# A', { heading_ids: { slug: (() => undefined) as any } })
		).toThrow('heading_ids.slug must return a string');
	});

	test('anything else throws, with or without a heading', () => {
		const message =
			'[mdsvex] heading_ids must be true, false or an object with a slug function';
		for (const bad of ['yes', 1, null, { slug: 'github' }, () => 'x']) {
			expect(() => compile('text', { heading_ids: bad as any })).toThrow(
				message
			);
			expect(() =>
				new CompilerSession().compile_trace(
					'text',
					undefined,
					undefined,
					undefined,
					undefined,
					undefined,
					undefined,
					undefined,
					{ heading_ids: bad as any }
				)
			).toThrow(message);
		}
	});

	test('the renderer escapes a made id as it does any plugin attribute', () => {
		const slug: HeadingSlug = (text) => text;
		expect(compile('# a "b" <c> & {d}', { heading_ids: { slug } }).code).toBe(
			'<h1 id="a &quot;b&quot; &lt;c&gt; &amp;">a &quot;b&quot; &lt;c&gt; &amp; {d}</h1>'
		);
	});
});

describe('every way to compile', () => {
	const M = 'mdsvex:components';
	const components: ComponentSource[] = [{ specifier: M, names: ['h2', 'a'] }];

	test('a replaced heading gets the id as a prop', () => {
		const code = compile_every('# One\n\n## Two *b*\n\n## Two b', {
			heading_ids: true,
			components,
		});
		expect(body(code)).toBe(
			'<h1 id="one">One</h1><H2_MDSVEX_G id="two-b" level={2}>Two <strong>b</strong></H2_MDSVEX_G><H2_MDSVEX_G id="two-b-1" level={2}>Two b</H2_MDSVEX_G>'
		);
	});

	test('a document in a template, whose heading the template replaces', () => {
		const options: CompileOptions = {
			heading_ids: true,
			components,
			templates: {
				default: { specifier: 'mdsvex:template/post', components: ['h1'] },
			},
		};
		const raw = '---\ntitle: T\n---\n\n# One\n\n## Two\n\n# One\n';
		const code = compile_every(raw, options);
		expect(code).toContain(
			'<H1_MDSVEX_T id="one" level={1}>One</H1_MDSVEX_T><H2_MDSVEX_G id="two" level={2}>Two</H2_MDSVEX_G><H1_MDSVEX_T id="one-1" level={1}>One</H1_MDSVEX_T>'
		);
		expect(code).toContain('<Template_MDSVEX');
		// the template is picked after the pass
		expect(ids(compile(raw, { ...options, template: false }).code)).toEqual(
			ids(code)
		);
	});

	test('headings inside other blocks', () => {
		const raw = [
			'> ## Quote',
			'',
			'- ## Item',
			'',
			'<section>',
			'',
			'## Section',
			'',
			'</section>',
			'',
			'{#if show}',
			'',
			'## Shown',
			'',
			'{/if}',
			'',
			':::note',
			'',
			'## Note',
			'',
			':::',
			'',
			'| ## Cell |',
			'| --- |',
		].join('\n');
		// the bare container is a directive, so it needs its component
		const code = compile_every(raw, {
			heading_ids: true,
			directives: [{ specifier: 'mdsvex:directives', names: ['note'] }],
		});
		expect(code).toContain('<Note_MDSVEX_D_G>');
		expect(ids(code)).toEqual(['quote', 'item', 'section', 'shown', 'note']);
	});

	test('a \\r\\n source gets the ids of its \\n twin', () => {
		const raw = '# One *a*\n\ntext\n\n## One a\n';
		const crlf = raw.replace(/\n/g, '\r\n');
		expect(ids(compile_every(crlf, ON))).toEqual(['one-a', 'one-a-1']);
		const mapped = compile(crlf, { heading_ids: true, sourcemap: true });
		expect(mapped.code).toBe(compile(raw, ON).code);
		expect(mapped.mappings!.length).toBeGreaterThan(0);
	});

	test('a session matches one-shot compile, document after document', () => {
		const documents = [
			'# A\n\n# A\n',
			'plain\n',
			'---\ntitle: x\n---\n\n## B `c`\n',
			'## ???\n\n<h2 id="b">typed</h2>\n\n## B\n',
			'',
		];
		const plugins: ParsePlugin[] = [
			{ sequential: true, heading: { parse() {} } },
		];
		const variants: CompileOptions[] = [
			ON,
			{},
			{ heading_ids: { slug: (text) => text.length + 'x' } },
			{ heading_ids: true, parse_plugins: plugins },
			{ parse_plugins: plugins },
			{ heading_ids: true, components, sourcemap: true },
			{ heading_ids: false },
		];
		const session = new CompilerSession();
		for (let pass = 0; pass < 2; pass++)
			for (const options of variants)
				for (const raw of documents)
					expect(session.compile(raw, options)).toEqual(compile(raw, options));
	});

	test('kept inputs follow the option from one document to the next', () => {
		const session = new CompilerSession();
		const inputs = compile_inputs();
		const out = target();
		const run = (slug: HeadingSlug | undefined) => {
			inputs.heading_ids = slug;
			session.compile_into('# A\n\n# A', inputs, out);
			return out.html;
		};
		expect(run(heading_slug)).toBe('<h1 id="a">A</h1><h1 id="a-1">A</h1>');
		expect(run(undefined)).toBe('<h1>A</h1><h1>A</h1>');
		expect(run((text) => text + text)).toBe(
			'<h1 id="AA">A</h1><h1 id="AA-1">A</h1>'
		);
	});
});
