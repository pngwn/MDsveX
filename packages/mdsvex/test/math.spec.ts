import temml from 'temml';
import katex from 'katex';
import { compile as svelte_compile } from 'svelte/compiler';
import { describe, expect, test, vi } from 'vitest';

import { compile, CompilerSession, MathError } from '../src/main';
import type {
	CompileOptions,
	CompileWarning,
	ComponentSource,
	MathInfo,
} from '../src/main';
import { create_highlight, load_default_languages } from '../src/highlight';
import { katex_math, load_math, source_math, temml_math } from '../src/math';

const math = await load_math();
const highlight = create_highlight({
	languages: await load_default_languages(),
});

const OPEN = '<div class="math math-display" translate="no">';
const X =
	OPEN +
	'<math display="block" class="tml-display" style="display:block math;"><mi>x</mi></math></div>';

function only(...names: string[]): ComponentSource[] {
	return [{ specifier: 'mdsvex:components', names }];
}

/** the body after the generated script */
function body(code: string): string {
	return code.replace(/^<script>\n[^]*?<\/script>/, '');
}

function codes(warnings: CompileWarning[] | undefined) {
	return (warnings ?? []).map((w) => [w.code, w.start.line]);
}

function caught(raw: string, options: CompileOptions = { math }): any {
	try {
		compile(raw, options);
	} catch (e) {
		return e;
	}
	throw new Error('compiled');
}

describe('a math fence', () => {
	test('renders display math as mathml, with no pre or code', () => {
		const out = compile('```math\nx\n```', { math });
		expect(out.code).toBe(X);
		expect(out.warnings).toBeUndefined();
	});

	test('stays a code block without the option or with false', () => {
		const plain = '<pre><code class="language-math">x</code></pre>';
		expect(compile('```math\nx\n```').code).toBe(plain);
		expect(compile('```math\nx\n```', { math: false }).code).toBe(plain);
	});

	test('renders the same with a highlighter, which never sees it', () => {
		const seen: string[] = [];
		const custom = (code: string, { lang }: { lang: string }) => {
			seen.push(lang);
			return `<pre class="mine">${code}</pre>`;
		};
		const raw = '```math\nx\n```\n\n```js\na\n```';
		for (const option of [highlight, custom, false] as const) {
			const out = compile(raw, { math, highlight: option });
			expect(out.code.startsWith(X)).toBe(true);
			expect(out.warnings).toBeUndefined();
		}
		expect(seen).toEqual(['js']);
		expect(compile(raw, { math, highlight }).code).toContain(
			'<pre class="twinkleplop language-js" data-language="js">'
		);
	});

	test('is an unknown language to twinkleplop once math is off', () => {
		const out = compile('```math\nx\n```', { highlight });
		expect(out.code).toContain('language-math');
		expect(codes(out.warnings)).toEqual([['unknown_language', 1]]);
	});

	test('only the word math is math, latex and tex stay code', () => {
		for (const lang of ['latex', 'tex', 'Math', 'mathematica'])
			expect(compile('```' + lang + '\nx\n```', { math }).code).toBe(
				`<pre><code class="language-${lang}">x</code></pre>`
			);
	});

	test('renders inside containers and through every walk', () => {
		const raw = '> - a\n>\n>   ```math\n>   x\n>   ```\n\ntext';
		const plain = compile(raw, { math }).code;
		expect(plain).toContain(X);
		expect(compile(raw, { math, sourcemap: true }).code).toBe(plain);
		const session = new CompilerSession();
		expect(session.compile(raw, { math }).code).toBe(plain);
		// the next document of the session has no math renderer
		expect(session.compile('```math\nx\n```').code).toBe(
			'<pre><code class="language-math">x</code></pre>'
		);
	});

	test('the renderer gets the latex and the meta', () => {
		const calls: [string, MathInfo][] = [];
		const out = compile('```math label=eq:1 {2}\na\n\nb\n```', {
			filename: 'doc.svx',
			math: (latex, info) => {
				calls.push([latex, info]);
				return '<b>m</b>';
			},
		});
		expect(calls).toEqual([
			[
				'a\n\nb',
				{ display: true, meta: 'label=eq:1 {2}', filename: 'doc.svx' },
			],
		]);
		// the meta is reserved, nothing reads it
		expect(out.code).toBe(OPEN + '<b>m</b></div>');
		expect(out.warnings).toBeUndefined();
	});

	test('without a highlighter the document parses once and its math renders once', () => {
		let parsed = 0;
		let rendered = 0;
		const options: CompileOptions = {
			math: () => {
				rendered++;
				return '<b>m</b>';
			},
			parse_plugins: [
				{
					heading: {
						parse() {
							parsed++;
						},
					},
				},
			],
		};
		const raw = '# a\n\n```math\nx\n```\n\n```math\ny\n```';
		for (const sourcemap of [false, true]) {
			parsed = rendered = 0;
			const out = compile(raw, { ...options, sourcemap });
			expect(out.code).toBe(
				'<h1>a</h1>' + OPEN + '<b>m</b></div>' + OPEN + '<b>m</b></div>'
			);
			expect([parsed, rendered]).toEqual([1, 2]);
		}
		// a document with no math never calls the renderer
		parsed = rendered = 0;
		compile('```math\nx\n```');
		compile('# a\n\n```js\nx\n```', options);
		expect([parsed, rendered]).toEqual([1, 0]);
	});

	test('a code span with a math hint is plain code and does not warn', () => {
		for (const option of [highlight, false] as const) {
			const out = compile('a `#!math x^2` b', { math, highlight: option });
			expect(out.code).toBe('<p>a <code>x^2</code> b</p>');
			expect(out.warnings).toBeUndefined();
		}
	});

	test('dollars are not math', () => {
		expect(compile('$x$ and\n\n$$\ny\n$$', { math }).code).toBe(
			'<p>$x$ and</p><p>$$\ny\n$$</p>'
		);
	});

	test('rejects a math option that is no renderer', () => {
		// read when a math fence or a highlighter first needs it
		for (const option of [false, highlight] as const)
			expect(() =>
				compile('```math\nx\n```', { math: {} as never, highlight: option })
			).toThrow(/math must be a math renderer/);
		expect(() =>
			compile('```math\nx\n```', { math: (() => null) as never })
		).toThrow(
			/a math renderer must return a string, it returned null \(`math` fence at line 1\)/
		);
	});
});

