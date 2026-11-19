import { decode } from '@jridgewell/sourcemap-codec';
import { describe, it, expect } from 'vitest';
import { PFMParser } from '@mdsvex/parse';
import { TreeBuilder } from '@mdsvex/parse/tree-builder';
import type { NodeBuffer } from '@mdsvex/parse/utils';
import {
	ComponentScope,
	CursorHTMLRenderer,
	K_CODE_FENCE,
} from '../src/html_cursor';
import type {
	CodeHighlighter,
	FenceSource,
	FenceSources,
	HighlightedBlock,
} from '../src/html_cursor';

function parse(source: string): NodeBuffer {
	const tree = new TreeBuilder(source.length >> 3 || 128);
	new PFMParser(tree).parse(source);
	return tree.get_buffer();
}

/** the given sources for the fences of a document, in document order */
function fences_of(
	source: string,
	given: (FenceSource | null)[]
): FenceSources {
	const buf = parse(source);
	const out = new Map<number, FenceSource>();
	let n = 0;
	for (let i = 1; i < buf.size; i++) {
		if ((buf.kind_at(i) as number) !== K_CODE_FENCE) continue;
		const from = given[n++];
		if (from != null) out.set(i, from);
	}
	return out;
}

type Setup = (renderer: CursorHTMLRenderer) => void;

/** the html every walk renders, which must agree */
function every_walk(
	source: string,
	given: (FenceSource | null)[] | null,
	setup?: Setup
): string {
	const renderers = [0, 1, 2, 3].map(
		() => new CursorHTMLRenderer({ cache: false })
	);
	for (const renderer of renderers) {
		if (given) renderer.fences = fences_of(source, given);
		setup?.(renderer);
	}
	const [folded, mapped, fused, traced] = renderers;
	folded.update(parse(source), source);
	mapped.update_mapped(parse(source), source);
	fused.update_v3(parse(source), source, source);
	traced.update_trace(parse(source), source);
	const walks = [folded.html, mapped.html, fused.html, traced.html];
	if (!setup) {
		const cached = new CursorHTMLRenderer();
		if (given) cached.fences = fences_of(source, given);
		cached.update(parse(source), source);
		walks.push(cached.html);
	}
	for (const html of walks) expect(html).toBe(walks[0]);
	return walks[0];
}

/** a highlighter that shows what it was asked */
function stub(): CodeHighlighter & { calls: string[] } {
	return {
		calls: [],
		block(code, lang, meta, start): HighlightedBlock | null {
			this.calls.push(`${lang}|${meta}|${start}|${code}`);
			if (lang === 'plain') return null;
			const live = lang === 'live' ? code.indexOf('{') : -1;
			return {
				before: '',
				attributes: ` class="hl ${lang}"`,
				body: `<code>${code}</code>`,
				after: '',
				props: ' title={"t"}',
				code,
				code_template: null,
				live:
					live === -1 ? null : [6 + live, live, code.indexOf('}') + 1 - live],
				dropped: null,
			};
		},
		inline: () => null,
		warn() {},
	};
}

const scope = new ComponentScope([{ specifier: 'm', names: ['pre'] }], 'G');
const IMPORT = "<script>\nimport { pre as Pre_MDSVEX_G } from 'm';\n</script>";
const replaced: Setup = (r) => (r.scope = scope);

const DOC = 'a\n\n```ts x=1\n```\n\n```js\nlet b = 2;\n```\n';
const PLAIN =
	'<p>a</p><pre><code class="language-ts"></code></pre>' +
	'<pre><code class="language-js">let b = 2;</code></pre>';

