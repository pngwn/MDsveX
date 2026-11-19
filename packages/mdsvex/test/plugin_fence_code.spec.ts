import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
	PFMParser,
	PluginDispatcher,
	SourceTextSource,
	WireEmitter,
	WireTextSource,
} from '@mdsvex/parse';
import type { NodeBuffer, NodeView, ParsePlugin } from '@mdsvex/parse';
import { TreeBuilder } from '@mdsvex/parse/tree-builder';
import { WireTreeBuilder } from '@mdsvex/parse/wire-tree-builder';
import { CursorHTMLRenderer } from '@mdsvex/render/html-cursor';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { createServer } from 'vite';
import type { ViteDevServer } from 'vite';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { compile, compile_async, mdsvex } from '../src/main';
import type { Bundle, ComponentSource } from '../src/main';
import { source_fences } from '../src/fence_sources';
import { create_highlight, load_default_languages } from '../src/highlight';

const HERE = dirname(fileURLToPath(import.meta.url));

type Make = (quote: NodeView) => void;

/** a block quote that a plugin gives a fence when it closes, made by make */
function quotes(make: Make): Bundle {
	return {
		name: 'quotes',
		parse: { block_quote: { parse: (node) => () => make(node) } },
	};
}

/** the same, from a task that waits */
function later(make: Make): Bundle {
	return {
		name: 'later',
		parse: {
			block_quote: {
				parse(node, ctx) {
					return () =>
						ctx.defer(node, async (quote) => {
							await new Promise((done) => setTimeout(done, 1));
							make(quote);
						});
				},
			},
		},
	};
}

/** a fence a sync or an async document hook adds at the end */
function hook(info: string, code: string, wait = false): Bundle {
	return {
		name: 'hook',
		parse: {
			document(root) {
				const add = () =>
					void root.append('code_fence', { info }).append('text', code);
				if (!wait) return add();
				return new Promise((done) => setTimeout(done, 1)).then(add);
			},
		},
	};
}

const appended: Make = (quote) => {
	const fence = quote.append('code_fence', { info: 'ts' });
	fence.append('text', 'let a = 1;\n');
	fence.append('text', 'let b = 2;');
};
const prepended: Make = (quote) =>
	quote.prepend('code_fence', { info: 'ts' }).append('text', 'let a = 1;');
const wrapped: Make = (quote) => quote.wrap_inner('code_fence', { info: 'ts' });

/** each way to make a fence, the document, and the document with the fence typed */
const CASES: [string, Make, string, string][] = [
	[
		'append',
		appended,
		'> hi\n',
		'> hi\n>\n> ```ts\n> let a = 1;\n> let b = 2;\n> ```\n',
	],
	['prepend', prepended, '> hi\n', '> ```ts\n> let a = 1;\n> ```\n>\n> hi\n'],
	['wrap_inner', wrapped, '> let a = 1;\n', '> ```ts\n> let a = 1;\n> ```\n'],
];

const PRE: ComponentSource[] = [
	{ specifier: 'mdsvex:components', names: ['pre'] },
];

describe('the code of a fence a plugin makes', () => {
	for (const [name, make, source, typed] of CASES) {
		test(`renders, made with ${name}`, () => {
			const { code } = compile(source, { plugins: [quotes(make)] });
			expect(code).toContain('let a = 1;');
			expect(code).toBe(compile(typed).code);
		});

		test(`goes to a pre replacement, made with ${name}`, () => {
			const plugins = [quotes(make)];
			expect(compile(source, { plugins, components: PRE }).code).toBe(
				compile(typed, { components: PRE }).code
			);
		});

		test(`from a task, made with ${name}`, async () => {
			const { code } = await compile_async(source, {
				plugins: [later(make)],
			});
			expect(code).toBe(compile(typed).code);
		});
	}

	test('goes through the highlighter', async () => {
		const highlight = create_highlight({
			languages: await load_default_languages(),
		});
		const { code } = compile('> hi\n', {
			plugins: [quotes(appended)],
			highlight,
		});
		expect(code).toContain('<span');
		expect(code).toBe(compile(CASES[0][3], { highlight }).code);
	});

	test('from a sync and an async document hook', async () => {
		const typed = compile('# One\n\n```ts\nlet a = 1;\n```\n').code;
		const sync = compile('# One\n', {
			plugins: [hook('ts', 'let a = 1;')],
		});
		expect(sync.code).toBe(typed);
		const waited = await compile_async('# One\n', {
			plugins: [hook('ts', 'let a = 1;', true)],
		});
		expect(waited.code).toBe(typed);
	});

	test('follows the code of a typed fence, with a source map', () => {
		const more: Bundle = {
			name: 'more',
			parse: {
				code_fence: {
					parse: (node) => () => void node.append('text', '\nb();'),
				},
			},
		};
		for (const [source, typed] of [
			['```ts\na();\n```\n', '```ts\na();\nb();\n```\n'],
			['> ```ts\n> a();\n> ```\n', '> ```ts\n> a();\n> b();\n> ```\n'],
		]) {
			const made = compile(source, { plugins: [more], sourcemap: true });
			expect(made.code).toBe(compile(typed).code);
			const content = made.mappings!.find((m) => m.data.role === 'content')!;
			const from = content.sourceOffsets[0];
			expect(source.slice(from, from + content.lengths[0])).toContain('a();');
		}
	});

	test('is its text_content', () => {
		let read: string | undefined;
		compile('> hi\n', {
			plugins: [
				quotes((quote) => {
					appended(quote);
					read = quote.last_child!.text_content;
				}),
			],
		});
		expect(read).toBe('let a = 1;\nlet b = 2;');
	});

	test('a block that runs takes it as its code', async () => {
		const { code, snippets } = await compile_async('# One\n', {
			plugins: [hook('svelte run', '<p>ran</p>', true)],
			filename: '/app/page.svx',
			snippets: true,
			components: PRE,
		});
		const typed = compile('# One\n\n```svelte run\n<p>ran</p>\n```\n', {
			filename: '/app/page.svx',
			snippets: true,
			components: PRE,
		});
		expect(code).toBe(typed.code);
		expect(snippets!.map((s) => s.code)).toEqual(['<p>ran</p>']);
	});

	test('a fence that shows a file can not have it', async () => {
		await expect(
			compile_async('# One\n', {
				plugins: [hook('ts src=./a.ts', 'let a = 1;', true)],
				filename: '/app/page.svx',
				read: async () => 'export const a = 1;\n',
				resolve: async (spec) => spec,
			})
		).rejects.toMatchObject({ code: 'src_body' });
	});
});

