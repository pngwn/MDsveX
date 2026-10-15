import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { svelte } from '@sveltejs/vite-plugin-svelte';
import {
	build,
	createServer,
	createServerModuleRunner,
	normalizePath,
} from 'vite';
import type { Plugin, ViteDevServer } from 'vite';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { mdsvex } from '../src/main';
import type { MdsvexOptions } from '../src/main';
import { reading_time } from './reading_time_plugin';
import { toc } from './toc_plugin';

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA = '\0mdsvex:data:';
const METADATA = '\0mdsvex:metadata:';
const DEFAULT = '\nexport default { metadata, plugin_data };\n';

const A = '---\ntitle: A\n---\n\n# First\n\nBody of a.\n\n## Second\n';
const POSTS: Record<string, string> = {
	'a.svx': A,
	'b.svx': '# Only\r\n\r\nBody of b, a little longer.\r\n',
	'bare.svx': '---\ntitle: Bare\n---\n',
};
const A_DATA =
	'{"toc":{"headings":[{"depth":1,"text":"First","id":"first"},{"depth":2,"text":"Second","id":"second"}]},' +
	'"reading_time":{"words":5,"minutes":1}}';

/** a vite app on disk inside the package, so svelte resolves from it */
function write_app(): string {
	const root = mkdtempSync(join(HERE, '.tmp-plugin-data-'));
	const files: Record<string, string> = {
		'package.json': JSON.stringify({
			name: 'app',
			private: true,
			type: 'module',
		}),
		'src/Post.svelte': [
			'<script>',
			'  let { title, plugin_data, children } = $props();',
			'</script>',
			'<h1 class="title">{title}</h1>',
			'<nav>',
			'  {#each plugin_data?.toc?.headings ?? [] as heading}',
			'    <a href="#{heading.id}">{heading.text}</a>',
			'  {/each}',
			'</nav>',
			'<p class="time">{plugin_data?.reading_time?.minutes ?? 0} min</p>',
			'{@render children()}',
		].join('\n'),
		'src/page.js': [
			"import Page, { metadata, plugin_data } from './posts/a.svx';",
			'export { Page, metadata, plugin_data };',
		].join('\n'),
		'src/own.svx':
			'# Own\n\n## Words\n\nThis page has {plugin_data.toc.headings.length} headings.\n',
		'src/list.js':
			"export const posts = import.meta.glob('./posts/*.svx', { query: '?data', eager: true });\n" +
			"export const data = import.meta.glob('./posts/*.svx', { query: '?data', import: 'plugin_data', eager: true });\n" +
			"export const metadata = import.meta.glob('./posts/*.svx', { query: '?metadata', import: 'metadata', eager: true });\n",
		'src/Index.svelte': [
			'<script>',
			"  import { posts } from './list.js';",
			'</script>',
			'<ul>',
			'  {#each Object.entries(posts) as [path, post]}',
			'    <li>',
			'      {path}: {post.metadata?.title ?? "untitled"},',
			'      {post.plugin_data?.reading_time.words ?? 0} words,',
			'      {post.plugin_data?.toc?.headings.map((h) => h.text).join(" / ") ?? "no headings"}',
			'    </li>',
			'  {/each}',
			'</ul>',
		].join('\n'),
		'src/entry.js': "import { posts } from './list.js';\nconsole.log(posts);\n",
		// used, or a client build drops the exports of its entry
		'src/mount.js': [
			"import { mount } from 'svelte';",
			"import Page, { plugin_data } from './posts/a.svx';",
			'console.log(plugin_data);',
			'mount(Page, { target: document.body });',
		].join('\n'),
		'src/both.js': [
			"export const compiled = import.meta.glob('./posts/*.svx', { eager: true });",
			"export const queried = import.meta.glob('./posts/*.svx', { query: '?data', eager: true });",
		].join('\n'),
	};
	for (const [name, content] of Object.entries(POSTS))
		files['src/posts/' + name] = content;
	for (const [path, content] of Object.entries(files)) {
		mkdirSync(dirname(join(root, path)), { recursive: true });
		writeFileSync(join(root, path), content);
	}
	return root;
}

/** ids and hot update files use forward slashes on every platform */
function vite_path(root: string, path: string): string {
	return normalizePath(join(root, path));
}

function data_id(root: string, path: string): string {
	return DATA + vite_path(root, path) + '.js';
}

function plugins_for(options?: MdsvexOptions): Plugin[][] {
	return [
		mdsvex({
			heading_ids: true,
			plugins: [toc(), reading_time()],
			templates: { default: './src/Post.svelte' },
			...options,
		}),
		svelte({ configFile: false, extensions: ['.svelte', '.svx'] }),
	];
}

