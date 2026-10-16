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
import type { NodeBuffer, ParsePlugin } from '@mdsvex/parse';
import { TreeBuilder } from '@mdsvex/parse/tree-builder';
import { WireTreeBuilder } from '@mdsvex/parse/wire-tree-builder';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { createServer, normalizePath } from 'vite';
import type { ViteDevServer } from 'vite';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import {
	CompilerSession,
	PluginAsyncError,
	PluginTaskError,
	compile,
	compile_async,
	compile_inputs,
	mdsvex,
} from '../src/main';
import type { Bundle } from '../src/main';
import { source_fences } from '../src/fence_sources';
import { image_imports } from '../src/image_imports';

/** the instance script that gives the plugin data to the components of a document */
const DATA_CONTEXT =
	"<script>\nimport { setContext as set_context_MDSVEX } from 'svelte';\nset_context_MDSVEX(Symbol.for('mdsvex.plugin_data'), { current: plugin_data });\n</script>";

const HERE = dirname(fileURLToPath(import.meta.url));

/** a label for each heading from a lookup that takes a while, and a list of what it found */
function labels(fail?: string): Bundle {
	return {
		name: 'labels',
		parse: {
			heading: {
				parse(node, ctx) {
					return () =>
						ctx.defer(node, async (heading, task) => {
							await new Promise((done) => setTimeout(done, 1));
							const text = heading.text_content;
							if (text === fail) throw new Error(`no label for ${text}`);
							heading.attrs.title = `label ${text}`;
							task.add('found', text);
						});
				},
			},
		},
	};
}

const DOC = '# One\n\n## Two\n';

/** the src of an image written logo:name, from a lookup that takes a while */
function logos(): Bundle {
	return {
		name: 'logos',
		parse: {
			image: {
				parse(node, ctx) {
					return () => {
						const src = node.attrs.src as string;
						if (!src.startsWith('logo:')) return;
						ctx.defer(node, async (image) => {
							await new Promise((done) => setTimeout(done, 1));
							image.attrs.src = `./${src.slice(5)}.png`;
						});
					};
				},
			},
		},
	};
}

/** a fence the document hook adds once a lookup returns, it shows a file, run adds one that runs */
function appendix(run = false): Bundle {
	return {
		name: 'appendix',
		parse: {
			async document(root) {
				await new Promise((done) => setTimeout(done, 1));
				root.append('code_fence', { info: 'ts src=./a.ts' });
				if (run) root.append('code_fence', { info: 'svelte run' });
			},
		},
	};
}

const LOGO = '![Acme](logo:acme)\n';

describe('compile_async', () => {
	test('waits for what plugins deferred, then renders', async () => {
		const { code, data } = await compile_async(DOC, { plugins: [labels()] });
		expect(code).toBe(
			DATA_CONTEXT +
				'<script module>\nexport const plugin_data = {"labels":{"found":["One","Two"]}};\n</script>' +
				'<h1 title="label One">One</h1><h2 title="label Two">Two</h2>'
		);
		expect(data).toEqual({ labels: { found: ['One', 'Two'] } });
	});

	test('a document that defers nothing compiles as compile does', async () => {
		const plain = { plugins: [{ name: 'quiet', parse: {} }] };
		expect(await compile_async(DOC, plain)).toEqual(compile(DOC, plain));
		expect(await compile_async(DOC)).toEqual(compile(DOC));
	});

	test('a task that rejects rejects with a PluginTaskError', async () => {
		const failed = compile_async('\n# One\n', { plugins: [labels('One')] });
		await expect(failed).rejects.toBeInstanceOf(PluginTaskError);
		await expect(failed).rejects.toMatchObject({
			plugin: 'labels',
			message:
				'a task plugin "labels" deferred on the heading node at line 2, column 0 failed: no label for One',
		});
	});
});

