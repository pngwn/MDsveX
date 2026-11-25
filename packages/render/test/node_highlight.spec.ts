import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { PFMParser, WireEmitter } from '@mdsvex/parse';
import type { ParsePlugin } from '@mdsvex/parse';
import { TreeBuilder } from '@mdsvex/parse/tree-builder';
import type { Component } from 'svelte';
import { compile } from 'svelte/compiler';
import { render } from 'svelte/server';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import type {
	Highlight,
	HighlightConfig,
	Highlighter,
	HighlightInfo,
} from '../src/component';
import { PluginStream } from '../src/stream';

const HERE = dirname(fileURLToPath(import.meta.url));
// inside the package so the compiled module finds its svelte and parse
const DIR = join(HERE, '.node-highlight');

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

const escape = (code: string) =>
	code.replace(/&/g, '&amp;').replace(/</g, '&lt;');

/** a highlighter that knows js only and the calls it got */
function recorder(): {
	highlight: Highlighter;
	calls: [string, HighlightInfo][];
} {
	const calls: [string, HighlightInfo][] = [];
	return {
		calls,
		highlight(code, info) {
			calls.push([code, info]);
			if (info.lang !== 'js') return null;
			return `<pre class="hl"><code>${escape(code).replace(/\blet\b/g, '<span class="k">let</span>')}</code></pre>`;
		},
	};
}

/** the html of a whole document with the comments svelte writes */
function raw(source: string, highlight?: Highlight | false | null): string {
	const tree = new TreeBuilder(128);
	const parser = new PFMParser(tree);
	parser.init();
	parser.feed(source);
	parser.finish();
	return render(Node, {
		props: { buf: tree.get_buffer(), idx: 0, source, highlight },
	}).body;
}

function drawn(source: string, highlight?: Highlight | false | null): string {
	return raw(source, highlight).replace(/<!--[^]*?-->/g, '');
}

/** the html after each character of a document that is still open */
function typed(source: string, highlight?: Highlight): string[] {
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
				props: { buf: tree.get_buffer(), idx: 0, source: fed, highlight },
			}).body.replace(/<!--[^]*?-->/g, '')
		);
	}
	return out;
}

const DOC =
	'before\n\n```js title="a b"\nlet a = 1 < 2;\n```\n\n```zig\nconst b = 2;\n```\n\n- item\n\n  ```js\n  let c;\n  ```\n\nafter\n';

describe('Node.svelte without a highlighter', () => {
	test('a fence is a pre and a code with its language', () => {
		expect(drawn('```js\nlet a = 1 < 2;\n```\n')).toBe(
			'<pre><code class="language-js">let a = 1 &lt; 2;</code></pre>'
		);
	});

	test('false and null are no highlighter, to the comments svelte writes', () => {
		const plain = raw(DOC);
		expect(raw(DOC, false)).toBe(plain);
		expect(raw(DOC, null)).toBe(plain);
	});
});

describe('Node.svelte with a highlighter', () => {
	test('a closed fence is the html of the highlighter, which gets its language and meta', () => {
		const { highlight, calls } = recorder();
		expect(drawn('```js title="a b"\nlet a = 1 < 2;\n```\n', highlight)).toBe(
			'<pre class="hl"><code><span class="k">let</span> a = 1 &lt; 2;</code></pre>'
		);
		expect(calls).toEqual([
			[
				'let a = 1 < 2;',
				{ lang: 'js', meta: 'title="a b"', inline: false, open: false },
			],
		]);
	});

	test('a fence with no info has no language', () => {
		const { highlight, calls } = recorder();
		drawn('```\nlet a;\n```\n', highlight);
		expect(calls[0][1]).toEqual({
			lang: '',
			meta: '',
			inline: false,
			open: false,
		});
	});

	test('a language the highlighter does not know is drawn as without one', () => {
		const { highlight, calls } = recorder();
		const source = '```zig\nconst b = 2;\n```\n';
		expect(drawn(source, highlight)).toBe(drawn(source));
		expect(drawn(source, highlight)).toBe(
			'<pre><code class="language-zig">const b = 2;</code></pre>'
		);
		expect(calls[0][1].lang).toBe('zig');
	});

	test('a highlighter that throws draws the fence plain', () => {
		const source = '```js\nlet a;\n```\n';
		expect(
			drawn(source, () => {
				throw new Error('line 3 is beyond the fence');
			})
		).toBe(drawn(source));
	});

	test('only the fences change, one in a list too, and nothing moves', () => {
		const { highlight } = recorder();
		const plain = drawn(DOC);
		const lit = drawn(DOC, highlight);
		expect(plain.split('<pre>').length).toBe(4);
		expect(lit).toBe(
			plain
				.replace(
					'<pre><code class="language-js title=&quot;a b&quot;">let a = 1 &lt; 2;</code></pre>',
					'<pre class="hl"><code><span class="k">let</span> a = 1 &lt; 2;</code></pre>'
				)
				.replace(
					'<pre><code class="language-js">let c;</code></pre>',
					'<pre class="hl"><code><span class="k">let</span> c;</code></pre>'
				)
		);
		expect(lit).toContain('<pre><code class="language-zig">');
	});

	test('a code span is never highlighted', () => {
		const { highlight, calls } = recorder();
		expect(drawn('a `let b` c\n', highlight)).toBe(drawn('a `let b` c\n'));
		expect(calls).toEqual([]);
	});

	test('a highlight config is drawn as compile draws it, around its pre', () => {
		const seen: unknown[] = [];
		const config: HighlightConfig = {
			block(code, lang, meta, ctx) {
				seen.push([code, lang, meta, ctx.filename]);
				ctx.unknown_language(lang);
				ctx.warn('annotation', 'nothing reads this in a stream');
				return {
					before: '<figure><figcaption>a b</figcaption>',
					attributes: ' class="tp language-js"',
					body: `<code>${code.replace('{', '&#123;')}</code>`,
					after: '</figure>',
				};
			},
		};
		expect(drawn('```js title="a b"\nif (a) {\n```\n', config)).toBe(
			'<figure><figcaption>a b</figcaption><pre class="tp language-js"><code>if (a) &#123;</code></pre></figure>'
		);
		expect(seen).toEqual([['if (a) {', 'js', 'title="a b"', undefined]]);
	});

	test('a config block with no pre is its body, and null is plain', () => {
		const source = '```js\nlet a;\n```\n';
		const whole: HighlightConfig = {
			block: () => ({
				before: '',
				attributes: null,
				body: '<div class="math">x</div>',
				after: '',
			}),
		};
		expect(drawn(source, whole)).toBe('<div class="math">x</div>');
		expect(drawn(source, { block: () => null })).toBe(drawn(source));
	});

	test('what a plugin put on the fence goes on the pre, after what the highlighter wrote', () => {
		const marks: ParsePlugin = {
			name: 'marks',
			code_fence: {
				parse(node) {
					node.attrs['data-run'] = 'a "b" & c';
				},
			},
		};
		const stream = new PluginStream({ plugins: [marks] });
		const emitter = new WireEmitter();
		const parser = new PFMParser(emitter);
		const source = '```js\nlet a;\n```\n';
		parser.init();
		emitter.set_source(source);
		parser.feed(source);
		parser.finish();
		stream.apply(emitter.flush());
		const html_of = (highlight: Highlight) =>
			render(Node, {
				props: { buf: stream.buffer, idx: 0, source: '', highlight },
			}).body.replace(/<!--[^]*?-->/g, '');
		const attrs = ' data-run="a &quot;b&quot; &amp; c"';
		expect(
			html_of(() => '<pre class="a>b" data-x=\'>\'><code>x</code></pre>')
		).toBe(`<pre class="a>b" data-x='>'${attrs}><code>x</code></pre>`);
		expect(html_of(() => '<div><pre><code>x</code></pre></div>')).toBe(
			'<div><pre><code>x</code></pre></div>'
		);
		expect(
			html_of({
				block: () => ({
					before: '',
					attributes: ' class="tp"',
					body: 'x',
					after: '',
				}),
			})
		).toBe(`<pre class="tp"${attrs}>x</pre>`);
	});
});

