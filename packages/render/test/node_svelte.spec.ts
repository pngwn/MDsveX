import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
	HeadingIds,
	heading_slug,
	PFMParser,
	WireEmitter,
} from '@mdsvex/parse';
import type { ParsePlugin } from '@mdsvex/parse';
import { TreeBuilder } from '@mdsvex/parse/tree-builder';
import type { Component } from 'svelte';
import { compile } from 'svelte/compiler';
import { render } from 'svelte/server';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { PluginStream } from '../src/stream';

const HERE = dirname(fileURLToPath(import.meta.url));
// inside the package, so the compiled modules find its svelte and parse
const DIR = join(HERE, '.node-svelte');

/** lists what the outline plugin wrote, read from the context, with its label */
const OUTLINE = `<script>
	import { getContext } from 'svelte';
	let { label } = $props();
	const data = getContext(Symbol.for('mdsvex.plugin_data'));
</script>

<nav>{@render label?.()}<ol>{#each data?.current?.outline?.headings ?? [] as entry}<li>{entry}</li>{/each}</ol></nav>
`;

/** writes the props it was given and its children, so a test reads what a replacement gets */
const PROBE = `<script>
	let { children, ...props } = $props();
</script>

<x-probe props={JSON.stringify(props)}>{@render children?.()}</x-probe>
`;

let Node: Component<any>;
let Outline: Component<any>;
let Probe: Component<any>;

beforeAll(async () => {
	mkdirSync(DIR, { recursive: true });
	const modules: [string, string][] = [
		['Node', readFileSync(join(HERE, '../src/Node.svelte'), 'utf8')],
		['Outline', OUTLINE],
		['Probe', PROBE],
	];
	for (const [name, source] of modules) {
		const js = compile(source, {
			generate: 'server',
			filename: name + '.svelte',
		}).js.code.replace("'./Node.svelte'", "'./Node.js'");
		writeFileSync(join(DIR, name + '.js'), js);
	}
	Node = (await import(pathToFileURL(join(DIR, 'Node.js')).href)).default;
	Outline = (await import(pathToFileURL(join(DIR, 'Outline.js')).href)).default;
	Probe = (await import(pathToFileURL(join(DIR, 'Probe.js')).href)).default;
});
afterAll(() => rmSync(DIR, { recursive: true, force: true }));

function batches_of(source: string, chunk: number): unknown[][][] {
	const emitter = new WireEmitter();
	const parser = new PFMParser(emitter);
	parser.init();
	const out: unknown[][][] = [];
	for (let i = 0; i < source.length; i += chunk) {
		emitter.set_source(source.slice(0, i + chunk));
		parser.feed(source.slice(i, i + chunk));
		out.push(emitter.flush());
	}
	emitter.set_source(source);
	parser.finish();
	out.push(emitter.flush());
	return out;
}

const outline: ParsePlugin = {
	name: 'outline',
	heading: {
		parse(node, ctx) {
			return () => ctx.add('headings', node.attrs.id);
		},
	},
};