/** builds source with the batch or the wire builder, whole or fed in chunks */
function build(
	source: string,
	wire: boolean,
	chunk: number,
	plugins: ParsePlugin[]
): { nodes: NodeBuffer; dispatcher: PluginDispatcher } {
	if (!wire) {
		const dispatcher = new PluginDispatcher(
			plugins,
			new SourceTextSource(source)
		);
		dispatcher.allow_async = true;
		const tree = new TreeBuilder(16, dispatcher);
		const parser = new PFMParser(tree);
		if (chunk === 0) parser.parse(source);
		else {
			parser.init();
			for (let i = 0; i < source.length; i += chunk)
				parser.feed(source.slice(i, i + chunk));
			parser.finish();
		}
		return { nodes: tree.get_buffer(), dispatcher };
	}
	const emitter = new WireEmitter();
	const parser = new PFMParser(emitter);
	const dispatcher = new PluginDispatcher(plugins, new WireTextSource([]));
	dispatcher.allow_async = true;
	const builder = new WireTreeBuilder(128, dispatcher);
	if (chunk === 0) {
		emitter.set_source(source);
		parser.parse(source);
	} else {
		parser.init();
		for (let i = 0; i < source.length; i += chunk) {
			emitter.set_source(source.slice(0, i + chunk));
			parser.feed(source.slice(i, i + chunk));
			builder.apply(emitter.flush());
		}
		emitter.set_source(source);
		parser.finish();
	}
	builder.apply(emitter.flush());
	builder.end();
	return { nodes: builder.get_buffer(), dispatcher };
}

const parse_plugins = (bundles: Bundle[]): ParsePlugin[] =>
	bundles.map((b) => ({ ...b.parse!, name: b.name }));

/** the html of source built on a path, after its plugins settled */
async function html_of(
	source: string,
	wire: boolean,
	chunk: number,
	bundles: Bundle[]
): Promise<string> {
	const { nodes, dispatcher } = build(
		source,
		wire,
		chunk,
		parse_plugins(bundles)
	);
	dispatcher.run_sequential(nodes);
	await dispatcher.finish(nodes);
	const renderer = new CursorHTMLRenderer({ cache: false });
	renderer.update(nodes, source);
	return renderer.html;
}

describe('the code of a fence a plugin makes, on every path a parse takes', () => {
	for (const wire of [false, true])
		for (const chunk of [0, 7, 1]) {
			const name = `${wire ? 'wire' : 'batch'}${chunk === 0 ? '' : ` fed ${chunk}`}`;
			test(name, async () => {
				for (const [how, make, source, typed] of CASES) {
					const want = await html_of(typed, wire, chunk, []);
					expect(want, how).toContain('let a = 1;');
					for (const bundle of [quotes(make), later(make)])
						expect(await html_of(source, wire, chunk, [bundle]), how).toBe(
							want
						);
				}
				const { nodes, dispatcher } = build(
					'# One\n',
					wire,
					chunk,
					parse_plugins([hook('svelte run', '<p>ran</p>', true)])
				);
				await dispatcher.finish(nodes);
				const shown = source_fences(nodes, '# One\n', undefined, true, true)!;
				expect(shown.snippets!.map((s) => s.code)).toEqual(['<p>ran</p>']);
			});
		}
});

describe('the vite plugin', () => {
	let root: string;
	let server: ViteDevServer;

	beforeAll(async () => {
		root = mkdtempSync(join(HERE, '.tmp-fence-code-'));
		const files: Record<string, string> = {
			'package.json': '{"name":"app","private":true,"type":"module"}',
			'src/made.svx': '> hi\n',
		};
		for (const [path, content] of Object.entries(files)) {
			mkdirSync(dirname(join(root, path)), { recursive: true });
			writeFileSync(join(root, path), content);
		}
		server = await createServer({
			root,
			configFile: false,
			logLevel: 'silent',
			appType: 'custom',
			cacheDir: join(root, '.vite'),
			optimizeDeps: { noDiscovery: true, include: [] },
			server: { middlewareMode: true, hmr: false, watch: null },
			plugins: [
				mdsvex({ plugins: [later(appended)] }),
				svelte({ configFile: false, extensions: ['.svelte', '.svx'] }),
			],
		});
	});

	afterAll(async () => {
		await server?.close();
		rmSync(root, { recursive: true, force: true });
	});

	test('compiles the code a task put in a fence', async () => {
		const made =
			await server.environments.ssr.transformRequest('/src/made.svx');
		expect(made!.code).toContain('let a = 1;\nlet b = 2;</code>');
	});
});