describe('math renderers', () => {
	test('temml takes options, macros among them', () => {
		const out = compile('```math\n\\RR\n```', {
			math: temml_math(temml, {
				annotate: true,
				macros: { '\\RR': '\\mathbb{R}' },
			}),
		});
		expect(out.code).toContain('<mi>ℝ</mi>');
		expect(out.code).toContain(
			'<annotation encoding="application/x-tex">\\RR</annotation>'
		);
	});

	test('katex renders html and mathml', () => {
		const out = compile('```math\nx\n```', { math: katex_math(katex) });
		expect(out.code).toContain(OPEN + '<span class="katex-display">');
		expect(out.code).toContain('display="block"');
		expect(out.code).toContain('<span class="katex-html" aria-hidden="true">');
	});

	test('load_math imports the library the options name', async () => {
		const loaded = await load_math({
			renderer: 'katex',
			options: { output: 'mathml' },
		});
		const out = compile('```math\nx\n```', { math: loaded }).code;
		expect(out).toContain('class="katex"');
		expect(out).not.toContain('katex-html');
		await expect(load_math({ renderer: 'mathjax' as never })).rejects.toThrow(
			/math.renderer must be 'temml' or 'katex', it is "mathjax"/
		);
	});

	test('katex that is not installed fails with what to do', async () => {
		vi.doMock('katex', () => {
			throw new Error('Cannot find package');
		});
		try {
			await expect(load_math({ renderer: 'katex' })).rejects.toThrow(
				"[mdsvex] math.renderer 'katex' needs katex, add it to your dependencies"
			);
		} finally {
			vi.doUnmock('katex');
		}
		// temml never asks for it
		expect(await load_math()).toBeTypeOf('function');
	});

	test('a definition ends with its fence', () => {
		const macros = { '\\a': 'x' };
		for (const render of [
			temml_math(temml, { macros }),
			katex_math(katex, { macros }),
		]) {
			const raw = '```math\n\\gdef\\b{y} \\a\\b\n```\n\n```math\n\\b\n```';
			expect(caught(raw, { math: render }).line).toBe(6);
		}
		expect(macros).toEqual({ '\\a': 'x' });
	});

	test('source_math shows the latex and never fails', () => {
		expect(
			compile('```math\n\\frac{a}{ <b> &\n```', { math: source_math }).code
		).toBe(
			OPEN +
				'<code class="language-math">\\frac&#123;a&#125;&#123; &lt;b&gt; &amp;</code></div>'
		);
	});

	test('a library without renderToString is rejected', () => {
		expect(() => temml_math({} as never)).toThrow(/must have renderToString/);
	});
});

