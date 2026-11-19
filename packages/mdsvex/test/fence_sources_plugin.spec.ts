import {
	mkdirSync,
	mkdtempSync,
	realpathSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { svelte } from '@sveltejs/vite-plugin-svelte';
import { createServer, createServerModuleRunner, normalizePath } from 'vite';
import type { Plugin, ViteDevServer } from 'vite';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { mdsvex } from '../src/main';
import type { MdsvexOptions } from '../src/main';
import { source_files } from '../src/source_files';

const HERE = dirname(fileURLToPath(import.meta.url));

const MATH = [
	'export function add(a: number, b: number) {',
	'\treturn a + b;',
	'}',
	'',
].join('\n');

function write(root: string, files: Record<string, string>): void {
	for (const [path, content] of Object.entries(files)) {
		mkdirSync(dirname(join(root, path)), { recursive: true });
		writeFileSync(join(root, path), content);
	}
}

/** the path as vite names it, forward slashes on windows too */
function vite_path(root: string, path: string): string {
	return normalizePath(join(root, path));
}

const FILES: Record<string, string> = {
	'package.json': JSON.stringify({
		name: 'app',
		private: true,
		type: 'module',
		imports: { '#lib/*': './src/lib/*' },
	}),
	'src/lib/math.ts': MATH,
	'src/lib/Counter.svelte':
		'<script>\n\tlet count = $state(0);\n</script>\n\n<button onclick={() => count++}>{count}</button>\n',
	'src/lib/markdown.ts': "export { default as pre } from './Pre.svelte';",
	'src/lib/Pre.svelte': [
		'<script>',
		'  let { src, lang, code, children } = $props();',
		'</script>',
		'<figure data-src={src} data-lang={lang} data-lines={code.split("\\n").length}>{@render children()}</figure>',
	].join('\n'),
	'src/docs/local.txt': 'beside the document\n',
	'src/docs/doc.svx': [
		'# Title',
		'',
		'```ts src=../lib/math.ts#L2',
		'```',
		'',
		'```src=#lib/math.ts#L1',
		'```',
		'',
		'```src=@lib/Counter.svelte#L2',
		'```',
		'',
		'```src=./local.txt',
		'```',
		'',
	].join('\n'),
	'src/docs/plain.svx': '# Plain\n\n```ts\nlet a;\n```\n',
	'src/docs/gone.svx': '# Gone\n\ntext\n\n```ts src=./gone.ts\n```\n',
	'src/docs/short.svx': '```ts src=../lib/math.ts#L9\n```\n',
	'src/docs/both.svx': '```ts src=../lib/math.ts#L2\n```\n\n```math\nx\n```\n',
	'src/docs/changing.svx': '```ts src=../lib/math.ts#L2\n```\n',
	'src/lib/Wrap.svx':
		'<script>\n\tlet { children } = $props();\n</script>\n\n```src=./math.ts#L3\n```\n\n{@render children()}\n',
	'src/docs/wrapped.svx': '# Wrapped\n\n```src=../lib/math.ts#L2\n```\n',
};

function write_app(): string {
	// vite names files by their real path
	const root = realpathSync(mkdtempSync(join(HERE, '.tmp-src-')));
	write(root, FILES);
	return root;
}

/** a transform context that resolves as far as these tests need, relative to the importer */
function context(root: string) {
	const watched: string[] = [];
	const warned: unknown[][] = [];
	return {
		watched,
		warned,
		ctx: {
			addWatchFile: (file: string) => void watched.push(file),
			warn: (...args: unknown[]) => void warned.push(args),
			async resolve(spec: string, importer: string) {
				if (spec.startsWith('#lib/') || spec.startsWith('@lib/'))
					return { id: vite_path(root, 'src/lib/' + spec.slice(5)) };
				if (!spec.startsWith('.')) return null;
				return { id: normalizePath(join(dirname(importer), spec)) };
			},
		},
	};
}

describe('vite plugin src=', () => {
	let root: string;
	beforeAll(() => {
		root = write_app();
	});
	afterAll(() => rmSync(root, { recursive: true, force: true }));

	function plugin(options: MdsvexOptions = {}) {
		const [pre] = mdsvex({ highlight: false, ...options }) as any[];
		const made = context(root);
		const transform = (code: string, path = 'src/docs/doc.svx') =>
			pre.transform.call(made.ctx, code, vite_path(root, path));
		return { pre, transform, ...made };
	}

	test('a document without src= transforms synchronously and never resolves', () => {
		const { transform, ctx } = plugin();
		ctx.resolve = () => {
			throw new Error('resolved');
		};
		for (const doc of [
			'',
			'# a\n\ntext\n',
			'```ts\nlet src = 1;\n```\n',
			'```ts title="src=./a.ts"\n```\n',
			'<img src="./a.png" alt="">\n',
		]) {
			const out = transform(doc);
			expect(out).not.toBeInstanceOf(Promise);
			expect(out.code).not.toContain('add(');
		}
	});

	test('a document with src= waits for its files and shows them', async () => {
		const { transform } = plugin();
		const out = transform(FILES['src/docs/doc.svx']);
		expect(out).toBeInstanceOf(Promise);
		// another document compiles while the first reads
		expect(transform('# other\n', 'src/docs/other.svx').code).toBe(
			'<h1>other</h1>'
		);
		expect((await out).code).toContain(
			'<h1>Title</h1>' +
				'<pre><code class="language-ts">\treturn a + b;</code></pre>' +
				'<pre><code class="language-ts">export function add(a: number, b: number) &#123;</code></pre>'
		);
	});

	test('the same file is read once for a document and its text is sliced per fence', async () => {
		const { transform, ctx } = plugin();
		const asked: string[] = [];
		const resolve = ctx.resolve;
		ctx.resolve = (spec, importer) => {
			asked.push(spec);
			return resolve(spec, importer);
		};
		const out = await transform(
			'```src=../lib/math.ts#L1\n```\n\n```src=../lib/math.ts#L3\n```\n'
		);
		expect(asked).toEqual(['../lib/math.ts']);
		expect(out.code).toBe(
			'<pre><code class="language-ts">export function add(a: number, b: number) &#123;</code></pre>' +
				'<pre><code class="language-ts">&#125;</code></pre>'
		);
	});

	test('a watch build watches each file, the dev server does not ask rollup to', async () => {
		const build = plugin();
		build.pre.configResolved.call(
			{},
			{
				root,
				base: '/',
				command: 'build',
				plugins: [],
				logger: { warn() {} },
			}
		);
		await build.transform(
			'```src=../lib/math.ts\n```\n\n```src=./local.txt\n```\n'
		);
		expect(build.watched.sort()).toEqual([
			vite_path(root, 'src/docs/local.txt'),
			vite_path(root, 'src/lib/math.ts'),
		]);
		await build.pre.buildEnd.call({});
		const dev = plugin();
		await dev.transform('```src=../lib/math.ts\n```\n');
		expect(dev.watched).toEqual([]);
	});

	test('a file that does not resolve is a SourceError at the fence', async () => {
		const { transform } = plugin();
		const e: any = await transform(
			FILES['src/docs/gone.svx'],
			'src/docs/gone.svx'
		).catch((e: unknown) => e);
		expect(e.name).toBe('SourceError');
		expect(e.code).toBe('src_missing');
		expect([e.line, e.column]).toEqual([5, 1]);
		const file = vite_path(root, 'src/docs/gone.svx');
		expect(e.message).toBe(
			`Could not read "${vite_path(root, 'src/docs/gone.ts')}", the file src=./gone.ts names (fence at ${file}:5)`
		);
		const bare: any = await transform('```src=math.ts\n```\n').catch(
			(e: unknown) => e
		);
		expect(bare.message).toContain('Could not resolve "math.ts" from "');
	});

	test('a body or a bad slice fails before anything is read', () => {
		const { transform, ctx } = plugin();
		ctx.resolve = () => {
			throw new Error('resolved');
		};
		expect(() => transform('```src=../lib/math.ts\nmine\n```\n')).toThrow(
			/so it can have no code of its own/
		);
		expect(() => transform('```src=../lib/math.ts#L0\n```\n')).toThrow(
			/no line range/
		);
	});

	test('a document that throws leaves the next one its turn', async () => {
		const { transform } = plugin();
		await transform(FILES['src/docs/short.svx'], 'src/docs/short.svx').then(
			() => {
				throw new Error('compiled');
			},
			(e: any) => {
				expect(e.code).toBe('src_slice');
				expect(e.message).toContain('asks for line 9, ../lib/math.ts has 3');
			}
		);
		expect((await transform('```src=../lib/math.ts#L3\n```\n')).code).toBe(
			'<pre><code class="language-ts">&#125;</code></pre>'
		);
		expect(transform('```ts\nx\n```\n').code).toBe(
			'<pre><code class="language-ts">x</code></pre>'
		);
	});

	test('a document with src= and math loads the renderer before its one render', async () => {
		const rendered: string[] = [];
		const { transform, warned } = plugin({
			parse_plugins: [
				{
					name: 'p',
					code_fence: { parse: (node, ctx) => ctx.warn('f', 'a fence', node) },
				},
			],
			highlight: (code) => (rendered.push(code), null),
		});
		const out = await transform(FILES['src/docs/both.svx']);
		expect(out.code).toContain('\treturn a + b;</code></pre>');
		expect(out.code).toContain('<math display="block"');
		expect(rendered).toEqual(['\treturn a + b;']);
		expect(warned.length).toBe(2);
	});

	test('a document with src= and inline math loads the renderer before its one render', async () => {
		const { transform, warned } = plugin();
		const out = await transform(
			'a $`x`$\n\n```ts src=../lib/math.ts#L2\n```\n'
		);
		expect(out.code).toContain(
			'<span class="math math-inline" translate="no"><math><mi>x</mi></math></span>'
		);
		expect(out.code).toContain('\treturn a + b;</code></pre>');
		expect(warned).toEqual([]);
	});

	test('twinkleplop highlights the file by default', async () => {
		const [pre] = mdsvex() as any[];
		const { ctx } = context(root);
		const out = await pre.transform.call(
			ctx,
			'```src=../lib/math.ts#L2\n```\n',
			vite_path(root, 'src/docs/doc.svx')
		);
		expect(out.code).toContain('<pre class="twinkleplop language-ts"');
		expect(out.code).toContain('<span class="tok keyword">return</span>');
	});
});

describe('source_files', () => {
	test('a windows path matches with either slash', () => {
		const files = source_files();
		expect(files.empty).toBe(true);
		files.track('C:\\site\\src\\docs\\a.svx', [
			'C:\\site\\src\\lib\\math.ts',
			'C:/site/src/lib/b.ts',
		]);
		files.track('C:/site/src/docs/b.svx', ['C:/site/src/lib/math.ts']);
		expect(files.empty).toBe(false);
		expect(files.docs_showing('C:/site/src/lib/math.ts')).toEqual([
			'C:/site/src/docs/a.svx',
			'C:/site/src/docs/b.svx',
		]);
		expect(files.docs_showing('C:\\site\\src\\lib\\b.ts')).toEqual([
			'C:/site/src/docs/a.svx',
		]);
		expect(files.docs_showing('C:/site/src/lib/other.ts')).toEqual([]);
		files.drop('C:\\site\\src\\docs\\b.svx');
		expect(files.docs_showing('C:/site/src/lib/math.ts')).toEqual([
			'C:/site/src/docs/a.svx',
		]);
		files.track('C:/site/src/docs/a.svx', []);
		expect(files.docs_showing('C:/site/src/lib/math.ts')).toEqual([]);
		expect(files.files_of('C:/site/src/docs/a.svx')).toEqual([]);
	});
});

async function serve(root: string, main: Plugin[]): Promise<ViteDevServer> {
	return createServer({
		root,
		configFile: false,
		logLevel: 'silent',
		appType: 'custom',
		cacheDir: join(root, '.vite'),
		optimizeDeps: { noDiscovery: true, include: [] },
		resolve: { alias: { '@lib': join(root, 'src/lib') } },
		server: { middlewareMode: true, hmr: false, watch: null },
		plugins: [
			main,
			svelte({ configFile: false, extensions: ['.svelte', '.svx'] }),
		],
	});
}

/** server render in a fresh runner, so no module evaluated before is reused */
async function ssr(server: ViteDevServer, url: string): Promise<string> {
	const runner = createServerModuleRunner(server.environments.ssr, {
		hmr: false,
	});
	try {
		// the component and the renderer must share one svelte instance
		const { render } = await runner.import('svelte/server');
		const mod = await runner.import(url);
		return render(mod.default).body.replace(/<!--[^]*?-->/g, '');
	} finally {
		await runner.close();
	}
}

describe('src= in a dev server', { timeout: 30_000 }, () => {
	let root: string;
	let server: ViteDevServer;
	let replaced: ViteDevServer;
	let plugins: Plugin[];

	beforeAll(async () => {
		root = write_app();
		plugins = mdsvex({ highlight: false });
		server = await serve(root, plugins);
		replaced = await serve(
			root,
			mdsvex({ highlight: false, components: '#lib/markdown.ts' })
		);
	}, 30_000);

	afterAll(async () => {
		await server?.close();
		await replaced?.close();
		rmSync(root, { recursive: true, force: true });
	});

	test('a relative path, a subpath import and a vite alias resolve as an import would', async () => {
		expect(await ssr(server, '/src/docs/doc.svx')).toBe(
			'<h1>Title</h1>' +
				'<pre><code class="language-ts">	return a + b;</code></pre>' +
				'<pre><code class="language-ts">export function add(a: number, b: number) {</code></pre>' +
				'<pre><code class="language-svelte">	let count = $state(0);</code></pre>' +
				'<pre><code class="language-txt">beside the document</code></pre>'
		);
	});

	test('a replaced pre gets src, the language of the file and its code', async () => {
		const html = await ssr(replaced, '/src/docs/doc.svx');
		expect(html).toContain(
			'<figure data-src="../lib/math.ts#L2" data-lang="ts" data-lines="1"><pre><code class="language-ts">	return a + b;</code></pre></figure>'
		);
		expect(html).toContain(
			'<figure data-src="./local.txt" data-lang="txt" data-lines="1">'
		);
		expect(await ssr(replaced, '/src/docs/plain.svx')).toContain(
			'<figure data-lang="ts" data-lines="1">'
		);
	});

	test('a missing file fails the module with a position vite can show', async () => {
		for (const env of [server.environments.ssr, server.environments.client]) {
			const e: any = await env
				.transformRequest('/src/docs/gone.svx')
				.catch((e: unknown) => e);
			expect(e.name).toBe('SourceError');
			expect(e.loc).toMatchObject({ line: 5, column: 1 });
			expect(e.id).toContain('src/docs/gone.svx');
			expect(e.message).toContain('Could not resolve "./gone.ts" from "');
		}
		const short: any = await server.environments.ssr
			.transformRequest('/src/docs/short.svx')
			.catch((e: unknown) => e);
		expect(short.code).toBe('src_slice');
		expect(short.loc).toMatchObject({ line: 1, column: 1 });
		// the session is not left holding the document that failed
		expect(await ssr(server, '/src/docs/plain.svx')).toContain('let a;');
	});

	test('the first document with both src= and math renders both', async () => {
		const html = await ssr(server, '/src/docs/both.svx');
		expect(html).toContain(
			'<pre><code class="language-ts">	return a + b;</code></pre>'
		);
		expect(html).toContain('<math display="block"');
	});

	test('a template that is a document shows a file, as does the document it wraps', async () => {
		const templated = await serve(
			root,
			mdsvex({ highlight: false, templates: { default: '#lib/Wrap.svx' } })
		);
		try {
			expect(await ssr(templated, '/src/docs/wrapped.svx')).toBe(
				'<pre><code class="language-ts">}</code></pre>' +
					'<h1>Wrapped</h1>' +
					'<pre><code class="language-ts">	return a + b;</code></pre>'
			);
		} finally {
			await templated.close();
		}
	});

	test('an edit to the file updates every document that shows it, in both environments', async () => {
		const ssr_env = server.environments.ssr;
		const client_env = server.environments.client;
		for (const url of ['/src/docs/doc.svx', '/src/docs/changing.svx']) {
			await ssr_env.transformRequest(url);
			await client_env.transformRequest(url);
		}
		await ssr_env.transformRequest('/src/docs/plain.svx');

		const file = vite_path(root, 'src/lib/math.ts');
		const code = MATH.replace('a + b', 'b + a');
		writeFileSync(file, code);
		// as the vite watcher does before it runs hot updates
		for (const env of [ssr_env, client_env]) env.moduleGraph.onFileChange(file);

		const hot = plugins[0].hotUpdate as Function;
		const update = (environment: unknown, timestamp: number, changed = file) =>
			hot.call(
				{ environment },
				{
					type: 'update',
					file: changed,
					timestamp,
					modules: [],
					read: async () => code,
					server,
				}
			);

		const doc = vite_path(root, 'src/docs/doc.svx');
		const changing = vite_path(root, 'src/docs/changing.svx');
		const plain = vite_path(root, 'src/docs/plain.svx');
		for (const env of [ssr_env, client_env]) {
			const files = (await update(env, 1)).map((m: any) => m.file);
			expect(files).toContain(doc);
			expect(files).toContain(changing);
			expect(files).not.toContain(plain);
			for (const mod of env.moduleGraph.getModulesByFile(doc)!)
				expect(mod.transformResult).toBeNull();
		}
		expect(await ssr(server, '/src/docs/doc.svx')).toContain(
			'<pre><code class="language-ts">	return b + a;</code></pre>'
		);
		const client = await client_env.transformRequest('/src/docs/changing.svx');
		expect(client!.code).toContain('return b + a;');

		// a file no document shows is nothing to this branch
		expect(
			await update(ssr_env, 2, vite_path(root, 'src/lib/Pre.svelte'))
		).toBeUndefined();

		// a document that drops its src= is no longer updated
		writeFileSync(join(root, 'src/docs/changing.svx'), '# no code now\n');
		for (const env of [ssr_env, client_env]) {
			env.moduleGraph.onFileChange(changing);
			await env.transformRequest('/src/docs/changing.svx');
		}
		const after = (await update(ssr_env, 3)).map((m: any) => m.file);
		expect(after).toContain(doc);
		expect(after).not.toContain(changing);
	});
});
