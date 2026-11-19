import { describe, expect, test } from 'vitest';
import {
	compile,
	compile_inputs,
	CompilerSession,
	SourceError,
} from '../src/main';
import type { CompileOptions, TraceTarget } from '../src/main';
import { create_highlight } from '../src/highlight';
import { default_languages } from '../src/highlight_languages';

const MATH = [
	'export function add(a: number, b: number) {',
	'\treturn a + b;',
	'}',
	'',
	'export const two = add(1, 1);',
	'',
].join('\n');
const sources = { './math.ts': MATH };
const with_sources: CompileOptions = { sources };

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

function thrown(
	doc: string,
	options: CompileOptions = with_sources
): SourceError {
	try {
		compile(doc, options);
	} catch (e) {
		expect(e).toBeInstanceOf(SourceError);
		return e as SourceError;
	}
	throw new Error('compiled');
}

describe('src=', () => {
	test('the fence shows the file, without the newline that ends it', () => {
		expect(compile('```ts src=./math.ts\n```\n', with_sources).code).toBe(
			'<pre><code class="language-ts">' +
				MATH.slice(0, -1).replace(/\{/g, '&#123;').replace(/\}/g, '&#125;') +
				'</code></pre>'
		);
	});

	test('a document without src= compiles as it did, with or without sources', () => {
		for (const doc of [
			'',
			'# a\n\ntext\n',
			'```ts\nlet a;\n```\n',
			'```ts title="src=./math.ts"\nlet src = 1;\n```\n',
			'`#!ts src=./math.ts`\n',
			'<img src="./a.png" alt="">\n',
			'```ts data-src=./math.ts\n```\n',
			'```ts src\n```\n',
		]) {
			const plain = compile(doc).code;
			expect(compile(doc, with_sources).code).toBe(plain);
			expect(compile(doc, { sources: false }).code).toBe(plain);
			expect(compile(doc, { sources, sourcemap: true }).code).toBe(plain);
		}
	});

	test.each([
		['#L2', '\treturn a + b;'],
		[
			'#L1-L2',
			'export function add(a: number, b: number) &#123;\n\treturn a + b;',
		],
		['#L5-L5', 'export const two = add(1, 1);'],
		['#L3-', '&#125;\n\nexport const two = add(1, 1);'],
		['#-L1', 'export function add(a: number, b: number) &#123;'],
		['#L4', ''],
		[
			'#L1-L5',
			MATH.slice(0, -1).replace(/\{/g, '&#123;').replace(/\}/g, '&#125;'),
		],
	])('the slice %s', (slice, code) => {
		expect(
			compile('```ts src=./math.ts' + slice + '\n```\n', with_sources).code
		).toBe('<pre><code class="language-ts">' + code + '</code></pre>');
	});

	test('a fence with no language takes it from the file name', () => {
		const files = {
			'./math.ts': 'a\n',
			'#lib/Counter.svelte': 'b\n',
			'../Dockerfile': 'c\n',
			'./types.d.ts': 'd\n',
			'./.env': 'e\n',
			'./A.JSON': 'f\n',
			'./dir.v2/': 'g\n',
		};
		const doc = Object.keys(files)
			.map((spec) => '```src=' + spec + '\n```\n')
			.join('\n');
		expect(compile(doc, { sources: files }).code).toBe(
			'<pre><code class="language-ts">a</code></pre>' +
				'<pre><code class="language-svelte">b</code></pre>' +
				'<pre><code class="language-dockerfile">c</code></pre>' +
				'<pre><code class="language-ts">d</code></pre>' +
				'<pre><code class="language-env">e</code></pre>' +
				'<pre><code class="language-json">f</code></pre>' +
				'<pre><code class="language-text">g</code></pre>'
		);
	});

	test('the language as written wins and a slice is no part of the name', () => {
		expect(
			compile(
				'```js src=./math.ts#L2\n```\n\n```src=./math.ts#L2\n```\n',
				with_sources
			).code
		).toBe(
			'<pre><code class="language-js">\treturn a + b;</code></pre>' +
				'<pre><code class="language-ts">\treturn a + b;</code></pre>'
		);
	});

	test('a quoted path may hold spaces, a subpath its own hash', () => {
		expect(
			compile(
				'```src="./my file.ts#L1"\n```\n\n```ts src=\'#lib/a.ts\'\n```\n\n```src=#lib/a.ts#L2\n```\n',
				{ sources: { './my file.ts': 'one\ntwo\n', '#lib/a.ts': 'x\ny\n' } }
			).code
		).toBe(
			'<pre><code class="language-ts">one</code></pre>' +
				'<pre><code class="language-ts">x\ny</code></pre>' +
				'<pre><code class="language-ts">y</code></pre>'
		);
	});

	test('wherever the fence sits', () => {
		const { code } = compile(
			'> ```ts src=./math.ts#L2\n> ```\n\n- item\n\n  ```ts src=./math.ts#L3\n  ```\n\n<div>\n\n```ts src=./math.ts#L5\n```\n\n</div>\n',
			with_sources
		);
		expect(code).toContain(
			'<blockquote>\n<pre><code class="language-ts">\treturn a + b;</code></pre>'
		);
		expect(code).toContain(
			'<pre><code class="language-ts">&#125;</code></pre>'
		);
		expect(code).toContain(
			'<pre><code class="language-ts">export const two = add(1, 1);</code></pre>'
		);
	});

	test('crlf and a byte order mark in the file are not code', () => {
		const files = { './a.ts': '﻿one\r\ntwo\r\nthree\r\n' };
		expect(
			compile('```src=./a.ts\n```\n\n```src=./a.ts#L2-L3\n```\n', {
				sources: files,
			}).code
		).toBe(
			'<pre><code class="language-ts">one\ntwo\nthree</code></pre>' +
				'<pre><code class="language-ts">two\nthree</code></pre>'
		);
	});

	test('the code is escaped as code of the document is', () => {
		expect(
			compile('```html src=./a.html\n```\n', {
				sources: { './a.html': '<a href="x">{y} & z</a>\n' },
			}).code
		).toBe(
			'<pre><code class="language-html">&lt;a href=&quot;x&quot;&gt;&#123;y&#125; &amp; z&lt;/a&gt;</code></pre>'
		);
	});

	test('every kind of compile shows the file', () => {
		const doc = '# t\n\n```ts src=./math.ts#L2 {1}\n```\n\nafter\n';
		const plain = compile(doc, with_sources).code;
		expect(plain).toBe(
			'<h1>t</h1><pre><code class="language-ts">\treturn a + b;</code></pre><p>after</p>'
		);
		expect(compile(doc, { sources, sourcemap: true }).code).toBe(plain);
		const session = new CompilerSession();
		expect(session.compile(doc, with_sources).code).toBe(plain);
		expect(session.compile(doc, { sources, sourcemap: true }).code).toBe(plain);
		const inputs = Object.assign(compile_inputs(), { sources });
		const out = target();
		session.compile_into(doc, inputs, out);
		expect(out.html).toBe(plain);
		// the session keeps its renderer, the next document reads its own fence
		expect(session.compile('```ts\nlet a;\n```\n').code).toBe(
			'<pre><code class="language-ts">let a;</code></pre>'
		);
		// a parse plugin keeps the document off the shared session
		expect(
			compile(doc, { sources, parse_plugins: [{ heading: { parse() {} } }] })
				.code
		).toBe(plain);
	});

	test('the mappings stay inside the document', () => {
		const doc = '```ts src=./math.ts\n```\n\nafter {the} fence\n';
		const { mappings } = compile(doc, { sources, sourcemap: true });
		for (const m of mappings!) {
			expect(m.sourceOffsets[0] + m.lengths[0]).toBeLessThanOrEqual(doc.length);
		}
	});

	test('false leaves the fence as written', () => {
		expect(compile('```ts src=./math.ts\n```\n', { sources: false }).code).toBe(
			'<pre><code class="language-ts"></code></pre>'
		);
		expect(
			compile('```ts src=./math.ts\nbody\n```\n', { sources: false }).code
		).toBe('<pre><code class="language-ts">body</code></pre>');
	});
});