describe('math errors', () => {
	test('invalid latex is a MathError at the latex', () => {
		const e = caught('# a\n\n```math\nx +\n  \\frac{a}{\n```', {
			math,
			filename: 'doc.svx',
		});
		expect(e).toBeInstanceOf(MathError);
		expect(e.name).toBe('MathError');
		expect(e.message).toMatch(
			/^Unexpected end of input in a macro argument[^]* \(`math` fence at doc\.svx:3\)$/
		);
		expect([e.line, e.column]).toEqual([5, 12]);
		expect(e.cause.name).toBe('ParseError');
	});

	test('the position holds inside a block quote and for katex', () => {
		const raw = '> q\n>\n> ```math\n> a \\nope b\n> ```';
		for (const render of [math, katex_math(katex)]) {
			const e = caught(raw, { math: render });
			expect(e).toBeInstanceOf(MathError);
			expect(e.message).toContain('(`math` fence at line 3)');
			expect([e.line, e.column]).toEqual([4, 5]);
		}
	});

	test('an error with no position is at the fence', () => {
		const e = caught('a\n\n  ```math\n  x\n  ```', {
			math: () => {
				throw new Error('no');
			},
		});
		expect(e).toBeInstanceOf(MathError);
		expect(e.message).toBe('no (`math` fence at line 3)');
		expect([e.line, e.column]).toEqual([3, 3]);
		expect(
			caught('```math\nx\n```', {
				math: () => {
					throw 'text';
				},
			}).message
		).toBe('text (`math` fence at line 1)');
	});

	test('throwOnError false draws the error instead', () => {
		const out = compile('```math\n\\frac{a}{\n```', {
			math: temml_math(temml, { throwOnError: false }),
		});
		expect(out.code).toContain('class="temml-error"');
		expect(out.code).not.toMatch(/[{}]/);
	});
});