describe('fence sources', () => {
	it('no map renders every fence from the source', () => {
		expect(every_walk(DOC, null)).toBe(PLAIN);
	});

	it('a map without the fence changes nothing', () => {
		expect(every_walk(DOC, [])).toBe(PLAIN);
		expect(every_walk(DOC, [null, null])).toBe(PLAIN);
	});

	it('the text of the map is the code, escaped as code of the source is', () => {
		expect(every_walk(DOC, [{ text: 'let a = "<1>" && {b};\n' }, null])).toBe(
			'<p>a</p><pre><code class="language-ts">let a = &quot;&lt;1&gt;&quot; &amp;&amp; &#123;b&#125;;\n</code></pre>' +
				'<pre><code class="language-js">let b = 2;</code></pre>'
		);
	});

	it('replaces a body the fence has', () => {
		expect(every_walk(DOC, [null, { text: 'other\n' }])).toBe(
			'<p>a</p><pre><code class="language-ts"></code></pre>' +
				'<pre><code class="language-js">other\n</code></pre>'
		);
	});

	it('the text is not read as quoted, inside a block quote or a list', () => {
		expect(
			every_walk('> ```ts\n> ```\n\n- ```ts\n  ```\n', [
				{ text: '> not a marker\n' },
				{ text: '  indented\n' },
			])
		).toBe(
			'<blockquote>\n<pre><code class="language-ts">&gt; not a marker\n</code></pre>\n</blockquote>' +
				'<ul>\n<li><pre><code class="language-ts">  indented\n</code></pre></li>\n\n</ul>'
		);
	});

	it('an info string of the map names the language', () => {
		expect(
			every_walk('```src=./a.ts\n```\n\n```ts src=./a.ts\n```\n', [
				{ text: 'a\n', info: 'ts' },
				{ text: 'b\n', info: '' },
			])
		).toBe(
			'<pre><code class="language-ts">a\n</code></pre><pre><code>b\n</code></pre>'
		);
	});

	it('a code span never reads the map', () => {
		const source = '`#!ts a` and `b`\n\n```ts\n```\n';
		expect(every_walk(source, [{ text: 'c\n', info: 'js' }])).toBe(
			'<p><code>a</code> and <code>b</code></p><pre><code class="language-js">c\n</code></pre>'
		);
	});
});

describe('fence sources and a highlighter', () => {
	it('the highlighter is given the text and the info string of the map', () => {
		const h = stub();
		const html = every_walk(
			'```src=./a.ts x=1\n```\n',
			[{ text: 'let a;\n', info: 'ts x=1' }],
			(r) => (r.highlight = h)
		);
		expect(html).toBe('<pre class="hl ts"><code>let a;\n</code></pre>');
		expect(new Set(h.calls)).toEqual(new Set(['ts|x=1|0|let a;\n']));
	});

	it('a fence the highlighter leaves plain renders the text', () => {
		const html = every_walk(
			'```plain\n```\n',
			[{ text: 'a < b\n' }],
			(r) => (r.highlight = stub())
		);
		expect(html).toBe(
			'<pre><code class="language-plain">a &lt; b\n</code></pre>'
		);
	});

	it('a live expression of the text maps to the fence, not past it', () => {
		const source = '```live\n```\n\nafter {the} fence\n';
		for (const s of [null, scope]) {
			const r = new CursorHTMLRenderer({ cache: false });
			r.highlight = stub();
			r.fences = fences_of(source, [{ text: 'a {b.c} d\n' }]);
			if (s) r.scope = s;
			const { mappings } = r.update_mapped(parse(source), source);
			expect(r.html).toContain('<code>a {b.c} d\n</code>');
			for (const m of mappings) {
				if (m.data.role !== 'content') continue;
				const at = m.sourceOffsets[0];
				// what follows the fence has its own records, none from the code
				if (at < 12) expect(m.data.verification === true).toBe(false);
			}
			const traced = new CursorHTMLRenderer({ cache: false });
			traced.highlight = stub();
			traced.fences = fences_of(source, [{ text: 'a {b.c} d\n' }]);
			if (s) traced.scope = s;
			const { map } = {
				map: traced.update_v3(parse(source), source, source, 'a.md'),
			};
			expect(traced.html).toBe(r.html);
			const lines = source.split('\n');
			for (const line of decode(map.mappings))
				for (const seg of line) {
					expect(seg[2]).toBeLessThan(lines.length);
					expect(seg[3]).toBeLessThanOrEqual(lines[seg[2]!].length);
				}
		}
	});
});