describe('src= and a highlighter', () => {
	const highlight = create_highlight({ languages: default_languages });

	test('the highlighter is given the code of the file and never the src=', () => {
		const seen: unknown[] = [];
		const { code } = compile('```src=./math.ts#L2 {1} title="x"\n```\n', {
			sources,
			highlight(code, info) {
				seen.push([code, info.lang, info.meta]);
				return null;
			},
		});
		expect(seen).toEqual([['\treturn a + b;', 'ts', '{1} title="x"']]);
		expect(code).toBe(
			'<pre><code class="language-ts">\treturn a + b;</code></pre>'
		);
	});

	test('twinkleplop highlights it in the language of the file', () => {
		const { code, warnings } = compile('```src=./math.ts#L5\n```\n', {
			sources,
			highlight,
		});
		expect(code).toContain('<pre class="twinkleplop language-ts"');
		expect(code.replace(/<[^>]+>/g, '')).toBe('export const two = add(1, 1);');
		expect(warnings).toBeUndefined();
	});

	test('a file name that is no language warns as any unknown language does', () => {
		const { code, warnings } = compile('```src=./notes.nope\n```\n', {
			sources: { './notes.nope': 'a\n' },
			highlight,
		});
		expect(code).toContain('language-nope');
		expect(code.replace(/<[^>]+>/g, '')).toBe('a');
		expect(warnings?.map((w) => w.code)).toEqual(['unknown_language']);
	});

	test('a math fence renders the latex of the file', () => {
		const { code } = compile('```math src=./eq.tex\n```\n', {
			sources: { './eq.tex': 'x^2\n' },
			math: (latex) => `<b>${latex}</b>`,
		});
		expect(code).toBe(
			'<div class="math math-display" translate="no"><b>x^2</b></div>'
		);
	});
});

