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

let Node: Component<any>;
let Outline: Component<any>;

beforeAll(async () => {
	mkdirSync(DIR, { recursive: true });
	const modules: [string, string][] = [
		['Node', readFileSync(join(HERE, '../src/Node.svelte'), 'utf8')],
		['Outline', OUTLINE],
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

describe('a list item that starts with a code span', () => {
	/** the html after each character of source */
	function typed(source: string): string[] {
		const stream = new PluginStream({ plugins: [] });
		const emitter = new WireEmitter();
		const parser = new PFMParser(emitter);
		parser.init();
		const frames: string[] = [];
		for (let i = 0; i < source.length; i++) {
			emitter.set_source(source.slice(0, i + 1));
			parser.feed(source[i]);
			stream.apply(emitter.flush());
			frames.push(
				render(Node, {
					props: { buf: stream.buffer, idx: 0, source: '' },
				}).body.replace(/<!--[^]*?-->/g, '')
			);
		}
		emitter.set_source(source);
		parser.finish();
		stream.apply(emitter.flush());
		frames.push(
			render(Node, {
				props: { buf: stream.buffer, idx: 0, source: '' },
			}).body.replace(/<!--[^]*?-->/g, '')
		);
		return frames;
	}

	test('has no paragraph while its tight list is open, as an item of text has none', () => {
		const frames = typed('- `a` b\n- c\n\nd\n');
		for (const frame of frames) expect(frame).not.toContain('<li><p>');
		expect(frames[frames.length - 1]).toBe(
			'<ul><li><code>a</code> b</li><li>c</li></ul><p>d</p>'
		);
	});

	test('gets its paragraph when a blank line makes the list loose, with every other item', () => {
		const frames = typed('- `a` b\n\n- c\n\nd\n');
		expect(frames[frames.length - 1]).toBe(
			'<ul><li><p><code>a</code> b</p></li><li><p>c</p></li></ul><p>d</p>'
		);
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
