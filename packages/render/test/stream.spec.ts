import { describe, expect, test } from 'vitest';
import {
	HeadingIds,
	heading_slug,
	PFMParser,
	WireEmitter,
} from '@mdsvex/parse';
import type { ParsePlugin } from '@mdsvex/parse';
import type { NodeBuffer } from '@mdsvex/parse/utils';
import { WireTreeBuilder } from '@mdsvex/parse/wire-tree-builder';
import { ComponentRenderer } from '../src/component';
import { CursorHTMLRenderer } from '../src/html_cursor';
import { PluginStream } from '../src/stream';

/** the wire batches of a document fed in pieces, the last one from finish */
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

/** a render of the whole buffer, what a cached one must equal */
function fresh(buf: NodeBuffer): string {
	const renderer = new CursorHTMLRenderer({ cache: false });
	renderer.update(buf, '');
	return renderer.html;
}

/** the next turns of the event loop, where tasks settle */
const turn = () => new Promise((resolve) => setTimeout(resolve, 0));

/** each heading is an entry of the data, and looked up later, as a slow lookup would */
function plugins(gate: Promise<void>): ParsePlugin[] {
	return [
		{
			name: 'outline',
			heading: {
				parse(node, ctx) {
					return () => {
						ctx.add('headings', { id: node.attrs.id, text: node.text_content });
						ctx.defer(node, async (node) => {
							await gate;
							node.attrs.title = 'looked up';
						});
					};
				},
			},
		},
	];
}

const SOURCE = '# One\n\nsome text\n\n## Two\n\nmore text\n\n## Two\n\nend\n';

describe('a stream with plugins', () => {
	test('renders after each chunk what a render of the whole buffer renders', async () => {
		let open!: () => void;
		const gate = new Promise<void>((resolve) => (open = resolve));
		const stream = new PluginStream({
			plugins: plugins(gate),
			headings: new HeadingIds(heading_slug, () => false),
		});
		const cached = new CursorHTMLRenderer();
		stream.renderers.push(cached);
		let changes = 0;
		stream.on_change(() => changes++);

		const seen: unknown[] = [];
		for (const batch of batches_of(SOURCE, 3)) {
			stream.apply(batch);
			cached.update(stream.buffer, '');
			expect(cached.html).toBe(fresh(stream.buffer));
			seen.push(stream.data.current?.outline?.headings);
		}
		expect(changes).toBe(batches_of(SOURCE, 3).length);
		// the entries grow as headings close, each with its id
		const last = seen[seen.length - 1];
		expect(last).toEqual([
			{ id: 'one', text: 'One' },
			{ id: 'two', text: 'Two' },
			{ id: 'two-1', text: 'Two' },
		]);
		expect(seen[0]).toBeUndefined();
		expect(seen.findIndex((s) => s !== undefined)).toBeLessThan(
			seen.findIndex((s) => (s as unknown[] | undefined)?.length === 3)
		);
		expect(cached.html).toContain('<h1 id="one">One</h1>');

		// the lookups land after their blocks were rendered and cached
		open();
		await turn();
		expect(changes).toBeGreaterThan(batches_of(SOURCE, 3).length);
		cached.update(stream.buffer, '');
		expect(cached.html).toContain('<h1 id="one" title="looked up">One</h1>');
		expect(cached.html).toBe(fresh(stream.buffer));
		expect(stream.end()).toBeUndefined();
		stream.stop();
	});

	test('end runs the sequential passes and the document hooks, then renders every block', async () => {
		const sequential: ParsePlugin = {
			name: 'late',
			sequential: true,
			heading: {
				parse(node) {
					node.attrs.class = 'late';
				},
			},
			async document(_root, ctx) {
				await turn();
				ctx.set('done', true);
			},
		};
		const stream = new PluginStream({ plugins: [sequential] });
		const cached = new CursorHTMLRenderer();
		stream.renderers.push(cached);
		for (const batch of batches_of('# A\n\ntext\n', 4)) {
			stream.apply(batch);
			cached.update(stream.buffer, '');
		}
		expect(cached.html).toBe('<h1>A</h1><p>text</p>');
		const ended = stream.end();
		expect(ended).toBeInstanceOf(Promise);
		cached.update(stream.buffer, '');
		expect(cached.html).toBe('<h1 class="late">A</h1><p>text</p>');
		expect(stream.data.current).toBeUndefined();
		await ended;
		expect(stream.data.current).toEqual({ late: { done: true } });
	});

	test('a component renderer gives a patched block a new version', async () => {
		let open!: () => void;
		const gate = new Promise<void>((resolve) => (open = resolve));
		const stream = new PluginStream({ plugins: plugins(gate) });
		const blocks = new ComponentRenderer();
		stream.renderers.push(blocks);
		for (const batch of batches_of(SOURCE, 5)) {
			stream.apply(batch);
			blocks.update(stream.buffer, '');
		}
		const before = blocks.blocks.map((b) => b.v);
		blocks.update(stream.buffer, '');
		expect(blocks.blocks.map((b) => b.v)).toEqual(before);
		open();
		await turn();
		blocks.update(stream.buffer, '');
		const after = blocks.blocks.map((b) => b.v);
		// the three headings render again, the paragraphs do not
		expect(after.map((v, i) => v - before[i])).toEqual([1, 0, 1, 0, 1, 0]);
	});
});

describe('a stream with no plugins', () => {
	test('builds and renders as a bare builder does', () => {
		const stream = new PluginStream();
		expect(stream.dispatcher).toBeNull();
		const bare = new WireTreeBuilder();
		const cached = new CursorHTMLRenderer();
		stream.renderers.push(cached);
		for (const batch of batches_of(SOURCE, 2)) {
			stream.apply(batch);
			bare.apply(batch);
			cached.update(stream.buffer, '');
			expect(cached.html).toBe(fresh(bare.get_buffer()));
		}
		expect(stream.end()).toBeUndefined();
		expect(stream.data.current).toBeUndefined();
	});
});