describe('what settle adds reaches needs', () => {
	test('compile_async imports an image a task gave its src', async () => {
		const { code } = await compile_async(LOGO, {
			plugins: [logos()],
			import_images: true,
		});
		expect(code).toContain("import __mdsvex_img_0 from './acme.png';");
		expect(code).toContain('<img src={__mdsvex_img_0} alt="Acme" />');
	});

	test('compile_async reads a file a document hook shows', async () => {
		const read: string[] = [];
		const result = await compile_async('# One\n', {
			plugins: [appendix()],
			filename: '/docs/one.svx',
			read: async (path) => (read.push(path), 'let a = 1;'),
			resolve: async (spec, from) => '/docs/' + spec.slice(2) + ':' + from,
		});
		expect(read).toEqual(['/docs/a.ts:/docs/one.svx']);
		expect(result.code).toContain(
			'<code class="language-ts">let a = 1;</code>'
		);
		expect(result.dependencies).toEqual(['/docs/a.ts:/docs/one.svx']);
	});

	test('parse, settle, then needs has them, in document order', async () => {
		const session = new CompilerSession();
		const inputs = compile_inputs({
			plugins: [logos(), appendix()],
			import_images: true,
		});
		const parsed = session.parse(LOGO + '\n![b](./b.png)\n', inputs);
		expect(parsed.needs).toEqual([
			expect.objectContaining({ type: 'image', url: './b.png' }),
		]);
		await session.settle(parsed);
		expect(parsed.needs).toEqual([
			expect.objectContaining({ type: 'image', url: './acme.png' }),
			expect.objectContaining({ type: 'image', url: './b.png' }),
			expect.objectContaining({ type: 'source', spec: './a.ts' }),
		]);
		inputs.sources = { './a.ts': 'let a = 1;' };
		const { code } = session.render(parsed, inputs);
		expect(code).toContain('<img src={__mdsvex_img_0} alt="Acme" />');
		expect(code).toContain('let a = 1;');
	});

	test('only what the inputs of the parse turned on, as they were then', async () => {
		const session = new CompilerSession();
		const inputs = compile_inputs({ plugins: [logos(), appendix(true)] });
		inputs.sources = false;
		const parsed = session.parse(LOGO, inputs);
		inputs.import_images = true;
		inputs.sources = undefined;
		await session.settle(parsed);
		expect(parsed.needs).toBeUndefined();
		expect(parsed.snippets).toEqual([
			expect.objectContaining({ lang: 'svelte', code: '' }),
		]);
	});

	test('a need a task took away goes', async () => {
		const away: Bundle = {
			name: 'away',
			parse: {
				paragraph: {
					parse: (node, ctx) => () =>
						ctx.defer(node, async (p) => {
							await Promise.resolve();
							p.first_child!.remove();
						}),
				},
			},
		};
		const session = new CompilerSession();
		const parsed = session.parse(
			'![a](./a.png)\n',
			compile_inputs({ plugins: [away], import_images: true })
		);
		expect(parsed.needs).toHaveLength(1);
		await session.settle(parsed);
		expect(parsed.needs).toBeUndefined();
	});
});

/** the plugins of bundles as a dispatcher takes them */
const parse_plugins = (bundles: Bundle[]): ParsePlugin[] =>
	bundles.map((b) => ({ ...b.parse!, name: b.name }));

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

describe('what settle adds, on every path a parse takes', () => {
	const source = 'text ' + LOGO + '\n![b](./b.png)\n';
	for (const wire of [false, true])
		for (const chunk of [0, 7, 1]) {
			const name = `${wire ? 'wire' : 'batch'}${chunk === 0 ? '' : ` fed ${chunk}`}`;
			test(name, async () => {
				const { nodes, dispatcher } = build(
					source,
					wire,
					chunk,
					parse_plugins([logos(), appendix(true)])
				);
				dispatcher.run_sequential(nodes);
				const before = image_imports(nodes, source)!.needs.map((n) => n.url);
				expect(before).toEqual(['./b.png']);
				await dispatcher.finish(nodes);
				const images = image_imports(nodes, source)!.needs.map((n) => n.url);
				expect(images).toEqual(['./acme.png', './b.png']);
				const shown = source_fences(nodes, source, undefined, true, true)!;
				expect(shown.needs.map((n) => n.spec)).toEqual(['./a.ts']);
				expect(shown.snippets!.map((s) => s.lang)).toEqual(['svelte']);
			});
		}
});