describe('fence sources and a pre replacement', () => {
	it('gets the text as its code prop and the props of the map', () => {
		expect(
			every_walk(
				'```ts x=1\n```\n',
				[{ text: 'let a;\n', props: ' src={"./a.ts"}' }],
				replaced
			)
		).toBe(
			IMPORT +
				'<Pre_MDSVEX_G lang={"ts"} meta={"x=1"} src={"./a.ts"} code={"let a;\\n"}>' +
				'<pre><code class="language-ts">let a;\n</code></pre></Pre_MDSVEX_G>'
		);
	});

	it('a fence outside the map gets none', () => {
		expect(
			every_walk(
				'```ts\na\n```\n\n```js\n```\n',
				[null, { text: 'b\n', props: ' src={"b"}' }],
				replaced
			)
		).toBe(
			IMPORT +
				'<Pre_MDSVEX_G lang={"ts"} code={"a"}><pre><code class="language-ts">a</code></pre></Pre_MDSVEX_G>' +
				'<Pre_MDSVEX_G lang={"js"} src={"b"} code={"b\\n"}><pre><code class="language-js">b\n</code></pre></Pre_MDSVEX_G>'
		);
	});

	it('a highlighted fence gets them ahead of the props of the block', () => {
		expect(
			every_walk(
				'```src=a\n```\n',
				[{ text: 'let a;\n', info: 'ts', props: ' src={"a"}' }],
				(r) => {
					r.scope = scope;
					r.highlight = stub();
				}
			)
		).toBe(
			IMPORT +
				'<Pre_MDSVEX_G lang={"ts"} src={"a"} title={"t"} code={"let a;\\n"}>' +
				'<pre class="hl ts"><code>let a;\n</code></pre></Pre_MDSVEX_G>'
		);
	});

	it('in a wrapped render too', () => {
		const html = every_walk(
			'```ts\n```\n',
			[{ text: 'a\n', props: ' src={"a"}' }],
			(r) => {
				r.scope = scope;
				r.template = { specifier: 't', metadata: false };
			}
		);
		expect(html).toContain(
			'<Pre_MDSVEX_G lang={"ts"} src={"a"} code={"a\\n"}><pre><code class="language-ts">a\n</code></pre></Pre_MDSVEX_G>'
		);
	});
});

describe('fence sources state', () => {
	it('a render without a map follows one with it', () => {
		const renderer = new CursorHTMLRenderer({ cache: false });
		renderer.fences = fences_of(DOC, [{ text: 'x\n' }]);
		renderer.update(parse(DOC), DOC);
		expect(renderer.html).toContain('<code class="language-ts">x\n</code>');
		renderer.update_mapped(parse(DOC), DOC);
		expect(renderer.html).toContain('<code class="language-ts">x\n</code>');
		renderer.fences = undefined;
		renderer.update_trace(parse(DOC), DOC);
		expect(renderer.html).toBe(PLAIN);
		renderer.update(parse(DOC), DOC);
		expect(renderer.html).toBe(PLAIN);
	});

	it('a render that throws leaves no map for the next renderer', () => {
		const thrower = new CursorHTMLRenderer({ cache: false });
		thrower.fences = fences_of(DOC, [{ text: 'x\n' }]);
		thrower.highlight = {
			block() {
				throw new Error('no');
			},
			inline: () => null,
			warn() {},
		};
		expect(() => thrower.update(parse(DOC), DOC)).toThrow('no');
		expect(() => thrower.update_mapped(parse(DOC), DOC)).toThrow('no');
		const next = new CursorHTMLRenderer({ cache: false });
		next.update(parse(DOC), DOC);
		expect(next.html).toBe(PLAIN);
	});

	it('release drops the map', () => {
		const renderer = new CursorHTMLRenderer({ cache: false });
		renderer.fences = new Map();
		renderer.release();
		expect(renderer.fences).toBeUndefined();
	});

	it('the mappings of a fence from the map stay inside the source', () => {
		const source = '```ts\n```\n';
		const r = new CursorHTMLRenderer({ cache: false });
		r.fences = fences_of(source, [{ text: 'a\nb\nc\nd\ne\n' }]);
		const { mappings } = r.update_mapped(parse(source), source);
		for (const m of mappings) {
			expect(m.sourceOffsets[0]).toBeLessThanOrEqual(source.length);
			expect(m.sourceOffsets[0] + m.lengths[0]).toBeLessThanOrEqual(
				source.length
			);
		}
		const map = r.update_v3(parse(source), source, source, 'a.md');
		for (const line of decode(map.mappings))
			for (const seg of line) expect(seg[2]).toBeLessThan(3);
	});
});