describe('src= and a pre replacement', () => {
	const components = [{ specifier: '#lib/md.ts', names: ['pre'] }];

	test('gets src as written, the code and the language', () => {
		const { code, warnings } = compile(
			'```src=./math.ts#L2 title="add" wide\n```\n',
			{ sources, components }
		);
		expect(code).toContain(
			'<Pre_MDSVEX_G lang={"ts"} meta={"title=\\"add\\" wide"} title={"add"} wide={true} src={"./math.ts#L2"} code={"\\treturn a + b;"}>' +
				'<pre><code class="language-ts">\treturn a + b;</code></pre></Pre_MDSVEX_G>'
		);
		expect(warnings).toBeUndefined();
	});

	test('a highlighted one too', () => {
		const { code } = compile('```src=./math.ts#L5\n```\n', {
			sources,
			components,
			highlight: create_highlight({ languages: default_languages }),
		});
		expect(code).toMatch(
			/<Pre_MDSVEX_G lang=\{"ts"\} src=\{"\.\/math\.ts#L5"\} code=\{"export const two = add\(1, 1\);"\}/
		);
	});

	test('a fence without src= gets no src prop, and a bare src flag is dropped', () => {
		const { code, warnings } = compile('```ts src\nlet a;\n```\n', {
			sources,
			components,
		});
		expect(code).not.toContain(' src=');
		expect(warnings?.map((w) => w.code)).toEqual(['meta_prop_ignored']);
	});
});