describe('Node.svelte in a stream', () => {
	test('a directive component reads the data as it grows, after each chunk', () => {
		const stream = new PluginStream({
			plugins: [outline],
			headings: new HeadingIds(heading_slug, () => false),
		});
		const source = '::outline[Contents]\n\n# One\n\ntext\n\n## Two\n\n## Two\n';
		const lists: string[] = [];
		for (const batch of batches_of(source, 4)) {
			stream.apply(batch);
			const html = render(Node, {
				props: {
					buf: stream.buffer,
					idx: 0,
					source: '',
					directives: { outline: Outline },
					plugin_data: stream.data,
				},
			}).body.replace(/<!--[^]*?-->/g, '');
			const list = /<nav>(.*?)<\/nav>/.exec(html)?.[1];
			// the label streams in too
			if (
				list !== undefined &&
				list.startsWith('Contents<ol>') &&
				lists[lists.length - 1] !== list
			)
				lists.push(list);
		}
		expect(lists).toEqual([
			'Contents<ol></ol>',
			'Contents<ol><li>one</li></ol>',
			'Contents<ol><li>one</li><li>two</li></ol>',
			'Contents<ol><li>one</li><li>two</li><li>two-1</li></ol>',
		]);
	});

	test('a directive with no component renders its content, as before', () => {
		const stream = new PluginStream();
		for (const batch of batches_of(':::note\n\ninside\n\n:::\n', 100))
			stream.apply(batch);
		const html = render(Node, {
			props: { buf: stream.buffer, idx: 0, source: '' },
		}).body.replace(/<!--[^]*?-->/g, '');
		expect(html).toBe('<p>inside</p>');
	});

	test('a fence a plugin makes shows the code it put in it, after each chunk', async () => {
		const quotes: ParsePlugin = {
			name: 'quotes',
			block_quote: {
				parse: (node) => () =>
					void node
						.append('code_fence', { info: 'ts' })
						.append('text', 'let a = 1;'),
			},
		};
		const html_of = (stream: PluginStream) =>
			render(Node, {
				props: { buf: stream.buffer, idx: 0, source: '' },
			}).body.replace(/<!--[^]*?-->/g, '');
		const typed = new PluginStream();
		for (const batch of batches_of(
			'> hi\n>\n> ```ts\n> let a = 1;\n> ```\n',
			100
		))
			typed.apply(batch);
		const want = html_of(typed);
		expect(want).toContain('let a = 1;</code>');
		for (const chunk of [1, 3, 100]) {
			const stream = new PluginStream({ plugins: [quotes] });
			const seen: string[] = [];
			for (const batch of batches_of('> hi\n', chunk)) {
				stream.apply(batch);
				seen.push(html_of(stream));
			}
			await stream.end();
			expect(
				seen.filter((html) => html.includes('<pre>')),
				String(chunk)
			).toEqual([want]);
			expect(html_of(stream), String(chunk)).toBe(want);
		}
	});
	test('a code span a plugin makes shows the text it put in it', async () => {
		const spans: ParsePlugin = {
			name: 'spans',
			paragraph: {
				parse: (node) => () =>
					void node.append('code_span').append('text', 'a < b'),
			},
		};
		const html_of = (stream: PluginStream) =>
			render(Node, {
				props: { buf: stream.buffer, idx: 0, source: '' },
			}).body.replace(/<!--[^]*?-->/g, '');
		const typed = new PluginStream();
		for (const batch of batches_of('hi`a < b`\n', 100)) typed.apply(batch);
		const want = html_of(typed);
		expect(want).toContain('<code>a &lt; b</code>');
		for (const chunk of [1, 3, 100]) {
			const stream = new PluginStream({ plugins: [spans] });
			for (const batch of batches_of('hi\n', chunk)) stream.apply(batch);
			await stream.end();
			expect(html_of(stream), String(chunk)).toBe(want);
		}
	});
});

describe('a reference whose definition comes later', () => {
	test('is a link with no target until the definition is fed', () => {
		const stream = new PluginStream();
		const seen: string[] = [];
		for (const batch of batches_of('see [x][a] and ![y][b]\n\n[a]: /u\n', 4)) {
			stream.apply(batch);
			const html = render(Node, {
				props: { buf: stream.buffer, idx: 0, source: '' },
			}).body.replace(/<!--[^]*?-->/g, '');
			const link = /<a[^>]*>x<\/a>/.exec(html)?.[0];
			if (link !== undefined && seen[seen.length - 1] !== link) seen.push(link);
		}
		expect(seen).toEqual(['<a>x</a>', '<a href="/u">x</a>']);
		const html = render(Node, {
			props: { buf: stream.buffer, idx: 0, source: '' },
		}).body.replace(/<!--[^]*?-->/g, '');
		expect(html).toContain('<img alt="y"');
		expect(html).not.toContain('src=');
	});
});

describe('Node.svelte over a tree that shows its open text', () => {
	/** the text Node.svelte draws after each character */
	function typed(source: string): string[] {
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
					props: { buf: tree.get_buffer(), idx: 0, source: fed },
				}).body.replace(/<[^>]*>/g, '')
			);
		}
		return out;
	}

	test('a paragraph grows as it is fed, less the spaces the parser would trim', () => {
		const source = 'A metronome keeps a steady beat';
		const texts = typed(source);
		for (let i = 0; i < source.length; i++) {
			expect(texts[i], String(i)).toBe(source.slice(0, i + 1).trimEnd());
		}
	});

	test('a heading shows its text before its newline', () => {
		expect(typed('# Tempo\n')).toEqual([
			'',
			'',
			'T',
			'Te',
			'Tem',
			'Temp',
			'Tempo',
			'Tempo',
		]);
	});

	test('a character the parser holds is not drawn', () => {
		const texts = typed('keeps *a* [beat](x) on');
		// the asterisk and the bracket wait for what follows them
		expect(texts[6]).toBe('keeps ');
		expect(texts[7]).toBe('keeps a');
		expect(texts[10]).toBe('keeps a ');
		expect(texts[11]).toBe('keeps a b');
		// the url is read whole before the link closes
		expect(texts[17]).toBe('keeps a beat');
		expect(texts[21]).toBe('keeps a beat on');
	});

	test('a fence and a code span show their code as it arrives', () => {
		const fence = typed('```js\nlet a;\n```\n');
		expect(fence[8]).toBe('let');
		expect(fence[11]).toBe('let a;');
		// the closing fence is never code, the linefeed before it is until it closes
		expect(fence[14]).toBe('let a;\n');
		expect(fence[fence.length - 1]).toBe('let a;');

		const span = typed('a `let b` c');
		expect(span[5]).toBe('a let');
		expect(span[10]).toBe('a let b c');
	});
});