describe('the math replacement', () => {
	test('takes the latex, display, the meta and the mathml as children', () => {
		const out = compile('```math label=eq:1\n\\frac{a}{b}\n```', {
			math,
			components: only('math'),
		});
		expect(out.code).toContain(
			"import { math as Math_MDSVEX_G } from 'mdsvex:components';"
		);
		const html = body(out.code);
		expect(
			html.startsWith(
				'<Math_MDSVEX_G display code={"\\\\frac{a}{b}"} meta={"label=eq:1"}>' +
					OPEN +
					'<math display="block"'
			)
		).toBe(true);
		expect(html.endsWith('</math></div></Math_MDSVEX_G>')).toBe(true);
		expect(out.warnings).toBeUndefined();
	});

	test('pre and code replacements never take math', () => {
		const raw = '```math title="t" playground\nx\n```\n\n```js\na\n```\n\n`b`';
		for (const option of [highlight, false] as const) {
			const out = compile(raw, {
				math,
				highlight: option,
				components: only('pre', 'code'),
			});
			const html = body(out.code);
			expect(html.startsWith(X + '<Pre_MDSVEX_G lang={"js"}')).toBe(true);
			expect(html).toContain('<Code_MDSVEX_G>b</Code_MDSVEX_G>');
			expect(out.warnings).toBeUndefined();
		}
	});

	test('a document with only math imports only math', () => {
		const out = compile('```math\nx\n```', {
			math,
			components: only('pre', 'code', 'math', 'p'),
		});
		expect(out.code).toContain('import { math as Math_MDSVEX_G }');
		expect(body(out.code)).toBe(
			'<Math_MDSVEX_G display code={"x"}>' + X + '</Math_MDSVEX_G>'
		);
	});

	test('the pre replacement takes the fence once math is off', () => {
		const out = compile('```math\nx\n```', { components: only('pre', 'math') });
		expect(body(out.code)).toBe(
			'<Pre_MDSVEX_G lang={"math"} code={"x"}><pre><code class="language-math">x</code></pre></Pre_MDSVEX_G>'
		);
	});

	test('maps through the sourcemap and session walks', () => {
		const raw = 'a\n\n```math\nx\n```\n\nb';
		const options = { math, components: only('math') };
		const plain = compile(raw, options).code;
		expect(compile(raw, { ...options, sourcemap: true }).code).toBe(plain);
		expect(new CompilerSession().compile(raw, options).code).toBe(plain);
	});

	test('component_mode all gives a typed math element to the same replacement', () => {
		const raw = '<math display="block"><mi>y</mi></math>\n\n```math\nx\n```';
		const markdown = body(
			compile(raw, { math, components: only('math') }).code
		);
		expect(markdown.startsWith('<math display="block"><mi>y</mi></math>')).toBe(
			true
		);
		const all = body(
			compile(raw, {
				math,
				components: only('math', 'mi', 'div'),
				component_mode: 'all',
			}).code
		);
		// what a renderer made is never replaced, only what the author typed
		expect(all).toBe(
			'<Math_MDSVEX_G display="block"><Mi_MDSVEX_G>y</Mi_MDSVEX_G></Math_MDSVEX_G>' +
				'<Math_MDSVEX_G display code={"x"}>' +
				X +
				'</Math_MDSVEX_G>'
		);
	});
});

describe('math in svelte', () => {
	const LATEX =
		'\\begin{aligned}\n' +
		'  f(x) &= \\frac{1}{\\sqrt{2\\pi\\sigma^{2}}} e^{-\\frac{(x-\\mu)^{2}}{2\\sigma^{2}}} \\\\\n' +
		'  S &= \\{ x \\mid x > 0 \\} \\text{ and {braces} } % {comment}\n' +
		'\\end{aligned}';

	test.each([
		['temml', temml_math(temml)],
		['temml with the source annotation', temml_math(temml, { annotate: true })],
		['katex', katex_math(katex)],
		['source', source_math],
	])('brace heavy latex compiles without warnings: %s', (_, render) => {
		for (const components of [undefined, only('math')]) {
			const code = compile('```math\n' + LATEX + '\n```', {
				math: render,
				components,
			}).code;
			// only the code prop of a replacement holds a brace, in a string
			expect(body(code).replace(/ code=\{"[^]*?"\}/, '')).not.toMatch(/[{}]/);
			for (const generate of ['client', 'server'] as const) {
				const out = svelte_compile(code, { generate, filename: 'doc.svelte' });
				expect(out.warnings).toEqual([]);
			}
		}
	});

	test('the annotation holds the latex once svelte decodes it', () => {
		const code = compile('```math\n\\frac{a}{b}\n```', {
			math: temml_math(temml, { annotate: true }),
		}).code;
		const out = svelte_compile(code, { generate: 'server' }).js.code;
		expect(out).toContain(
			'<annotation encoding="application/x-tex">\\\\frac{a}{b}</annotation>'
		);
	});
});