async function serve(
	root: string,
	plugins: Plugin[][]
): Promise<ViteDevServer> {
	return createServer({
		root,
		configFile: false,
		logLevel: 'silent',
		appType: 'custom',
		cacheDir: join(root, '.vite'),
		optimizeDeps: { noDiscovery: true, include: [] },
		server: { middlewareMode: true, hmr: false, watch: null },
		plugins,
	});
}

/** the exports of a module in a fresh runner, so nothing evaluated before is reused */
async function run<T>(
	server: ViteDevServer,
	url: string,
	read: (mod: any, runner: any) => T | Promise<T>
): Promise<T> {
	const runner = createServerModuleRunner(server.environments.ssr, {
		hmr: false,
	});
	try {
		return await read(await runner.import(url), runner);
	} finally {
		await runner.close();
	}
}

/** the body a component renders on the server, without the comments svelte adds */
async function rendered(server: ViteDevServer, url: string): Promise<string> {
	return run(server, url, async (mod, runner) => {
		// the component and the renderer must share one svelte instance
		const { render } = await runner.import('svelte/server');
		return render(mod.default ?? mod.Page)
			.body.replace(/<!--[^]*?-->/g, '')
			.replace(/\s+/g, ' ');
	});
}

describe('plugin data in dev', () => {
	let root: string;
	let server: ViteDevServer;
	let plugins: Plugin[][];

	beforeAll(async () => {
		root = write_app();
		plugins = plugins_for();
		server = await serve(root, plugins);
	});

	afterAll(async () => {
		await server?.close();
		rmSync(root, { recursive: true, force: true });
	});

	async function load(path: string) {
		const result = await server.environments.client.pluginContainer.load(
			data_id(root, path)
		);
		return typeof result === 'string' ? result : result?.code;
	}

	/** writes a document and runs the hot update of an environment for it */
	function edit(path: string, code: string) {
		const file = vite_path(root, path);
		writeFileSync(file, code);
		const environments = [server.environments.ssr, server.environments.client];
		// as the vite watcher does before it runs hot updates
		for (const env of environments) env.moduleGraph.onFileChange(file);
		const hot = plugins[0][0].hotUpdate as Function;
		return (environment: unknown, timestamp: number) =>
			hot.call(
				{ environment },
				{
					type: 'update',
					file,
					timestamp,
					modules: [],
					read: async () => code,
					server,
				}
			);
	}

	test('a page imports plugin_data beside metadata', async () => {
		const page = await run(server, '/src/page.js', (mod) => ({
			metadata: mod.metadata,
			plugin_data: mod.plugin_data,
		}));
		expect(page.metadata).toEqual({ title: 'A' });
		expect(JSON.stringify(page.plugin_data)).toBe(A_DATA);
	});

	test('a template takes it as a prop', async () => {
		const html = await rendered(server, '/src/page.js');
		expect(html).toContain('<h1 class="title">A</h1>');
		expect(html).toContain(
			'<nav><a href="#first">First</a><a href="#second">Second</a></nav>'
		);
		expect(html).toContain('<p class="time">1 min</p>');
		expect(html).toContain('<h1 id="first">First</h1><p>Body of a.</p>');
	});

	test('a document reads its own export', async () => {
		const html = await rendered(server, '/src/own.svx?template=false');
		expect(html).toContain('<p>This page has 2 headings.</p>');
	});

	test('?data resolves to a virtual module in each environment', async () => {
		for (const env of [server.environments.client, server.environments.ssr]) {
			const relative = await env.pluginContainer.resolveId(
				'./posts/a.svx?data',
				vite_path(root, 'src/list.js')
			);
			expect(relative?.id).toBe(data_id(root, 'src/posts/a.svx'));
			const other = await env.pluginContainer.resolveId(
				'./posts/a.svx?database',
				vite_path(root, 'src/list.js')
			);
			expect(other?.id.startsWith(DATA) ?? false).toBe(false);
		}
	});

	test('?data loads the metadata and what the plugins left', async () => {
		expect(await load('src/posts/a.svx')).toBe(
			'export const metadata = {"title":"A"};\n' +
				`export const plugin_data = ${A_DATA};` +
				DEFAULT
		);
		expect(await load('src/posts/b.svx')).toBe(
			'export const metadata = undefined;\n' +
				'export const plugin_data = {"toc":{"headings":[{"depth":1,"text":"Only","id":"only"}]},' +
				'"reading_time":{"words":7,"minutes":1}};' +
				DEFAULT
		);
		expect(await load('src/posts/bare.svx')).toBe(
			'export const metadata = {"title":"Bare"};\n' +
				'export const plugin_data = undefined;' +
				DEFAULT
		);
	});

	test('?data equals what the compiled document exports', async () => {
		const pairs = await run(server, '/src/both.js', (mod) =>
			Object.keys(mod.compiled).map((path) => ({
				path,
				compiled: [mod.compiled[path].metadata, mod.compiled[path].plugin_data],
				queried: [mod.queried[path].metadata, mod.queried[path].plugin_data],
				by_default: mod.queried[path].default,
			}))
		);
		expect(pairs.map((p) => p.path)).toEqual(
			Object.keys(POSTS).map((name) => './posts/' + name)
		);
		for (const pair of pairs) {
			expect(pair.queried, pair.path).toEqual(pair.compiled);
			expect(pair.by_default).toEqual({
				metadata: pair.queried[0],
				plugin_data: pair.queried[1],
			});
		}
	});

	test('an index page globs ?data and compiles no document', async () => {
		// a server of its own, the tests above compiled the documents
		const fresh = await serve(root, plugins_for());
		try {
			const html = await rendered(fresh, '/src/Index.svelte');
			expect(html).toContain(
				'<li>./posts/a.svx: A, 5 words, First / Second</li>'
			);
			expect(html).toContain('<li>./posts/b.svx: untitled, 7 words, Only</li>');
			expect(html).toContain(
				'<li>./posts/bare.svx: Bare, 0 words, no headings</li>'
			);
			const graph = fresh.environments.ssr.moduleGraph;
			for (const name of Object.keys(POSTS)) {
				const doc = graph.getModuleById(vite_path(root, 'src/posts/' + name));
				expect(doc?.transformResult ?? null).toBeNull();
			}
		} finally {
			await fresh.close();
		}
	});

	test('an edit of the body that changes the data reloads ?data and leaves ?metadata', async () => {
		const ssr = server.environments.ssr;
		const client = server.environments.client;
		const id = data_id(root, 'src/posts/a.svx');
		const metadata_id = METADATA + vite_path(root, 'src/posts/a.svx') + '.js';
		for (const env of [ssr, client]) {
			await env.transformRequest('/src/list.js');
			await env.transformRequest(id);
			await env.transformRequest(metadata_id);
		}
		const module_of = (env: typeof ssr, of = id) =>
			env.moduleGraph.getModuleById(of)!;

		// the same headings and as many words
		const same = edit(
			'src/posts/a.svx',
			A.replace('Body of a.', 'Words in a.')
		);
		expect(await same(ssr, 1)).toBeUndefined();
		expect(await same(client, 1)).toBeUndefined();
		expect(module_of(ssr).transformResult).not.toBeNull();

		const longer = edit(
			'src/posts/a.svx',
			A + '\n## Third\n\nAnd more words.\n'
		);
		for (const env of [ssr, client]) {
			const changed = await longer(env, 2);
			expect(changed.map((m: any) => m.id)).toEqual([id]);
			expect(module_of(env).transformResult).toBeNull();
			expect(module_of(env, metadata_id).transformResult).not.toBeNull();
		}
		const list = ssr.moduleGraph.getModuleById(vite_path(root, 'src/list.js'))!;
		expect(list.transformResult).toBeNull();

		const data = await run(server, '/src/list.js', (mod) => mod.data);
		expect(data['./posts/a.svx']).toEqual({
			toc: {
				headings: [
					{ depth: 1, text: 'First', id: 'first' },
					{ depth: 2, text: 'Second', id: 'second' },
					{ depth: 2, text: 'Third', id: 'third' },
				],
			},
			reading_time: { words: 9, minutes: 1 },
		});
		const html = await rendered(server, '/src/Index.svelte');
		expect(html).toContain(
			'<li>./posts/a.svx: A, 9 words, First / Second / Third</li>'
		);

		const back = edit('src/posts/a.svx', A);
		for (const env of [ssr, client]) await back(env, 3);
		expect(await load('src/posts/a.svx')).toContain(A_DATA);
	});

	test('an edit of the frontmatter reloads both', async () => {
		const ssr = server.environments.ssr;
		const id = data_id(root, 'src/posts/a.svx');
		const metadata_id = METADATA + vite_path(root, 'src/posts/a.svx') + '.js';
		await ssr.transformRequest(id);
		await ssr.transformRequest(metadata_id);
		const titled = edit('src/posts/a.svx', A.replace('title: A', 'title: A2'));
		const changed = await titled(ssr, 4);
		expect(changed.map((m: any) => m.id).sort()).toEqual(
			[id, metadata_id].sort()
		);
		expect(await load('src/posts/a.svx')).toContain('{"title":"A2"}');
		await edit('src/posts/a.svx', A)(ssr, 5);
	});

	test('reads no file the server may not serve, and none that is no document', async () => {
		const outside = mkdtempSync(join(tmpdir(), 'mdsvex-data-outside-'));
		writeFileSync(join(outside, 'secret.svx'), '# hunter2\n');
		writeFileSync(join(root, 'notes.txt'), '# hunter2\n');
		try {
			for (const id of [
				data_id(outside, 'secret.svx'),
				data_id(root, 'notes.txt'),
				// a path vite would take as inside the root
				DATA + vite_path(root, 'src') + '/../../../../../secret.svx.js',
			]) {
				let code: unknown;
				try {
					code = (await server.environments.client.transformRequest(id))?.code;
				} catch (e: any) {
					code = e.code;
				}
				expect(code, id).toBe('ERR_LOAD_URL');
			}
			// the server reads any file for its own process
			const own = await server.environments.ssr.transformRequest(
				data_id(outside, 'secret.svx')
			);
			expect(own?.code).toContain('hunter2');
		} finally {
			rmSync(outside, { recursive: true, force: true });
		}
	});
});

