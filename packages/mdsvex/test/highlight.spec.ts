import { parse_meta } from '@twinkleplop/markdown-core';
import { shiki_notation } from '@twinkleplop/annotation/shiki';
import { tokenize as json } from '@twinkleplop/json';
import { describe, expect, test } from 'vitest';

import { compile, CompilerSession } from '../src/main';
import type {
	CodeInfo,
	CompileWarning,
	ComponentSource,
	HighlightOption,
} from '../src/main';
import {
	create_highlight,
	default_annotations,
	load_default_languages,
} from '../src/highlight';
import type { HighlightOptions } from '../src/highlight';
import { meta_parts, read_meta, split_element } from '../src/code_meta';

const languages = await load_default_languages();
const highlight = create_highlight({ languages });

const PRE: ComponentSource[] = [
	{ specifier: 'mdsvex:components', names: ['pre'] },
];
const CODE: ComponentSource[] = [
	{ specifier: 'mdsvex:components', names: ['code'] },
];

function html(raw: string, option: HighlightOption = highlight) {
	return compile(raw, { highlight: option }).code;
}

function with_options(options: Omit<HighlightOptions, 'languages'>) {
	return create_highlight({ languages, ...options });
}

/** the body after the generated script */
function body(code: string): string {
	return code.replace(/^<script>\n[^]*?<\/script>/, '');
}

function codes(warnings: CompileWarning[] | undefined) {
	return (warnings ?? []).map((w) => [w.code, w.start.line]);
}

describe('compile without highlight', () => {
	test('renders plain code, the class carries the language only', () => {
		expect(compile('```ts title="a" {1}\nlet a = {};\n```').code).toBe(
			'<pre><code class="language-ts">let a = &#123;&#125;;</code></pre>'
		);
	});

	test('false and undefined render the same', () => {
		const raw = '```ts\nx\n```\n\n`#!ts y`';
		expect(compile(raw, { highlight: false }).code).toBe(compile(raw).code);
	});

	test('a #! code span stays a plain code element', () => {
		expect(compile('`#!ts let a`').code).toBe('<p><code>let a</code></p>');
	});

	test('rejects an option that is not a config, a function or false', () => {
		expect(() =>
			compile('```\nx\n```', { highlight: {} as HighlightOption })
		).toThrow(/create_highlight/);
	});
});

