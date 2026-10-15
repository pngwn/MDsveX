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
});