describe('?data with other configs', () => {
	let root: string;

	beforeAll(() => {
		root = write_app();
	});

	afterAll(() => {
		rmSync(root, { recursive: true, force: true });
	});

	test('without plugins it reads the frontmatter and an edit of the body reloads nothing', async () => {
		const plugins = plugins_for({ plugins: undefined, templates: undefined });
		const server = await serve(root, plugins);
		try {
			const env = server.environments.ssr;
			const id = data_id(root, 'src/posts/a.svx');
			const loaded = await env.transformRequest(id);
			expect(loaded?.code).toContain('const metadata = {"title":"A"}');
			expect(loaded?.code).toContain('const plugin_data = undefined');
			const file = vite_path(root, 'src/posts/a.svx');
			const code = A + '\n## More\n';
			const changed = await (plugins[0][0].hotUpdate as Function).call(
				{ environment: env },
				{
					type: 'update',
					file,
					timestamp: 1,
					modules: [],
					read: async () => code,
					server,
				}
			);
			expect(changed).toBeUndefined();
		} finally {
			await server.close();
		}
	});

	test('a value that is not json fails the import with the plugin and the path', async () => {
		const server = await serve(
			root,
			plugins_for({
				templates: undefined,
				plugins: [
					{
						name: 'dated',
						parse: {
							heading: {
								parse(_node, ctx) {
									ctx.set('at', new Date(0) as never);
								},
							},
						},
					},
				],
			})
		);
		try {
			let error: any;
			try {
				await server.environments.ssr.transformRequest(
					data_id(root, 'src/posts/a.svx')
				);
			} catch (e) {
				error = e;
			}
			expect(error?.name).toBe('PluginDataError');
			expect(error.plugin).toBe('dated');
			expect(error.path).toBe('at');
			expect(error.id).toBe(vite_path(root, 'src/posts/a.svx'));
		} finally {
			await server.close();
		}
	});
});