describe('twinkleplop fences', () => {
	test('a fence renders twinkleplop markup with escaped braces', () => {
		expect(html('```ts\nlet a = {};\n```')).toBe(
			'<pre class="twinkleplop language-ts" data-language="ts"><code><span class="l">' +
				'<span class="tok keyword">let</span> <span class="tok identifier">a</span> ' +
				'<span class="tok operator">=</span> <span class="tok punctuation">&#123;&#125;;</span>' +
				'</span></code></pre>'
		);
	});

	test('the default aliases and the lowercase name find a language', () => {
		for (const lang of [
			'js',
			'mjs',
			'TS',
			'JSON',
			'Dockerfile',
			'sh',
			'yml',
			'py',
			'rs',
			'md',
			'console',
			'env',
			'patch',
			'jsx',
		]) {
			const out = compile('```' + lang + '\nx\n```', { highlight });
			expect(out.warnings, lang).toBeUndefined();
			expect(out.code, lang).toContain(
				`language-${lang}" data-language="${lang}"`
			);
		}
	});

	test('every bundled language highlights', () => {
		for (const lang of Object.keys(languages)) {
			const out = compile('```' + lang + '\nx = 1\n```', { highlight });
			expect(out.warnings, lang).toBeUndefined();
		}
		expect(Object.keys(languages)).toContain('svelte');
	});

	test('a title and a caption wrap the block in a figure', () => {
		expect(html('```ts title="math.ts" caption="sum {a}"\nx\n```')).toBe(
			'<figure class="twinkleplop-block" data-language="ts">\n' +
				'<figcaption class="twinkleplop-title">math.ts</figcaption>\n' +
				'<pre class="twinkleplop language-ts" data-language="ts"><code><span class="l"><span class="tok identifier">x</span></span></code></pre>\n' +
				'<figcaption class="twinkleplop-caption">sum &#123;a&#125;</figcaption>\n' +
				'</figure>'
		);
		expect(html('```ts [math.ts]\nx\n```')).toContain(
			'<figcaption class="twinkleplop-title">math.ts</figcaption>'
		);
	});

	test('the meta conventions highlight lines and words and number lines', () => {
		expect(html('```ts {2} /b/ :line-numbers=5\na\nb\n```')).toBe(
			'<pre class="twinkleplop language-ts has-highlighted-word has-highlight" data-language="ts"><code>' +
				'<span class="l"><span class="ln">5</span><span class="tok identifier">a</span></span>\n' +
				'<span class="l highlight"><span class="ln">6</span><span class="tok highlighted-word">' +
				'<span class="tok identifier">b</span></span></span></code></pre>'
		);
	});

	test('the default annotations apply and their markers go', () => {
		const out = html('```ts\nlet a = 1; // [!hl]\n```');
		expect(out).toContain('<span class="l highlight">');
		expect(out).not.toContain('[!hl]');
		expect(default_annotations).toHaveLength(10);
	});

	test('annotations false keeps markers as code', () => {
		const out = html(
			'```ts\nlet a = 1; // [!hl]\n```',
			with_options({ annotations: false })
		);
		expect(out).toContain('[!hl]');
		expect(out).not.toContain('highlight');
	});

	test('shiki notation is opt in', () => {
		const raw = '```ts\nlet a = 1; // [!code ++]\n```';
		expect(html(raw)).toContain('[!code ++]');
		const shiki = with_options({
			annotations: [...default_annotations, shiki_notation()],
		});
		expect(html(raw, shiki)).not.toContain('[!code ++]');
	});

	test('an annotation issue is a warning at the fence', () => {
		const out = compile('a\n\n```ts\nlet a; // [!hl nope..]\n```', {
			highlight,
		});
		expect(codes(out.warnings)).toEqual([['annotation', 3]]);
	});

	test('a fence with no language is plain twinkleplop markup', () => {
		expect(html('```\nx {y}\n```')).toBe(
			'<pre class="twinkleplop"><code><span class="l">x &#123;y&#125;</span></code></pre>'
		);
	});

	test('default_language highlights a fence with no language', () => {
		const out = html(
			'```\nlet a\n```',
			with_options({ default_language: 'ts' })
		);
		expect(out).toContain('class="twinkleplop language-ts" data-language="ts"');
		expect(out).toContain('tok keyword');
		expect(() => with_options({ default_language: 'nope' })).toThrow(
			/default_language/
		);
	});

	test('an unknown language renders plain and warns once per compile', () => {
		const raw = '```nope\na {b}\n```\n\n```nope\nc\n```\n\n```other\nd\n```';
		const out = compile(raw, { highlight });
		expect(out.code).toContain(
			'<pre class="twinkleplop language-nope" data-language="nope"><code><span class="l">a &#123;b&#125;</span></code></pre>'
		);
		expect(codes(out.warnings)).toEqual([
			['unknown_language', 1],
			['unknown_language', 9],
		]);
	});

	test('on_unknown_language throw fails with where the fence is', () => {
		const strict = with_options({ on_unknown_language: 'throw' });
		expect(() =>
			compile('a\n\n```nope\nx\n```', {
				highlight: strict,
				filename: 'doc.svx',
			})
		).toThrow('unknown fence language "nope" (`nope` fence at doc.svx:3)');
	});

	test('a line past the end of the fence fails the compile', () => {
		expect(() => compile('```ts {3}\nx\n```', { highlight })).toThrow(
			"line 3 is beyond the fence's 1 line (`ts` fence at line 1)"
		);
	});

	test('the markdown language highlights its fences and front matter', () => {
		const out = html('````md\n---\na: 1\n---\n\n```ts\nlet a\n```\n````');
		expect(out).toContain('tok keyword');
		expect(out).toContain('tok property');
	});

	test('languages take modules, aliases and highlight functions', () => {
		const own = create_highlight({
			languages: {
				data: { tokenize: json },
				d: 'data',
				shout: (code) =>
					`<pre class="shout"><code>${code.toUpperCase()}</code></pre>`,
			},
		});
		expect(html('```d\n{"a": 1}\n```', own)).toContain(
			'<span class="tok punctuation">&#123;</span>'
		);
		expect(html('```shout\n{a}\n```', own)).toBe(
			'<pre class="shout"><code>&#123;A&#125;</code></pre>'
		);
		expect(compile('```ts\nx\n```', { highlight: own }).warnings).toHaveLength(
			1
		);
	});

	test('a broken alias fails create_highlight', () => {
		expect(() => create_highlight({ languages: { a: 'b' } })).toThrow(
			/aliases "b"/
		);
		expect(() => create_highlight({ languages: { a: 'b', b: 'a' } })).toThrow(
			/cycle/
		);
		expect(() =>
			create_highlight({ languages: { a: 1 as unknown as string } })
		).toThrow(/must be a twinkleplop language module/);
	});

	test('line_numbers, render and parse_meta set render options', () => {
		expect(
			html('```ts\nx\n```', with_options({ line_numbers: true }))
		).toContain('<span class="ln">1</span>');
		expect(
			html(
				'```ts :no-line-numbers\nx\n```',
				with_options({ line_numbers: true })
			)
		).not.toContain('class="ln"');
		expect(
			html('```ts\nx\n```', with_options({ render: { class_name: 'code' } }))
		).toContain('class="code language-ts"');
		const danger = with_options({
			parse_meta: (raw, parsed) => ({
				...parsed,
				class_name: raw.includes('danger')
					? parsed.class_name + ' danger'
					: parsed.class_name,
			}),
		});
		expect(html('```ts danger\nx\n```', danger)).toContain(
			'class="twinkleplop language-ts danger"'
		);
	});

	test('a twoslash fence uses the twoslash highlighter of its language', () => {
		const calls: string[] = [];
		const config = with_options({
			twoslash: {
				typescript: (code) => {
					calls.push(code);
					return '<pre class="twoslash"><code>{t}</code></pre>';
				},
			},
		});
		expect(html('```ts twoslash\nlet a\n```', config)).toBe(
			'<pre class="twoslash"><code>&#123;t&#125;</code></pre>'
		);
		expect(calls).toEqual(['let a']);
		expect(() => html('```css twoslash\na\n```', config)).toThrow(
			'"css" has no twoslash highlighter'
		);
		expect(() => with_options({ twoslash: { nope: () => '' } })).toThrow(
			/twoslash.nope/
		);
	});
});

