import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { PFMParser } from '@mdsvex/parse';
import { TreeBuilder } from '@mdsvex/parse/tree-builder';
import type { Component } from 'svelte';
import { compile } from 'svelte/compiler';
import { render } from 'svelte/server';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import type { Highlight, MathInfo, MathRenderer } from '../src/component';

const HERE = dirname(fileURLToPath(import.meta.url));
// inside the package so the compiled module finds its svelte and parse
const DIR = join(HERE, '.node-math');

let Node: Component<any>;

beforeAll(async () => {
	mkdirSync(DIR, { recursive: true });
	const js = compile(readFileSync(join(HERE, '../src/Node.svelte'), 'utf8'), {
		generate: 'server',
		filename: 'Node.svelte',
	}).js.code.replace("'./Node.svelte'", "'./Node.js'");
	writeFileSync(join(DIR, 'Node.js'), js);
	Node = (await import(pathToFileURL(join(DIR, 'Node.js')).href)).default;
});
afterAll(() => rmSync(DIR, { recursive: true, force: true }));

type Math = MathRenderer | false | null;

/** a renderer that can not read an open brace and the calls it got */
function recorder(): { math: MathRenderer; calls: [string, MathInfo][] } {
	const calls: [string, MathInfo][] = [];
	return {
		calls,
		math(latex, info) {
			calls.push([latex, info]);
			if (latex.split('{').length !== latex.split('}').length)
				throw new Error('Expected }');
			return `<math${info.display ? ' display="block"' : ''}>${latex.replace(/</g, '&lt;')}</math>`;
		},
	};
}

/** the html of a whole document with the comments svelte writes */
function raw(source: string, math?: Math, highlight?: Highlight): string {
	const tree = new TreeBuilder(128);
	const parser = new PFMParser(tree);
	parser.init();
	parser.feed(source);
	parser.finish();
	return render(Node, {
		props: { buf: tree.get_buffer(), idx: 0, source, math, highlight },
	}).body;
}

function drawn(source: string, math?: Math, highlight?: Highlight): string {
	return raw(source, math, highlight).replace(/<!--[^]*?-->/g, '');
}

/** the html after each character of a document that is still open */
function typed(source: string, math: MathRenderer): string[] {
	const tree = new TreeBuilder(128);
	const parser = new PFMParser(tree);
	parser.init();
	const out: string[] = [];
	for (let i = 0; i < source.length; i++) {
		const fed = source.slice(0, i + 1);
		tree.hide_open_text();
		parser.feed(source[i]);
		tree.show_open_text(fed);
		out.push(
			render(Node, {
				props: { buf: tree.get_buffer(), idx: 0, source: fed, math },
			}).body.replace(/<!--[^]*?-->/g, '')
		);
	}
	return out;
}

const DOC =
	'before $`a^{2}`$ and `code`\n\n```math\n\\frac{a}{b}\n```\n\n```js\nlet a;\n```\n\n- item\n\n  ```math label\n  x < y\n  ```\n\nafter\n';

const DISPLAY = '<div class="math math-display" translate="no">';
const INLINE = '<span class="math math-inline" translate="no">';

describe('Node.svelte without a math renderer', () => {
	test('a math fence is a code block and inline math a code span', () => {
		expect(drawn('```math\n\\frac{a}{b}\n```\n')).toBe(
			'<pre><code class="language-math">\\frac{a}{b}</code></pre>'
		);
		expect(drawn('so $`a^{2}`$ is\n')).toBe('<p>so <code>a^{2}</code> is</p>');
	});

	test('false and null are no renderer, to the comments svelte writes', () => {
		const plain = raw(DOC);
		expect(raw(DOC, false)).toBe(plain);
		expect(raw(DOC, null)).toBe(plain);
	});
});

