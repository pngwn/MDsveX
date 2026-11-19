import temml from 'temml';
import katex from 'katex';
import { compile as svelte_compile } from 'svelte/compiler';
import { describe, expect, test } from 'vitest';

import {
	compile,
	compile_inputs,
	CompilerSession,
	MathError,
} from '../src/main';
import type {
	CompileOptions,
	ComponentSource,
	MathInfo,
	MathRenderer,
} from '../src/main';
import { create_highlight, load_default_languages } from '../src/highlight';
import { katex_math, load_math } from '../src/math';

const math = await load_math();
const highlight = create_highlight({
	languages: await load_default_languages(),
});

const OPEN = '<span class="math math-inline" translate="no">';
const X = OPEN + '<math><mi>x</mi></math></span>';

/** a renderer that shows what it was given */
const shown: MathRenderer = (latex, { display }) =>
	`<i>${display ? 'block' : 'inline'}:${latex}</i>`;

function only(...names: string[]): ComponentSource[] {
	return [{ specifier: 'mdsvex:components', names }];
}

/** the body after the generated script */
function body(code: string): string {
	return code.replace(/^<script>\n[^]*?<\/script>/, '');
}

/** the code every walk renders, they must agree, and svelte takes it */
function compile_all(raw: string, options: CompileOptions = { math }): string {
	const plain = compile(raw, options);
	const mapped = compile(raw, { ...options, sourcemap: true });
	const session = new CompilerSession();
	const again = session.compile(raw, options);
	const inputs = compile_inputs();
	inputs.math = options.math;
	inputs.highlight = options.highlight;
	inputs.components = options.components;
	const kept = session.render(session.parse(raw, inputs), inputs);
	for (const other of [mapped, again, kept])
		expect(other.code).toBe(plain.code);
	svelte_compile(plain.code, { generate: 'server', filename: 'doc.svelte' });
	return plain.code;
}

function caught(raw: string, options: CompileOptions = { math }): any {
	try {
		compile(raw, options);
	} catch (e) {
		return e;
	}
	throw new Error('compiled');
}

describe('inline math', () => {
	test('renders as mathml in a span, with no code element and no dollars', () => {
		expect(compile_all('a $`x`$ b')).toBe(`<p>a ${X} b</p>`);
		expect(temml.renderToString('x')).toBe('<math><mi>x</mi></math>');
	});

	test('is a code span without the dollars when math is off', () => {
		const plain = '<p>a <code>e^&#123;i\\pi&#125;</code> b</p>';
		expect(compile_all('a $`e^{i\\pi}`$ b', {})).toBe(plain);
		expect(compile_all('a $`e^{i\\pi}`$ b', { math: false })).toBe(plain);
		expect(compile_all('a $`e^{i\\pi}`$ b', { highlight })).toBe(plain);
	});

	test('renders the same with a highlighter, which never sees it', () => {
		const seen: string[] = [];
		const custom = (code: string, { lang }: { lang: string }) => {
			seen.push(lang);
			return `<code class="mine">${code}</code>`;
		};
		const raw = 'a $`x`$ and `#!js y`';
		for (const option of [highlight, custom] as const) {
			const out = compile(raw, { math, highlight: option });
			expect(out.code.startsWith(`<p>a ${X} and <code`)).toBe(true);
			expect(out.warnings).toBeUndefined();
		}
		expect(seen).toEqual(['js']);
		expect(compile_all(raw, { math, highlight: false })).toBe(
			`<p>a ${X} and <code>y</code></p>`
		);
	});

	test('the renderer gets the latex as written and display false', () => {
		const calls: [string, MathInfo][] = [];
		const out = compile('$`#!js a_1 *b* \\frac{1}{2}`$', {
			filename: 'doc.svx',
			math: (latex, info) => {
				calls.push([latex, info]);
				return '<b>m</b>';
			},
		});
		expect(calls).toEqual([
			[
				'#!js a_1 *b* \\frac{1}{2}',
				{ display: false, meta: '', filename: 'doc.svx' },
			],
		]);
		expect(out.code).toBe(`<p>${OPEN}<b>m</b></span></p>`);
	});

	test('a document with a fence and a span renders each once', () => {
		const calls: string[] = [];
		const counted: MathRenderer = (latex, info) => {
			calls.push(shown(latex, info));
			return shown(latex, info);
		};
		const raw = 'a $`x`$\n\n```math\ny\n```\n';
		const out = compile(raw, { math: counted });
		expect(out.code).toBe(
			`<p>a ${OPEN}<i>inline:x</i></span></p>` +
				'<div class="math math-display" translate="no"><i>block:y</i></div>'
		);
		expect(calls).toEqual(['<i>inline:x</i>', '<i>block:y</i>']);
	});

	test('braces in what the renderer gives are text to svelte', () => {
		expect(compile_all('$`x`$', { math: () => '<b>{x}</b>' })).toBe(
			`<p>${OPEN}<b>&#123;x&#125;</b></span></p>`
		);
	});

	test('a code span with the math hint stays code, and a lone dollar text', () => {
		expect(compile_all('`#!math x` costs $5 or $`x`')).toBe(
			'<p><code>x</code> costs $5 or $<code>x</code></p>'
		);
	});

	test('renders in a heading, a list, a quote, a link and a table', () => {
		const raw =
			'# a $`x`$\n\n- $`x`$\n\n> [$`x`$](/u)\n\n| $`x`$ | b |\n|---|---|\n| c | $`x`$ |\n';
		const code = compile_all(raw);
		expect(code.split(X)).toHaveLength(6);
		expect(code).toContain(`<h1>a ${X}</h1>`);
		expect(code).toContain(`<a href="/u">${X}</a>`);
		expect(code).toContain(`<td>${X}</td>`);
	});

	test('an escaped pipe in a table cell is a bar in the latex', () => {
		const code = compile_all('| a |\n|---|\n| $`a \\| b`$ |\n', {
			math: shown,
		});
		expect(code).toContain(`<td>${OPEN}<i>inline:a | b</i></span></td>`);
	});

	test('the next document of a session has no math renderer', () => {
		const session = new CompilerSession();
		expect(session.compile('$`x`$', { math }).code).toBe(`<p>${X}</p>`);
		expect(session.compile('$`x`$').code).toBe('<p><code>x</code></p>');
	});

	test('a document without inline math makes no math run', () => {
		let calls = 0;
		const counted: MathRenderer = () => {
			calls++;
			return '';
		};
		expect(compile('a $5 `x` b', { math: counted }).code).toBe(
			'<p>a $5 <code>x</code> b</p>'
		);
		expect(calls).toBe(0);
	});
});