describe('inline code', () => {
	test('a #! hint highlights the code span', () => {
		expect(html('Use `#!ts let a = {}` here.')).toBe(
			'<p>Use <code class="twinkleplop twinkleplop-inline language-ts"><span class="tok keyword">let</span> ' +
				'<span class="tok identifier">a</span> <span class="tok operator">=</span> ' +
				'<span class="tok punctuation">&#123;&#125;</span></code> here.</p>'
		);
	});

	test('a code span without a hint stays plain', () => {
		expect(html('`let a = {}`')).toBe(
			'<p><code>let a = &#123;&#125;</code></p>'
		);
	});

	test('the curly colon suffix is not a hint', () => {
		expect(html('`let a{:ts}`')).toBe(
			'<p><code>let a&#123;:ts&#125;</code></p>'
		);
	});

	test('an unknown hint renders plain and warns', () => {
		const out = compile('`#!nope a`', { highlight });
		expect(out.code).toBe(
			'<p><code class="twinkleplop twinkleplop-inline language-nope">a</code></p>'
		);
		expect(codes(out.warnings)).toEqual([['unknown_language', 1]]);
	});
});

describe('custom highlighters', () => {
	test('get the code and what is known about it, braces are escaped', () => {
		const seen: [string, CodeInfo][] = [];
		const custom: HighlightOption = (code, info) => {
			seen.push([code, info]);
			return info.inline
				? `<code data-x="{x}">${code}</code>`
				: `<pre style="a:{b}"><code>${code}</code></pre>`;
		};
		const out = compile('```js title="t" {1}\n{a}\n```\n\n`#!ts {b}` `{c}`', {
			highlight: custom,
			filename: 'doc.svx',
		});
		expect(out.code).toBe(
			'<pre style="a:&#123;b&#125;"><code>&#123;a&#125;</code></pre>' +
				'<p><code data-x="&#123;x&#125;">&#123;b&#125;</code> <code>&#123;c&#125;</code></p>'
		);
		expect(seen).toEqual([
			[
				'{a}',
				{
					lang: 'js',
					meta: 'title="t" {1}',
					inline: false,
					filename: 'doc.svx',
				},
			],
			['{b}', { lang: 'ts', meta: '', inline: true, filename: 'doc.svx' }],
		]);
	});

	test('null or undefined renders plain', () => {
		const out = html('```js\n{a}\n```\n\n`#!ts b`', () => null);
		expect(out).toBe(
			'<pre><code class="language-js">&#123;a&#125;</code></pre><p><code>b</code></p>'
		);
		expect(html('```js\na\n```', () => undefined)).toBe(
			'<pre><code class="language-js">a</code></pre>'
		);
	});

	test('a return that is not a string fails with where the fence is', () => {
		expect(() =>
			html('```js\na\n```', (() => 1) as unknown as HighlightOption)
		).toThrow(
			'a highlighter must return a string, null or undefined, it returned number (`js` fence at line 1)'
		);
	});

	test('an error keeps its class and gains where the fence is', () => {
		const out = () =>
			compile('x\n\n```js\na\n```', {
				highlight: () => {
					throw new RangeError('bad');
				},
				filename: 'a.svx',
			});
		expect(out).toThrow(RangeError);
		expect(out).toThrow('bad (`js` fence at a.svx:3)');
	});
});