describe('an indented fence', () => {
	const CODE = 'let x = 1;\n  x++;';
	const SOURCES: [string, string][] = [
		['root', '  ```js\n  let x = 1;\n    x++;\n  ```\n'],
		['element', '<div>\n  ```js\n  let x = 1;\n    x++;\n  ```\n</div>\n'],
		['branch', '{#if a}\n  ```js\n  let x = 1;\n    x++;\n  ```\n{/if}\n'],
		['directive', ':::note[]\n  ```js\n  let x = 1;\n    x++;\n  ```\n:::\n'],
		['list item', '- a\n\n    ```js\n    let x = 1;\n      x++;\n    ```\n'],
		['block quote', '>   ```js\n>   let x = 1;\n>     x++;\n>   ```\n'],
	];

	function line_starts(source: string): number[] {
		return [source.indexOf('let x'), source.indexOf('  x++')];
	}

	for (const [site, source] of SOURCES) {
		it(`renders its code without the indent in every walk, ${site}`, () => {
			expect(every_walk(source, null)).toContain(
				`<pre><code class="language-js">${CODE}</code></pre>`
			);
		});

		it(`maps each code line to its own source line, ${site}`, () => {
			const r = new CursorHTMLRenderer({ cache: false });
			const { mappings } = r.update_mapped(parse(source), source);
			const at = r.html.indexOf(CODE);
			const content = mappings
				.filter(
					(m) =>
						m.data.role === 'content' &&
						m.generatedOffsets[0] >= at &&
						m.generatedOffsets[0] < at + CODE.length
				)
				.map((m) => [
					m.generatedOffsets[0] - at,
					m.sourceOffsets[0],
					source.slice(m.sourceOffsets[0], m.sourceOffsets[0] + m.lengths[0]),
					r.html.slice(
						m.generatedOffsets[0],
						m.generatedOffsets[0] + (m.generatedLengths?.[0] ?? m.lengths[0])
					),
				]);
			const [first, second] = line_starts(source);
			expect(content).toEqual([
				[0, first, 'let x = 1;\n', 'let x = 1;\n'],
				[11, second, '  x++;', '  x++;'],
			]);
		});

		it(`a source map points each code line at its source column, ${site}`, () => {
			const r = new CursorHTMLRenderer({ cache: false });
			const map = r.update_v3(parse(source), source, source, 'a.md');
			const html = r.html;
			const lines = decode(map.mappings);
			for (const [k, start] of line_starts(source).entries()) {
				const code_at = html.indexOf(k === 0 ? 'let x' : '  x++');
				const gen_line = html.slice(0, code_at).split('\n').length - 1;
				const gen_col = code_at - (html.lastIndexOf('\n', code_at - 1) + 1);
				const seg = lines[gen_line].find((s) => s[0] === gen_col);
				const src_line = source.slice(0, start).split('\n').length - 1;
				const src_col = start - (source.lastIndexOf('\n', start - 1) + 1);
				expect(seg?.slice(2, 4), `line ${k}`).toEqual([src_line, src_col]);
			}
		});
	}

	it('a pre replacement takes the code without the indent and maps its lines', () => {
		const source = SOURCES[1][1];
		const html = every_walk(source, null, replaced);
		expect(html).toContain('code={"let x = 1;\\n  x++;"}');
		expect(html).toContain(`<code class="language-js">${CODE}</code>`);
		const r = new CursorHTMLRenderer({ cache: false });
		r.scope = scope;
		const { mappings } = r.update_mapped(parse(source), source);
		const at = r.html.indexOf('<code class="language-js">') + 26;
		const lines = mappings
			.filter((m) => m.data.role === 'content' && m.generatedOffsets[0] >= at)
			.map((m) => [m.generatedOffsets[0] - at, m.sourceOffsets[0]]);
		expect(lines.slice(0, 2)).toEqual([
			[0, source.indexOf('let x')],
			[11, source.indexOf('  x++')],
		]);
	});

	it('gives the highlighter the code without the indent', () => {
		const h = stub();
		every_walk(
			'<div>\n  ```js {1}\n  let x = 1;\n    x++;\n  ```\n</div>\n',
			null,
			(r) => (r.highlight = h)
		);
		expect(new Set(h.calls)).toEqual(new Set([`js|{1}|8|${CODE}`]));
	});

	it('maps a live expression to its place in the indented source', () => {
		const source = '<div>\n  ```live\n  a\n    b {c.d} e\n  ```\n</div>\n';
		const r = new CursorHTMLRenderer({ cache: false });
		r.highlight = stub();
		const { mappings } = r.update_mapped(parse(source), source);
		expect(r.html).toContain('<code>a\n  b {c.d} e</code>');
		const live = mappings.filter(
			(m) => m.data.role === 'content' && m.data.verification === true
		);
		expect(live.map((m) => m.sourceOffsets[0])).toEqual([
			source.indexOf('{c.d}'),
		]);
	});
});