describe('src= errors', () => {
	test('a file with no text is a SourceError at the fence', () => {
		const e = thrown('a\n\n  ```ts src=./gone.ts\n  ```\n', {
			sources,
			filename: '/docs/a.md',
		});
		expect(e.code).toBe('src_missing');
		expect(e.spec).toBe('./gone.ts');
		expect([e.line, e.column]).toEqual([3, 3]);
		expect(e.message).toBe(
			'No text was given for ./gone.ts, pass it in the sources option (fence at /docs/a.md:3)'
		);
		expect(thrown('```src=./math.ts\n```\n', {}).code).toBe('src_missing');
		expect(thrown('```src=toString\n```\n', { sources: {} }).code).toBe(
			'src_missing'
		);
	});

	test('a body is a SourceError, blank lines and quote markers are none', () => {
		const e = thrown('# t\n\n```ts src=./math.ts\nlet mine;\n```\n');
		expect(e.code).toBe('src_body');
		expect([e.line, e.column]).toEqual([3, 1]);
		expect(e.message).toBe(
			'A fence with src= shows ./math.ts, so it can have no code of its own (fence at line 3)'
		);
		for (const doc of [
			'```ts src=./math.ts\n\n\n```\n',
			'```ts src=./math.ts\n  \n```\n',
			'> ```ts src=./math.ts\n>\n> ```\n',
		])
			expect(compile(doc, with_sources).code).toContain('add(1, 1)');
	});

	test.each([
		['#L9', 'line 9', 5],
		['#L2-L9', 'lines 2 to 9', 5],
		['#L6-', 'lines 6 to 5', 5],
		['#-L6', 'lines 1 to 6', 5],
	])('the slice %s is outside the file', (slice, asked, has) => {
		const e = thrown('```ts src=./math.ts' + slice + '\n```\n');
		expect(e.code).toBe('src_slice');
		expect(e.message).toBe(
			`./math.ts${slice} asks for ${asked}, ./math.ts has ${has} (fence at line 1)`
		);
		expect([e.line, e.column]).toEqual([1, 1]);
	});

	test.each(['#L0', '#L5-L2', '#L2-3', '#L', '#-L', '#L2-L3-L4', '#2'])(
		'the slice %s is no line range',
		(slice) => {
			const e = thrown('```ts src=./math.ts' + slice + '\n```\n');
			expect(e.code).toBe('src_spec');
			expect(e.message).toContain('has a slice that is no line range');
		}
	);

	test('a src= that names nothing', () => {
		for (const doc of [
			'```ts src=\n```\n',
			'```src=""\n```\n',
			'```ts src=#L5\n```\n',
		]) {
			const e = thrown(doc);
			expect(e.code).toBe('src_spec');
		}
	});

	test('positions hold in a document with crlf', () => {
		const e = thrown('a\r\n\r\n```ts src=./gone.ts\r\n```\r\n');
		expect([e.line, e.column]).toEqual([3, 1]);
	});

	test('a text that is no string is a type error', () => {
		expect(() =>
			compile('```src=./a.ts\n```\n', { sources: { './a.ts': 1 as never } })
		).toThrow('[mdsvex] sources["./a.ts"] must be the text of the file');
	});

	test('a session that threw compiles the next document', () => {
		const session = new CompilerSession();
		expect(() =>
			session.compile('```src=./gone.ts\n```\n', with_sources)
		).toThrow(SourceError);
		expect(
			session.compile('```src=./math.ts#L2\n```\n', with_sources).code
		).toBe('<pre><code class="language-ts">\treturn a + b;</code></pre>');
		expect(session.compile('```ts\nx\n```\n').code).toBe(
			'<pre><code class="language-ts">x</code></pre>'
		);
	});
});