describe('a replaced pre', () => {
	test('gets the whole highlighted <pre> as children and the meta as props', () => {
		const raw =
			'```ts title="math.ts" caption="c" {1} playground height=300 theme="dark"\nlet a = 1; // [!hl]\n```';
		expect(body(compile(raw, { highlight, components: PRE }).code)).toBe(
			'<Pre_MDSVEX_G lang={"ts"} meta={"title=\\"math.ts\\" caption=\\"c\\" {1} playground height=300 theme=\\"dark\\""}' +
				' title={"math.ts"} caption={"c"} playground={true} height={"300"} theme={"dark"} code={"let a = 1;"}>' +
				'<pre class="twinkleplop language-ts has-highlight" data-language="ts"><code><span class="l highlight">' +
				'<span class="tok keyword">let</span> <span class="tok identifier">a</span> <span class="tok operator">=</span> ' +
				'<span class="tok number">1</span><span class="tok punctuation">;</span></span></code></pre></Pre_MDSVEX_G>'
		);
	});

	test('a meta prop never replaces a built in prop', () => {
		const out = compile(
			'```ts code=1 lang meta="m" class=x children title=t\nx\n```',
			{
				highlight,
				components: PRE,
			}
		);
		expect(body(out.code)).toMatch(
			/^<Pre_MDSVEX_G lang=\{"ts"\} meta=\{[^}]*\} code=\{"x"\}><pre /
		);
		expect(out.warnings!.map((w) => w.message)).toEqual([
			'the meta prop code is dropped, the pre component already takes code',
			'the meta prop lang is dropped, the pre component already takes lang',
			'the meta prop meta is dropped, the pre component already takes meta',
			'the meta prop class is dropped, the pre component already takes class',
			'the meta prop children is dropped, the pre component already takes children',
			'the meta prop title is dropped, the pre component already takes title',
		]);
		expect(new Set(codes(out.warnings).map(([c]) => c))).toEqual(
			new Set(['meta_prop_ignored'])
		);
	});

	test('an unreplaced pre drops meta props silently', () => {
		const out = compile('```ts code=1 playground\nx\n```', { highlight });
		expect(out.warnings).toBeUndefined();
		expect(out.code).not.toContain('playground');
	});

	test('a custom highlighter output is the children as it is', () => {
		const wrapped = compile('```js [a.js] x=1\n{a}\n```', {
			highlight: (code) => `<div class="w"><pre>${code}</pre></div>`,
			components: PRE,
		});
		expect(body(wrapped.code)).toBe(
			'<Pre_MDSVEX_G lang={"js"} meta={"[a.js] x=1"} title={"a.js"} x={"1"} code={"{a}"}>' +
				'<div class="w"><pre>&#123;a&#125;</pre></div></Pre_MDSVEX_G>'
		);
		expect(wrapped.warnings).toBeUndefined();
	});

	test('the plain render gets the <pre> as children too', () => {
		expect(body(compile('```ts\n  a\n```', { components: PRE }).code)).toBe(
			'<Pre_MDSVEX_G lang={"ts"} code={"  a"}><pre><code class="language-ts">  a</code></pre></Pre_MDSVEX_G>'
		);
	});
});