describe('components in a stream', () => {
	function stream_of(
		source: string,
		plugins: ParsePlugin[] = []
	): PluginStream {
		const stream = new PluginStream({ plugins });
		for (const batch of batches_of(source, 100)) stream.apply(batch);
		return stream;
	}

	/** the html with each probe as its name, its props as json and its children */
	function drawn(
		source: string,
		names: string[],
		props: Record<string, unknown> = {}
	): string {
		return html_of(stream_of(source), names, props);
	}

	function html_of(
		stream: PluginStream,
		names: string[],
		props: Record<string, unknown> = {}
	): string {
		const components: Record<string, Component<any>> = {};
		for (const name of names) components[name] = Probe;
		return render(Node, {
			props: { buf: stream.buffer, idx: 0, source: '', components, ...props },
		})
			.body.replace(/<!--[^]*?-->/g, '')
			.replace(/ props="([^"]*)"/g, (_, json: string) =>
				(' props="' + json + '"')
					.replace(/&quot;/g, '"')
					.replace(/&lt;/g, '<')
					.replace(/&amp;/g, '&')
			);
	}

	const probe = (props: Record<string, unknown>, children: string) =>
		'<x-probe props="' + JSON.stringify(props) + '">' + children + '</x-probe>';

	test('a heading is replaced and gets its level', () => {
		expect(drawn('## A _fine_ day\n', ['h2'])).toBe(
			probe({ level: 2 }, 'A <em>fine</em> day')
		);
		expect(drawn('# One\n\n## Two\n', ['h2'])).toBe(
			'<h1>One</h1>' + probe({ level: 2 }, 'Two')
		);
	});

	test('inline nodes are replaced inside the blocks that hold them', () => {
		expect(
			drawn('a _b_ *c* ~~d~~ [e](/f "g") ![h](/i.png "j")\n', [
				'em',
				'strong',
				'del',
				'a',
				'img',
			])
		).toBe(
			'<p>a ' +
				probe({}, 'b') +
				' ' +
				probe({}, 'c') +
				' ' +
				probe({}, 'd') +
				' ' +
				probe({ href: '/f', title: 'g' }, 'e') +
				' ' +
				probe({ src: '/i.png', alt: 'h', title: 'j' }, '') +
				'</p>'
		);
	});

	test('a paragraph, a quote, a rule and a break are replaced', () => {
		expect(
			drawn('> one\\\n> two\n\n---\n', ['p', 'blockquote', 'hr', 'br'])
		).toBe(probe({}, probe({}, 'one' + probe({}, '') + 'two')) + probe({}, ''));
	});

	test('an ordered list gets its start, a task item gets checked and draws its own box', () => {
		expect(drawn('3. a\n4. b\n', ['ol'])).toBe(
			probe({ start: 3 }, '<li>a</li><li>b</li>')
		);
		expect(drawn('1. a\n', ['ol'])).toBe(probe({ start: 1 }, '<li>a</li>'));
		expect(drawn('- [x] a\n- [ ] b\n- c\n', ['ul', 'li'])).toBe(
			probe(
				{},
				probe({ checked: true }, 'a') +
					probe({ checked: false }, 'b') +
					probe({}, 'c')
			)
		);
		expect(drawn('- [x] a\n\n- [ ] b\n', ['p'])).toBe(
			'<ul><li>' +
				probe({}, '<input type="checkbox" disabled="" checked=""/> a') +
				'</li><li>' +
				probe({}, '<input type="checkbox" disabled=""/> b') +
				'</li></ul>'
		);
		expect(drawn('- [x] a\n\n- [ ] b\n', ['p', 'li'])).toBe(
			'<ul>' +
				probe({ checked: true }, probe({}, 'a')) +
				probe({ checked: false }, probe({}, 'b')) +
				'</ul>'
		);
	});

	test('a fence gives pre its language, meta and code, and the whole pre as children', () => {
		expect(drawn('```js title="a.js"\nlet a = 1 < 2;\n```\n', ['pre'])).toBe(
			probe(
				{ lang: 'js', meta: 'title="a.js"', code: 'let a = 1 < 2;' },
				'<pre><code class="language-js">let a = 1 &lt; 2;</code></pre>'
			)
		);
		expect(drawn('```\nplain\n```\n', ['pre'])).toBe(
			probe({ code: 'plain' }, '<pre><code>plain</code></pre>')
		);
	});

	test('a highlighted fence gives pre the pre alone, with no figure around it', () => {
		const highlight = {
			block: (code: string) => ({
				before: '<figure>',
				attributes: ' class="hl"',
				body: '<span>' + code + '</span>',
				after: '</figure>',
			}),
		};
		expect(drawn('```js\nlet a;\n```\n', ['pre'], { highlight })).toBe(
			probe(
				{ lang: 'js', code: 'let a;' },
				'<pre class="hl"><span>let a;</span></pre>'
			)
		);
		expect(drawn('```js\nlet a;\n```\n', [], { highlight })).toBe(
			'<figure><pre class="hl"><span>let a;</span></pre></figure>'
		);
	});

	test('a code span gives code its text, and its language when it is highlighted', () => {
		expect(drawn('a `b < c`\n', ['code'])).toBe(
			'<p>a ' + probe({}, 'b &lt; c') + '</p>'
		);
		const highlight = (code: string, info: { inline: boolean }) =>
			info.inline
				? '<code class="hl" data-a="1 &amp; 2"><i>' + code + '</i></code>'
				: null;
		expect(drawn('`#!js let a`\n', ['code'], { highlight })).toBe(
			'<p>' +
				probe({ lang: 'js', class: 'hl', 'data-a': '1 & 2' }, '<i>let a</i>') +
				'</p>'
		);
		const loose = () => '<b>x</b>';
		expect(drawn('`#!js let a`\n', ['code'], { highlight: loose })).toBe(
			'<p><b>x</b></p>'
		);
	});

	test('a table and its parts are replaced, a cell gets its alignment', () => {
		const source = '| a | b |\n|:--|--:|\n| 1 | 2 |\n';
		expect(drawn(source, ['table'])).toBe(
			probe(
				{},
				'<thead><tr><th align="left">a</th><th align="right">b</th></tr></thead>' +
					'<tbody><tr><td align="left">1</td><td align="right">2</td></tr></tbody>'
			)
		);
		expect(drawn(source, ['th', 'tr'])).toBe(
			'<table><thead>' +
				probe(
					{},
					probe({ align: 'left' }, 'a') + probe({ align: 'right' }, 'b')
				) +
				'</thead><tbody>' +
				probe({}, '<td align="left">1</td><td align="right">2</td>') +
				'</tbody></table>'
		);
	});

	test('a plugin attribute is a prop of the replacement', () => {
		const ids: ParsePlugin = {
			name: 'ids',
			heading: {
				parse: (node) => () => {
					node.attrs.id = 'here';
				},
			},
		};
		const stream = stream_of('## Two\n', [ids]);
		expect(html_of(stream, ['h2'])).toBe(
			probe({ id: 'here', level: 2 }, 'Two')
		);
	});

	test('typed html is replaced too, unless component_mode is markdown', () => {
		const source = '## made\n\n<h2 class="c">typed</h2>\n';
		const made = probe({ level: 2 }, 'made');
		expect(drawn(source, ['h2'])).toBe(made + probe({ class: 'c' }, 'typed'));
		expect(drawn(source, ['h2'], { component_mode: 'markdown' })).toBe(
			made + '<h2 class="c">typed</h2>'
		);
		expect(
			drawn('<div>\n\n## in\n\n<h2>typed</h2>\n\n</div>\n', ['h2', 'div'], {
				component_mode: 'markdown',
			})
		).toBe('<div>' + probe({ level: 2 }, 'in') + '<h2>typed</h2></div>');
	});

	test('an element a plugin makes is replaced in either mode', async () => {
		const notes: ParsePlugin = {
			name: 'notes',
			block_quote: {
				parse: (node) => () =>
					void node.append('html', { tag: 'aside' }).append('text', 'made'),
			},
		};
		for (const component_mode of ['markdown', 'all']) {
			const stream = stream_of('> hi\n', [notes]);
			await stream.end();
			expect(
				html_of(stream, ['aside'], { component_mode }),
				component_mode
			).toContain(probe({}, 'made'));
		}
	});

	test('an element with a directive stays an element', () => {
		expect(drawn('<input bind:value={name} />\n', ['input'])).not.toContain(
			'x-probe'
		);
		expect(drawn('<input value="a" />\n', ['input'])).toContain('x-probe');
	});

	test('an open node is replaced as soon as it opens, and its children grow', () => {
		const stream = new PluginStream();
		const seen: string[] = [];
		for (const batch of batches_of('## One _two_ three\n\nafter\n', 3)) {
			stream.apply(batch);
			const html = html_of(stream, ['h2', 'em']);
			if (seen[seen.length - 1] !== html) seen.push(html);
		}
		const text = seen.map((html) => html.replace(/<[^>]*>/g, ''));
		expect(seen.every((html) => !html.includes('<h2'))).toBe(true);
		expect(seen.find((html) => html.includes('O'))).toMatch(
			/^<x-probe props="{"level":2}">O/
		);
		expect(text[text.length - 1]).toBe('One two threeafter');
		expect(seen[seen.length - 1]).toBe(
			probe({ level: 2 }, 'One ' + probe({}, 'two') + ' three') + '<p>after</p>'
		);
	});

	test('no components and an empty map write what a stream wrote before', () => {
		const source =
			'# One\n\na *b* `c`\n\n- [x] d\n\n| a |\n|---|\n| 1 |\n\n```js\nlet a;\n```\n';
		const stream = stream_of(source);
		const props = { buf: stream.buffer, idx: 0, source: '' };
		const plain = render(Node, { props }).body;
		expect(render(Node, { props: { ...props, components: {} } }).body).toBe(
			plain
		);
		expect(
			render(Node, { props: { ...props, component_mode: 'markdown' } }).body
		).toBe(plain);
	});

	const math = (latex: string, info: { display: boolean }) => {
		if (latex.split('{').length !== latex.split('}').length)
			throw new Error('Expected }');
		return `<math${info.display ? ' display="block"' : ''}>${latex}</math>`;
	};
	const DISPLAY = '<div class="math math-display" translate="no">';
	const INLINE = '<span class="math math-inline" translate="no">';

	test('math goes to the math replacement with its latex, rendered as its children', () => {
		expect(
			drawn('so $`a^2`$ is\n\n```math label\nx + y\n```\n', ['math'], { math })
		).toBe(
			'<p>so ' +
				probe({ code: 'a^2' }, INLINE + '<math>a^2</math></span>') +
				' is</p>' +
				probe(
					{ display: true, code: 'x + y', meta: 'label' },
					DISPLAY + '<math display="block">x + y</math></div>'
				)
		);
	});

	test('math never goes to pre or code, and code never goes to math', () => {
		const source = 'so $`a^2`$ and `b`\n\n```math\nx\n```\n\n```js\ny\n```\n';
		const html = drawn(source, ['math', 'pre', 'code'], { math });
		expect(html).toContain(probe({ code: 'a^2' }, INLINE + '<math>a^2</math></span>'));
		expect(html).toContain(probe({}, 'b'));
		expect(html).toContain(
			probe(
				{ display: true, code: 'x' },
				DISPLAY + '<math display="block">x</math></div>'
			)
		);
		expect(html).toContain(
			probe(
				{ lang: 'js', code: 'y' },
				'<pre><code class="language-js">y</code></pre>'
			)
		);
	});

	test('with no math renderer math is code and goes to pre and code', () => {
		expect(drawn('so $`a^2`$\n\n```math\nx\n```\n', ['math', 'pre', 'code'])).toBe(
			'<p>so ' +
				probe({}, 'a^2') +
				'</p>' +
				probe(
					{ lang: 'math', code: 'x' },
					'<pre><code class="language-math">x</code></pre>'
				)
		);
	});

	test('math the renderer throws on is plain code and goes to no replacement', () => {
		expect(
			drawn('so $`a^{2`$\n\n```math\n\\frac{a\n```\n', ['math', 'pre', 'code'], {
				math,
			})
		).toBe(
			'<p>so <code>a^{2</code></p><pre><code class="language-math">\\frac{a</code></pre>'
		);
	});

	test('an open math fence goes to the replacement once it renders, with what it last rendered as', () => {
		const open = (source: string) => {
			const stream = new PluginStream({});
			let html = '';
			for (const batch of batches_of(source, 1).slice(0, -1)) {
				stream.apply(batch);
				html = html_of(stream, ['math'], { math });
			}
			return html;
		};
		expect(open('```math\n{a')).toBe(
			'<pre><code class="language-math">{a</code></pre>'
		);
		expect(open('```math\nx + {a')).toBe(
			probe(
				{ display: true, code: 'x + {a' },
				DISPLAY + '<math display="block">x + </math></div>'
			)
		);
	});
});