describe('plugin data in a build', () => {
	let root: string;

	beforeAll(() => {
		root = write_app();
	});

	afterAll(() => {
		rmSync(root, { recursive: true, force: true });
	});

	async function bundle(entry: string, ssr: boolean) {
		const result: any = await build({
			root,
			configFile: false,
			logLevel: 'silent',
			plugins: plugins_for(),
			build: {
				write: false,
				minify: false,
				ssr: ssr ? entry : false,
				rollupOptions: ssr ? {} : { input: join(root, entry) },
			},
		});
		const chunks = (Array.isArray(result) ? result : [result]).flatMap(
			(r) => r.output
		);
		return {
			code: chunks.map((c: any) => c.code ?? '').join('\n'),
			ids: chunks.flatMap((c: any) => Object.keys(c.modules ?? {})),
		};
	}

	test.each([false, true])(
		'an index bundles the data and none of the documents, ssr %s',
		async (ssr) => {
			const { code, ids } = await bundle('src/entry.js', ssr);
			expect(code).toContain('"text": "Second"');
			expect(code).toContain('"words": 7');
			expect(code).not.toContain('Body of');
			expect(ids).toContain(data_id(root, 'src/posts/a.svx'));
			for (const name of Object.keys(POSTS))
				expect(ids).not.toContain(vite_path(root, 'src/posts/' + name));
		}
	);

	test.each([false, true])('a page bundles its export, ssr %s', async (ssr) => {
		const { code } = await bundle('src/mount.js', ssr);
		expect(code).toMatch(/const plugin_data(\$\d+)? = \{\s*"toc": \{/);
		expect(code).toMatch(/"words": 5/);
	});
});