describe('src= between a parse and a render', () => {
	test('a parsed document lists its files once each, with the fence that names it first', () => {
		const session = new CompilerSession();
		const inputs = compile_inputs();
		const parsed = session.parse(
			'![a](./a.png)\n\n```src=./math.ts#L1\n```\n\n```ts src=./math.ts#L2\n```\n\n```src=#lib/b.ts\n```\n',
			Object.assign(inputs, { import_images: true })
		);
		expect(parsed.needs).toEqual([
			{
				type: 'image',
				url: './a.png',
				specifier: './a.png',
				name: '__mdsvex_img_0',
			},
			{ type: 'source', spec: './math.ts', start: { line: 3, column: 0 } },
			{ type: 'source', spec: '#lib/b.ts', start: { line: 9, column: 0 } },
		]);
		inputs.sources = { './math.ts': MATH, '#lib/b.ts': 'b\n' };
		const { code } = session.render(parsed, inputs);
		expect(code).toContain('<code class="language-ts">\treturn a + b;</code>');
		expect(code).toContain('<code class="language-ts">b</code>');
		expect(code).toContain('src={__mdsvex_img_0}');
	});

	test('an into compile stops after the parse when it is told to wait', () => {
		const session = new CompilerSession();
		const inputs = compile_inputs();
		inputs.await_sources = true;
		const out = target();
		session.compile_into('# a\n\n```src=./math.ts#L2\n```\n', inputs, out);
		const waiting = out.waiting!;
		expect(waiting.needs).toEqual([
			{ type: 'source', spec: './math.ts', start: { line: 3, column: 0 } },
		]);
		expect(out.html).toBe('');
		out.waiting = undefined;
		// other documents compile meanwhile, larger ones too
		session.compile_into('- item *a*\n'.repeat(300), inputs, out);
		expect(out.waiting).toBeUndefined();
		expect(out.html).toContain('<li>item <strong>a</strong></li>');
		inputs.sources = sources;
		session.render_into(waiting, inputs, out);
		expect(out.html).toBe(
			'<h1>a</h1><pre><code class="language-ts">\treturn a + b;</code></pre>'
		);
		// with the text at hand a compile goes straight through
		session.compile_into('```src=./math.ts#L3\n```\n', inputs, out);
		expect(out.waiting).toBeUndefined();
		expect(out.html).toBe('<pre><code class="language-ts">&#125;</code></pre>');
	});

	test('a waiting document says when it has math', () => {
		const session = new CompilerSession();
		const inputs = compile_inputs();
		inputs.await_sources = true;
		const out = target();
		session.compile_into(
			'```src=./a.ts\n```\n\n```math\nx\n```\n',
			inputs,
			out
		);
		expect(out.waiting!.math).toBe(true);
		session.compile_into(
			'```src=./a.ts\n```\n\n```mathematica\nx\n```\n',
			inputs,
			out
		);
		expect(out.waiting!.math).toBe(false);
	});

	test('without the wait a missing file throws', () => {
		const session = new CompilerSession();
		expect(() =>
			session.compile_into(
				'```src=./math.ts\n```\n',
				compile_inputs(),
				target()
			)
		).toThrow(SourceError);
	});

	test('a kept document keeps its fences', () => {
		const session = new CompilerSession();
		const inputs = Object.assign(compile_inputs(), { sources });
		const out = target();
		const doc = '```src=./math.ts#L2\n```\n';
		session.compile_into(doc, inputs, out);
		const parsed = session.keep(doc, inputs, out.metadata);
		expect(parsed.needs).toEqual([
			{ type: 'source', spec: './math.ts', start: { line: 1, column: 0 } },
		]);
		session.render_into(parsed, inputs, out);
		expect(out.html).toBe(
			'<pre><code class="language-ts">\treturn a + b;</code></pre>'
		);
	});

	test('a fence a parse plugin makes is seen', () => {
		const { code } = compile('> quoted\n', {
			sources,
			parse_plugins: [
				{
					block_quote: {
						parse(node) {
							return () =>
								void node.append('code_fence', { info: 'src=./math.ts#L2' });
						},
					},
				},
			],
		});
		expect(code).toContain('<code class="language-ts">\treturn a + b;</code>');
	});
});