describe('compile', () => {
	test('throws a PluginAsyncError at the first defer', () => {
		let error: unknown;
		try {
			compile(DOC, { plugins: [labels()] });
		} catch (e) {
			error = e;
		}
		expect(error).toBeInstanceOf(PluginAsyncError);
		expect((error as Error).message).toBe(
			'plugin "labels" called ctx.defer at line 1, column 0, and this parse can not wait for async work, ' +
				'compile() is synchronous, use compile_async() for a document whose plugins wait'
		);
	});
});

describe('the host contract', () => {
	test('parse, settle, read needs, render', async () => {
		const session = new CompilerSession();
		const inputs = compile_inputs({ plugins: [labels()] });
		const parsed = session.parse('# One\n\n```ts src=./a.ts\n```\n', inputs);
		expect(parsed.data).toBeUndefined();
		const settled = session.settle(parsed);
		expect(settled).toBeInstanceOf(Promise);
		await settled;
		expect(parsed.data).toEqual({ labels: { found: ['One'] } });
		expect(parsed.needs).toEqual([
			expect.objectContaining({ type: 'source', spec: './a.ts' }),
		]);
		inputs.sources = { './a.ts': 'let a = 1;' };
		const { code } = session.render(parsed, inputs);
		expect(code).toContain('<h1 title="label One">One</h1>');
		expect(code).toContain('let');
	});

	test('settle is undefined when nothing was deferred', () => {
		const session = new CompilerSession();
		const parsed = session.parse(DOC, compile_inputs());
		expect(session.settle(parsed)).toBeUndefined();
		expect(session.render(parsed, compile_inputs()).code).toBe(
			compile(DOC).code
		);
	});

	test('a document whose plugins deferred renders only once settled', () => {
		const session = new CompilerSession();
		const inputs = compile_inputs({ plugins: [labels()] });
		const parsed = session.parse(DOC, inputs);
		expect(() => session.render(parsed, inputs)).toThrow(
			'wait for settle(parsed) before its render'
		);
	});
});

describe('the vite plugin', () => {
	let root: string;
	let server: ViteDevServer;

	beforeAll(async () => {
		root = mkdtempSync(join(HERE, '.tmp-plugin-deferred-'));
		const files: Record<string, string> = {
			'package.json': '{"name":"app","private":true,"type":"module"}',
			'src/a.svx': DOC,
			'src/b.svx': '# Shown\n\n```ts src=./b.ts\n```\n',
			'src/b.ts': 'export const b = 2;\n',
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
				mdsvex({ plugins: [labels()], highlight: false }),
				svelte({ configFile: false, extensions: ['.svelte', '.svx'] }),
			],
		});
	});

	afterAll(async () => {
		await server?.close();
		rmSync(root, { recursive: true, force: true });
	});

	const path = (file: string) => normalizePath(join(root, file));

	test('waits for deferred work before it renders', async () => {
		const result = await server.environments.ssr.transformRequest('/src/a.svx');
		expect(result!.code).toContain('title="label One"');
		expect(result!.code).toContain('"found": ["One", "Two"]');
	});

	test('and for the files a fence shows, in the same gap', async () => {
		const result = await server.environments.ssr.transformRequest('/src/b.svx');
		expect(result!.code).toContain('title="label Shown"');
		expect(result!.code).toContain('const');
		expect(result!.code).toContain('"found": ["Shown"]');
	});

	test('?data settles too', async () => {
		const loaded = await server.environments.ssr.pluginContainer.load(
			'\0mdsvex:data:' + path('src/a.svx') + '.js'
		);
		const code = typeof loaded === 'string' ? loaded : loaded?.code;
		expect(code).toContain(
			'export const plugin_data = {"labels":{"found":["One","Two"]}};'
		);
	});
});