describe('Node.svelte with a highlighter, over a fence that is still open', () => {
	test('it is highlighted as it grows, and the highlighter is told it is open', () => {
		const { highlight, calls } = recorder();
		const source = '```js\nlet a;\n```\n';
		const frames = typed(source, highlight);
		// the info line is still open
		expect(frames[4]).not.toContain('class="hl"');
		expect(frames[8]).toBe(
			'<pre class="hl"><code><span class="k">let</span></code></pre>'
		);
		expect(frames[11]).toBe(
			'<pre class="hl"><code><span class="k">let</span> a;</code></pre>'
		);
		expect(frames[frames.length - 1]).toBe(frames[11]);
		const js = calls.filter(([, info]) => info.lang === 'js');
		expect(js.find(([code]) => code === 'let')?.[1].open).toBe(true);
		expect(js[js.length - 1]).toEqual([
			'let a;',
			{ lang: 'js', meta: '', inline: false, open: false },
		]);
	});

	test('a highlighter can leave it plain until it closes', () => {
		const { highlight } = recorder();
		const frames = typed('```js\nlet a;\n```\n', (code, info) =>
			info.open ? null : highlight(code, info)
		);
		expect(frames[11]).toBe(
			'<pre><code class="language-js">let a;</code></pre>'
		);
		expect(frames[frames.length - 1]).toBe(
			'<pre class="hl"><code><span class="k">let</span> a;</code></pre>'
		);
	});

	test('a highlighter that can not read half a fence draws it plain until it can', () => {
		const frames = typed('```js\nlet a;\nlet b;\n```\n', (code) => {
			if (!code.includes('b')) throw new Error('line 2 is beyond the fence');
			return '<pre class="hl">ok</pre>';
		});
		expect(frames[11]).toBe(
			'<pre><code class="language-js">let a;</code></pre>'
		);
		expect(frames[frames.length - 1]).toBe('<pre class="hl">ok</pre>');
	});

	test('a long one is plain until it closes, so a chunk never costs the whole fence', () => {
		const line = 'let a = 1;\n';
		const code = line.repeat(400);
		const calls: [number, boolean][] = [];
		const highlight: Highlighter = (text, info) => {
			calls.push([text.length, info.open]);
			return '<pre class="hl">ok</pre>';
		};
		const tree = new TreeBuilder(128);
		const parser = new PFMParser(tree);
		parser.init();
		const source = '```js\n' + code + '```\n';
		const html: string[] = [];
		for (let i = 0; i < source.length; i += 64) {
			const fed = source.slice(0, i + 64);
			tree.hide_open_text();
			parser.feed(source.slice(i, i + 64));
			tree.show_open_text(fed);
			html.push(
				render(Node, {
					props: { buf: tree.get_buffer(), idx: 0, source: fed, highlight },
				}).body
			);
		}
		const open = calls.filter(([, is_open]) => is_open);
		expect(open.length).toBeGreaterThan(10);
		expect(Math.max(...open.map(([length]) => length))).toBeLessThanOrEqual(
			4096
		);
		expect(html[html.length - 2]).toContain('<pre><code class="language-js">');
		expect(html[html.length - 1]).toContain('<pre class="hl">ok</pre>');
		expect(calls[calls.length - 1]).toEqual([code.length - 1, false]);
	});
});