describe('a replaced code', () => {
	test('a #! span gets lang and its class as props, the tokens as children', () => {
		expect(
			body(compile('`#!ts a`', { highlight, components: CODE }).code)
		).toBe(
			'<p><Code_MDSVEX_G lang={"ts"} class="twinkleplop twinkleplop-inline language-ts">' +
				'<span class="tok identifier">a</span></Code_MDSVEX_G></p>'
		);
	});

	test('a custom output that is not a single <code> stays as it is', () => {
		const out = compile('`#!ts a`', {
			highlight: (code) => `<span>${code}</span>`,
			components: CODE,
		});
		expect(body(out.code)).toBe('<p><span>a</span></p>');
		expect(codes(out.warnings)).toEqual([['code_replacement_skipped', 1]]);
	});
});

describe('every walk', () => {
	test('renders each fence once per compile', () => {
		let calls = 0;
		const counting: HighlightOption = (code) => {
			calls++;
			return `<pre>${code}</pre>`;
		};
		const raw = '```js\na\n```\n\n```js\nb\n```';
		const session = new CompilerSession();
		session.compile(raw, { highlight: counting });
		session.compile(raw, { highlight: counting, sourcemap: true });
		session.compile_trace(
			raw,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			counting
		);
		session.compile_v3(
			raw,
			'a.svx',
			undefined,
			PRE,
			undefined,
			undefined,
			undefined,
			undefined,
			counting
		);
		expect(calls).toBe(8);
	});

	test('map the fence content as one record', () => {
		const raw = '# a\n\n```ts\nlet a = {};\nlet b;\n```\n';
		const { code, mappings } = compile(raw, { highlight, sourcemap: true });
		const start = code.indexOf('<code>');
		const content = mappings!.filter(
			(m) => m.sourceOffsets[0] === raw.indexOf('let a')
		);
		expect(content).toHaveLength(1);
		expect(content[0].generatedOffsets[0]).toBe(start);
		expect(content[0].lengths[0]).toBe('let a = {};\nlet b;'.length);
		expect(code.slice(start, start + content[0].generatedLengths![0])).toMatch(
			/^<code>[^]*<\/code>$/
		);
	});
});

describe('fence meta', () => {
	const metas = [
		'title="math.ts" {1,3-4}#id /word/2-3 :line-numbers=10 playground h=3',
		'[a b] caption=\'c d\' showLineNumbers{4} twoslash /a\\/b/#w x="y z"',
		'{a} {} {1,} :line-numbers=x showLineNumbers{y} title=bare k={v} [] =v /x',
	];

	test('split into the parts markdown-core splits', () => {
		expect(meta_parts(metas[0])).toEqual([
			'title="math.ts"',
			'{1,3-4}#id',
			'/word/2-3',
			':line-numbers=10',
			'playground',
			'h=3',
		]);
	});

	test('a part is a prop only when no markdown-core convention claims it', () => {
		for (const meta of metas) {
			for (const part of meta_parts(meta)) {
				const parsed = parse_meta(part, () => undefined as never);
				const convention =
					parsed.line_groups.length !== 0 ||
					parsed.word_groups.length !== 0 ||
					parsed.line_numbers !== undefined ||
					parsed.title !== undefined ||
					parsed.caption !== undefined ||
					parsed.twoslash;
				const info = read_meta(part);
				const prop =
					info.props.length !== 0 ||
					info.title !== undefined ||
					info.caption !== undefined;
				if (convention) expect(info.props, part).toEqual([]);
				expect(info.title, part).toBe(parsed.title);
				expect(info.caption, part).toBe(parsed.caption);
				if (!convention && prop) expect(info.props.length, part).toBe(1);
			}
		}
	});

	test('reads title, caption and props', () => {
		expect(read_meta(metas[0])).toEqual({
			title: 'math.ts',
			props: [
				['playground', true],
				['h', '3'],
			],
		});
		expect(read_meta(metas[2]).props).toEqual([['title', 'bare']]);
	});

	test('a single element splits from its attributes', () => {
		expect(
			split_element(' <pre class="a>b" x>\n<code>1</code></pre>\n', 'pre')
		).toEqual({
			attributes: ' class="a>b" x',
			body: '\n<code>1</code>',
		});
		expect(split_element('<pre>a</pre><pre>b</pre>', 'pre')).toBeNull();
		expect(split_element('<div><pre>a</pre></div>', 'pre')).toBeNull();
		expect(split_element('<prefix>a</pre>', 'pre')).toBeNull();
		expect(split_element('<CODE>a</CODE>', 'code')).toEqual({
			attributes: '',
			body: 'a',
		});
	});
});