describe('inline math and replacements', () => {
	test('a math replacement gets the latex as code, with no display', () => {
		const out = compile('a $`x`$', { math, components: only('math') });
		expect(body(out.code)).toBe(
			`<p>a <Math_MDSVEX_G code={"x"}>${X}</Math_MDSVEX_G></p>`
		);
		svelte_compile(out.code, { generate: 'server', filename: 'doc.svelte' });
	});

	test('the same replacement takes a fence with display', () => {
		const out = compile('$`x`$\n\n```math\ny\n```', {
			math: shown,
			components: only('math'),
		});
		expect(body(out.code)).toBe(
			`<p><Math_MDSVEX_G code={"x"}>${OPEN}<i>inline:x</i></span></Math_MDSVEX_G></p>` +
				'<Math_MDSVEX_G display code={"y"}><div class="math math-display" translate="no"><i>block:y</i></div></Math_MDSVEX_G>'
		);
	});

	test('a code replacement never gets math, and gets the span when math is off', () => {
		const on = compile('$`x`$ `y`', { math, components: only('code') });
		expect(body(on.code)).toBe(`<p>${X} <Code_MDSVEX_G>y</Code_MDSVEX_G></p>`);
		const off = compile('$`x`$', { components: only('code') });
		expect(body(off.code)).toBe('<p><Code_MDSVEX_G>x</Code_MDSVEX_G></p>');
	});

	test('every walk writes the replacement the same', () => {
		const options = { math, components: only('math', 'code') };
		const code = compile_all('a $`x`$ and `y`', options);
		expect(body(code)).toBe(
			`<p>a <Math_MDSVEX_G code={"x"}>${X}</Math_MDSVEX_G> and <Code_MDSVEX_G>y</Code_MDSVEX_G></p>`
		);
	});
});

describe('inline math errors', () => {
	test('invalid latex is a MathError at the latex', () => {
		const e = caught('# a\n\ntext $`\\frac{a}{`$ more', {
			math,
			filename: 'doc.svx',
		});
		expect(e).toBeInstanceOf(MathError);
		expect(e.message).toMatch(/ \(inline math at doc\.svx:3\)$/);
		expect(e.line).toBe(3);
		expect(e.column).toBeGreaterThan(8);
		expect(e.column).toBeLessThanOrEqual(17);
		expect(e.cause.name).toBe('ParseError');
	});

	test('the position holds for katex and in a block quote', () => {
		for (const render of [math, katex_math(katex)]) {
			const e = caught('> q\n> a $`a \\nope b`$', { math: render });
			expect(e).toBeInstanceOf(MathError);
			expect(e.message).toContain('(inline math at line 2)');
			expect([e.line, e.column]).toEqual([2, 9]);
		}
	});

	test('an error with no position is at the first dollar', () => {
		const e = caught('a\n\nb $`x`$', {
			math: () => {
				throw new Error('no');
			},
		});
		expect(e).toBeInstanceOf(MathError);
		expect(e.message).toBe('no (inline math at line 3)');
		expect([e.line, e.column]).toEqual([3, 3]);
	});

	test('a renderer that gives no string is a TypeError that says where', () => {
		expect(() => compile('a $`x`$', { math: (() => null) as never })).toThrow(
			/must return a string, it returned null \(inline math at line 1\)/
		);
	});
});