describe('Node.svelte with a math renderer', () => {
	test('a math fence is display math in the markup compile writes', () => {
		const { math, calls } = recorder();
		expect(drawn('```math\n\\frac{a}{b}\n```\n', math)).toBe(
			DISPLAY + '<math display="block">\\frac{a}{b}</math></div>'
		);
		expect(calls).toEqual([
			['\\frac{a}{b}', { display: true, meta: '', filename: undefined }],
		]);
	});

	test('the info string after math is the meta', () => {
		const { math, calls } = recorder();
		drawn('```math  label="eq 1" \nx\n```\n', math);
		expect(calls[0][1].meta).toBe('label="eq 1"');
	});

	test('inline math is a span', () => {
		const { math, calls } = recorder();
		expect(drawn('so $`a^{2}`$ is\n', math)).toBe(
			'<p>so ' + INLINE + '<math>a^{2}</math></span> is</p>'
		);
		expect(calls).toEqual([
			['a^{2}', { display: false, meta: '', filename: undefined }],
		]);
	});

	test('only math is math', () => {
		const { math, calls } = recorder();
		const source =
			'a `code`, a `#!math hint` and $5\n\n```latex\nx\n```\n\n```mathematica\nx\n```\n';
		expect(drawn(source, math)).toBe(drawn(source));
		expect(calls).toEqual([]);
	});

	test('the rest of the document is as it is with no renderer', () => {
		const { math } = recorder();
		expect(drawn(DOC, math)).toBe(
			drawn(DOC)
				.replace('<code>a^{2}</code>', INLINE + '<math>a^{2}</math></span>')
				.replace(
					'<pre><code class="language-math">\\frac{a}{b}</code></pre>',
					DISPLAY + '<math display="block">\\frac{a}{b}</math></div>'
				)
				.replace(
					'<pre><code class="language-math label">x &lt; y</code></pre>',
					DISPLAY + '<math display="block">x &lt; y</math></div>'
				)
		);
	});

	test('latex the renderer can not read is drawn as written', () => {
		const { math } = recorder();
		const fence = '```math\n\\frac{a\n```\n';
		const span = 'so $`a^{2`$ is\n';
		expect(drawn(fence, math)).toBe(drawn(fence));
		expect(drawn(span, math)).toBe(drawn(span));
	});

	test('a renderer that returns no string draws the latex as written', () => {
		const fence = '```math\nx\n```\n';
		expect(drawn(fence, (() => null) as unknown as MathRenderer)).toBe(
			drawn(fence)
		);
	});

	test('the highlighter never gets math, rendered or not', () => {
		const { math } = recorder();
		const langs: string[] = [];
		const highlight: Highlight = (code, info) => {
			langs.push(info.lang);
			return info.inline ? `<code class="hl">${code}</code>` : null;
		};
		const source =
			'a $`x`$ and `#!math y` and `#!js z`\n\n```math\n\\frac{a\n```\n\n```math\nb\n```\n';
		const html = drawn(source, math, highlight);
		expect(langs).toEqual(['js']);
		expect(html).toContain(INLINE + '<math>x</math></span>');
		expect(html).toContain('<code>y</code>');
		expect(html).toContain('<code class="language-math">\\frac{a</code>');
		expect(html).toContain(DISPLAY + '<math display="block">b</math></div>');
	});

	test('with no renderer the highlighter gets a math fence as before', () => {
		const langs: string[] = [];
		drawn('```math\nx\n```\n', undefined, (code, info) => {
			langs.push(info.lang);
			return null;
		});
		expect(langs).toEqual(['math']);
	});
});

describe('Node.svelte with a math renderer, over math that is still open', () => {
	test('a fence is plain until it closes and is rendered once', () => {
		const { math, calls } = recorder();
		const source = 'a\n\n```math\n\\frac{a}{b}\n```\n';
		const steps = typed(source, math);
		const closes = source.lastIndexOf('```') + 2;
		for (let i = source.indexOf('\\frac'); i < closes; i++)
			expect(steps[i], String(i)).toContain('<pre><code class="language-math">');
		expect(steps[source.indexOf('{b}') + 2]).toContain(
			'<pre><code class="language-math">\\frac{a}{b}</code></pre>'
		);
		expect(steps.at(-1)).toBe(
			'<p>a</p>' + DISPLAY + '<math display="block">\\frac{a}{b}</math></div>'
		);
		expect(new Set(calls.map(([latex]) => latex))).toEqual(
			new Set(['\\frac{a}{b}'])
		);
	});

	test('inline math is never drawn from half its latex', () => {
		const { math, calls } = recorder();
		const steps = typed('so $`a^{2}`$ is\n', math);
		expect(steps.at(-1)).toBe(
			'<p>so ' + INLINE + '<math>a^{2}</math></span> is</p>'
		);
		expect(new Set(calls.map(([latex]) => latex))).toEqual(new Set(['a^{2}']));
	});
});
