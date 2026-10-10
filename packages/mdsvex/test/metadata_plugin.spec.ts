import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer as create_http } from 'node:http';
import type { AddressInfo, Server } from 'node:net';
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

const HERE = dirname(fileURLToPath(import.meta.url));
const PREFIX = '\0mdsvex:metadata:';
const DEFAULT = '\nexport default metadata;\n';
const EXTENSIONS = ['.svx', '.md'];

const POSTS: Record<string, string> = {
	'a.svx': '---\ntitle: A\ntags: [x, y]\n---\n\n# Body of a\n',
	'b.md': '---\r\ntitle: B\r\ndraft: true\r\n---\r\n\r\n# Body of b\r\n',
	'empty.svx': '---\n---\n\nBody of empty\n',
	'none.svx': '# Body of none\n',
	'tags.svx': '---\nhtml: "</script><style>p{}</style>"\n---\n\nBody of tags\n',
};

/** a vite app on disk inside the package, so svelte resolves from it */
function write_app(): string {
	const root = mkdtempSync(join(HERE, '.tmp-metadata-'));
	const files: Record<string, string> = {
		'package.json': JSON.stringify({
			name: 'app',
			private: true,
			type: 'module',
		}),
		'src/direct.js': [
			"import { metadata } from './posts/a.svx?metadata';",
			"import by_default from './posts/a.svx?metadata';",
			'export { metadata, by_default };',
		].join('\n'),
		'src/list.js': [
			"export const modules = import.meta.glob('./posts/*', { query: '?metadata', eager: true });",
			"export const named = import.meta.glob('./posts/*', { query: '?metadata', import: 'metadata', eager: true });",
			"export const lazy = import.meta.glob('./posts/*.md', { query: '?metadata', import: 'default' });",
		].join('\n'),
		'src/entry.js': [
			"import { modules, named, lazy } from './list.js';",
			'console.log(modules, named, lazy);',
		].join('\n'),
		'src/both.js': [
			"export const compiled = import.meta.glob('./posts/*', { eager: true });",
			"export const queried = import.meta.glob('./posts/*', { query: '?metadata', eager: true });",
		].join('\n'),
		'src/List.svelte': [
			'<script>',
			"  import { named } from './list.js';",
			'</script>',
			'<ul>',
			'  {#each Object.entries(named) as [path, metadata]}',
			'    <li>{path}: {metadata?.title ?? "untitled"}</li>',
			'  {/each}',
			'</ul>',
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

function metadata_id(root: string, path: string): string {
	return PREFIX + vite_path(root, path) + '.js';
}

function plugins_for(options?: MdsvexOptions): Plugin[][] {
	return [
		mdsvex({ ...options, extensions: EXTENSIONS }),
		svelte({ configFile: false, extensions: ['.svelte', ...EXTENSIONS] }),
	];
}

async function serve(
	root: string,
	plugins: Plugin[][],
	fs?: { strict?: boolean; allow?: string[] }
): Promise<ViteDevServer> {
	return createServer({
		root,
		configFile: false,
		logLevel: 'silent',
		appType: 'custom',
		cacheDir: join(root, '.vite'),
		optimizeDeps: { noDiscovery: true, include: [] },
		server: { middlewareMode: true, hmr: false, watch: null, fs },
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

describe('?metadata imports', () => {
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

	test('resolves to a virtual module in each environment', async () => {
		const importer = vite_path(root, 'src/list.js');
		for (const env of [server.environments.client, server.environments.ssr]) {
			const relative = await env.pluginContainer.resolveId(
				'./posts/a.svx?metadata',
				importer
			);
			const rooted = await env.pluginContainer.resolveId(
				'/src/posts/b.md?metadata'
			);
			expect(relative?.id).toBe(metadata_id(root, 'src/posts/a.svx'));
			expect(rooted?.id).toBe(metadata_id(root, 'src/posts/b.md'));
		}
	});

	test('loads the frontmatter, a crlf document and one with none included', async () => {
		const container = server.environments.client.pluginContainer;
		const load = async (path: string) => {
			const result = await container.load(metadata_id(root, path));
			return typeof result === 'string' ? result : result?.code;
		};
		expect(await load('src/posts/a.svx')).toBe(
			'export const metadata = {"title":"A","tags":["x","y"]};' + DEFAULT
		);
		expect(await load('src/posts/b.md')).toBe(
			'export const metadata = {"title":"B","draft":true};' + DEFAULT
		);
		expect(await load('src/posts/empty.svx')).toBe(
			'export const metadata = {};' + DEFAULT
		);
		expect(await load('src/posts/none.svx')).toBe(
			'export const metadata = undefined;' + DEFAULT
		);
	});

	test('no plugin compiles the module, a request for its id alone finds it', async () => {
		// no importer was transformed yet, as after a restart
		for (const env of [server.environments.client, server.environments.ssr]) {
			const result = await env.transformRequest(
				metadata_id(root, 'src/posts/tags.svx')
			);
			expect(result?.code).toContain('\\u003c/script>\\u003cstyle>p{}');
			expect(result?.code).not.toContain('Body of tags');
			expect(result?.code).not.toContain('svelte');
		}
	});

	test('the client imports the virtual modules, not the documents', async () => {
		const list =
			await server.environments.client.transformRequest('/src/list.js');
		const url = '/@id/__x00__' + metadata_id(root, 'src/posts/a.svx').slice(1);
		expect(list?.code).toContain(`import * as __vite_glob_0_0 from "${url}"`);
		expect(list?.code).toContain(
			`import { metadata as __vite_glob_1_0 } from "${url}"`
		);
		expect(list?.code).not.toContain('.svx?');
		expect(list?.code).not.toContain('.md?');
		const graph = server.environments.client.moduleGraph;
		for (const name of Object.keys(POSTS)) {
			// only a transform loads a document, its node has no result
			const doc = graph.getModuleById(vite_path(root, 'src/posts/' + name));
			expect(doc?.transformResult ?? null).toBeNull();
		}
	});

	test('a direct import gets the named and the default export', async () => {
		const exports = await run(server, '/src/direct.js', (mod) => ({
			metadata: mod.metadata,
			same: mod.metadata === mod.by_default,
		}));
		expect(exports).toEqual({
			metadata: { title: 'A', tags: ['x', 'y'] },
			same: true,
		});
	});

	test('a glob import lists every document', async () => {
		const list = await run(server, '/src/list.js', async (mod) => ({
			modules: Object.fromEntries(
				Object.entries<any>(mod.modules).map(([path, m]) => [
					path,
					[m.metadata, m.default === m.metadata],
				])
			),
			named: { ...mod.named },
			lazy: await mod.lazy['./posts/b.md'](),
		}));
		const expected = {
			'./posts/a.svx': { title: 'A', tags: ['x', 'y'] },
			'./posts/b.md': { title: 'B', draft: true },
			'./posts/empty.svx': {},
			'./posts/none.svx': undefined,
			'./posts/tags.svx': { html: '</script><style>p{}</style>' },
		};
		expect(list.named).toEqual(expected);
		expect(Object.keys(list.named)).toEqual(Object.keys(expected));
		expect(list.modules).toEqual(
			Object.fromEntries(
				Object.entries(expected).map(([path, m]) => [path, [m, true]])
			)
		);
		expect(list.lazy).toEqual({ title: 'B', draft: true });
	});

	test('renders a list on the server without compiling a document', async () => {
		const html = await run(server, '/src/List.svelte', async (mod, runner) => {
			// the component and the renderer must share one svelte instance
			const { render } = await runner.import('svelte/server');
			return render(mod.default).body.replace(/<!--[^]*?-->/g, '');
		});
		expect(html).toContain('<li>./posts/a.svx: A</li>');
		expect(html).toContain('<li>./posts/b.md: B</li>');
		expect(html).toContain('<li>./posts/none.svx: untitled</li>');
		const graph = server.environments.ssr.moduleGraph;
		for (const name of Object.keys(POSTS)) {
			const doc = graph.getModuleById(vite_path(root, 'src/posts/' + name));
			expect(doc?.transformResult ?? null).toBeNull();
		}
	});

	test('equals the metadata export of the compiled document', async () => {
		const pairs = await run(server, '/src/both.js', (mod) =>
			Object.keys(mod.compiled).map((path) => ({
				path,
				compiled: mod.compiled[path].metadata,
				queried: mod.queried[path].metadata,
				component: typeof mod.compiled[path].default,
			}))
		);
		expect(pairs.map((p) => p.path)).toEqual(
			Object.keys(POSTS).map((name) => './posts/' + name)
		);
		for (const pair of pairs) {
			expect(pair.component).toBe('function');
			expect(pair.queried, pair.path).toEqual(pair.compiled);
		}
		expect(pairs.find((p) => p.path === './posts/none.svx')!.compiled).toBe(
			undefined
		);
	});

	test('an edit of the frontmatter invalidates the module of each environment', async () => {
		const ssr_env = server.environments.ssr;
		const client_env = server.environments.client;
		const file = vite_path(root, 'src/posts/a.svx');
		const id = metadata_id(root, 'src/posts/a.svx');
		for (const env of [ssr_env, client_env]) {
			await env.transformRequest('/src/list.js');
			await env.transformRequest(id);
		}

		const hot = plugins[0][0].hotUpdate as Function;
		const edit = (code: string) => {
			writeFileSync(file, code);
			// as the vite watcher does before it runs hot updates
			for (const env of [ssr_env, client_env])
				env.moduleGraph.onFileChange(file);
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
		};
		const module_of = (env: typeof ssr_env) =>
			env.moduleGraph.getModuleById(id)!;

		const body = edit('---\ntitle: A\ntags: [x, y]\n---\n\n# Another body\n');
		expect(await body(ssr_env, 1)).toBeUndefined();
		expect(await body(client_env, 1)).toBeUndefined();
		expect(module_of(ssr_env).transformResult).not.toBeNull();
		expect(module_of(client_env).transformResult).not.toBeNull();

		const front = edit('---\ntitle: A2\ntags: [x, y]\n---\n\n# Another body\n');
		const in_ssr = await front(ssr_env, 2);
		expect(in_ssr.map((m: any) => m.id)).toEqual([id]);
		expect(module_of(ssr_env).transformResult).toBeNull();
		const list = ssr_env.moduleGraph.getModuleById(
			vite_path(root, 'src/list.js')
		)!;
		expect(list.transformResult).toBeNull();
		expect(module_of(client_env).transformResult).not.toBeNull();
		const in_client = await front(client_env, 2);
		expect(in_client.map((m: any) => m.id)).toEqual([id]);
		expect(module_of(client_env).transformResult).toBeNull();

		const named = await run(server, '/src/list.js', (mod) => mod.named);
		expect(named['./posts/a.svx']).toEqual({ title: 'A2', tags: ['x', 'y'] });
		const reloaded = await client_env.transformRequest(id);
		expect(reloaded?.code).toContain('"title":"A2"');

		expect(await front(ssr_env, 3)).toBeUndefined();
		expect(await front(client_env, 3)).toBeUndefined();
	});

	test('watches a document outside the root, vite watches the others', async () => {
		// only a prefix of its path is the root
		const outside = root + '-outside';
		mkdirSync(outside);
		writeFileSync(join(outside, 'far.svx'), '---\ntitle: Far\n---\n');
		const added: string[] = [];
		const watcher = server.watcher;
		const add = watcher.add;
		watcher.add = ((file: string) => (added.push(file), watcher)) as any;
		try {
			const env = server.environments.ssr;
			const far = await env.transformRequest(metadata_id(outside, 'far.svx'));
			await env.transformRequest(metadata_id(root, 'src/posts/empty.svx'));
			expect(far?.code).toContain('"title":"Far"');
			expect(added).toEqual([vite_path(outside, 'far.svx')]);
		} finally {
			watcher.add = add;
			rmSync(outside, { recursive: true, force: true });
		}
	});

	test('a document nothing imported with ?metadata has no module to invalidate', async () => {
		const file = vite_path(root, 'src/posts/unlisted.svx');
		writeFileSync(file, '---\ntitle: U\n---\n');
		const hot = plugins[0][0].hotUpdate as Function;
		const result = await hot.call(
			{ environment: server.environments.ssr },
			{
				type: 'update',
				file,
				timestamp: 1,
				modules: [],
				read: async () => {
					throw new Error('not read');
				},
				server,
			}
		);
		expect(result).toBeUndefined();
	});

	test('a frontmatter error names the document and the position, as its compile does', async () => {
		const file = vite_path(root, 'src/bad.svx');
		writeFileSync(file, '---\r\ntitle: ok\r\ntags: [a\r\n---\r\n\r\ntext\r\n');
		writeFileSync(
			join(root, 'src/bad_list.js'),
			"export { metadata } from './bad.svx?metadata';"
		);
		const env = server.environments.ssr;
		// an importer transforms, only loading the module fails
		await env.transformRequest('/src/bad_list.js');
		const caught = async (promise: Promise<unknown>) => {
			try {
				await promise;
			} catch (e: any) {
				return e;
			}
		};
		const compiled = await caught(env.transformRequest('/src/bad.svx'));
		const queried = await caught(
			env.transformRequest(metadata_id(root, 'src/bad.svx'))
		);
		expect(compiled.name).toBe('FrontmatterError');
		expect(compiled.loc.line).toBe(3);
		expect(queried.name).toBe('FrontmatterError');
		expect(queried.message).toBe(compiled.message);
		expect(normalizePath(queried.id)).toBe(normalizePath(compiled.id));
		expect(queried.id).toBe(file);
		expect(queried.loc).toEqual({ ...compiled.loc, file });

		// nothing loaded, so any edit invalidates the module the importer waits for
		const fixed = '---\ntitle: ok\ntags: [a]\n---\n\ntext\n';
		writeFileSync(file, fixed);
		const hot = plugins[0][0].hotUpdate as Function;
		const stale = await hot.call(
			{ environment: env },
			{
				type: 'update',
				file,
				timestamp: 9,
				modules: [],
				read: async () => fixed,
				server,
			}
		);
		expect(stale.map((m: any) => m.id)).toEqual([
			metadata_id(root, 'src/bad.svx'),
		]);
		const metadata = await run(
			server,
			'/src/bad_list.js',
			(mod) => mod.metadata
		);
		expect(metadata).toEqual({ title: 'ok', tags: ['a'] });
	});
});

describe('?metadata and the files a dev server may serve', () => {
	let root: string;
	let outside: string;
	let server: ViteDevServer;
	let http: Server;
	let origin: string;
	const SECRET = 'hunter2';
	const fenced = (key: string) => `---\n${key}: ${SECRET}\n---\n`;

	async function get(path: string) {
		const res = await fetch(origin + path);
		return { status: res.status, body: await res.text() };
	}

	const url_of = (id: string) => '/@id/__x00__' + id.slice(1);

	async function refusal(env: 'client' | 'ssr', id: string) {
		try {
			await server.environments[env].transformRequest(id);
		} catch (e: any) {
			return { code: e.code, message: String(e.message) };
		}
	}

	beforeAll(async () => {
		root = write_app();
		// the workspace is what vite serves by default, the system temp is not in it
		outside = mkdtempSync(join(tmpdir(), 'mdsvex-metadata-outside-'));
		writeFileSync(join(outside, 'secret.svx'), fenced('token'));
		writeFileSync(join(root, 'config.yaml'), fenced('api_key'));
		writeFileSync(join(root, '.env.md'), fenced('password'));
		server = await serve(root, plugins_for());
		http = create_http(server.middlewares);
		await new Promise<void>((done) => http.listen(0, '127.0.0.1', done));
		origin = 'http://127.0.0.1:' + (http.address() as AddressInfo).port;
	});

	afterAll(async () => {
		await new Promise((done) => http?.close(done));
		await server?.close();
		rmSync(root, { recursive: true, force: true });
		rmSync(outside, { recursive: true, force: true });
	});

	test('serves the metadata of a document, asked for by its id alone', async () => {
		const { status, body } = await get(
			url_of(metadata_id(root, 'src/posts/a.svx'))
		);
		expect(status).toBe(200);
		expect(body).toContain('"title":"A"');
	});

	test('reads no file outside the directories the server may serve', async () => {
		const id = metadata_id(outside, 'secret.svx');
		const over_http = await get(url_of(id));
		expect(over_http.status).not.toBe(200);
		expect(over_http.body).not.toContain(SECRET);
		const through_fs = await get(
			'/@fs' +
				vite_path(outside, 'secret.svx').replace(/^(?!\/)/, '/') +
				'?metadata&import'
		);
		expect(through_fs.status).not.toBe(200);
		expect(through_fs.body).not.toContain(SECRET);

		const refused = await refusal('client', id);
		expect(refused?.code).toBe('ERR_LOAD_URL');
		const missing = await refusal('client', metadata_id(outside, 'no.svx'));
		expect(missing?.code).toBe('ERR_LOAD_URL');
		expect(missing?.message.replaceAll('no.svx', 'secret.svx')).toBe(
			refused?.message
		);
	});

	test('reads no file that is not a document', async () => {
		const id = metadata_id(root, 'config.yaml');
		const { status, body } = await get(url_of(id));
		expect(status).not.toBe(200);
		expect(body).not.toContain(SECRET);
		expect((await refusal('client', id))?.code).toBe('ERR_LOAD_URL');
		// vite reads the id itself for a server environment, which is no path
		const in_ssr = await refusal('ssr', id);
		expect(in_ssr).toBeDefined();
		expect(in_ssr?.message).not.toContain(SECRET);
	});

	test('reads no document that server.fs.deny matches', async () => {
		const id = metadata_id(root, '.env.md');
		const { status, body } = await get(url_of(id));
		expect(status).not.toBe(200);
		expect(body).not.toContain(SECRET);
		expect((await refusal('client', id))?.code).toBe('ERR_LOAD_URL');
	});

	test('loads a document outside the root that the server may serve', async () => {
		// beside the root, so inside the workspace
		const beside = root + '-beside';
		mkdirSync(beside);
		try {
			writeFileSync(join(beside, 'near.svx'), '---\ntitle: Near\n---\n');
			const result = await server.environments.client.transformRequest(
				metadata_id(beside, 'near.svx')
			);
			expect(result?.code).toContain('"title":"Near"');
		} finally {
			rmSync(beside, { recursive: true, force: true });
		}
	});

	test('a server environment loads any document, as vite does for it', async () => {
		const result = await server.environments.ssr.transformRequest(
			metadata_id(outside, 'secret.svx')
		);
		expect(result?.code).toContain(SECRET);
	});

	test('follows server.fs.strict', async () => {
		const loose = await serve(root, plugins_for(), { strict: false });
		try {
			const result = await loose.environments.client.transformRequest(
				metadata_id(outside, 'secret.svx')
			);
			expect(result?.code).toContain(SECRET);
			await expect(
				loose.environments.client.transformRequest(
					metadata_id(root, 'config.yaml')
				)
			).rejects.not.toThrow(SECRET);
		} finally {
			await loose.close();
		}
	});

	test('follows server.fs.allow, .. segments do not get around it', async () => {
		writeFileSync(join(root, 'top.svx'), fenced('token'));
		const narrow = await serve(root, plugins_for(), {
			allow: [join(root, 'src')],
		});
		try {
			const client = narrow.environments.client;
			const allowed = await client.transformRequest(
				metadata_id(root, 'src/posts/a.svx')
			);
			expect(allowed?.code).toContain('"title":"A"');
			for (const path of [
				vite_path(root, 'top.svx'),
				vite_path(root, 'src') + '/../top.svx',
				vite_path(root, 'src') + '/posts/../../top.svx',
				vite_path(root, 'src') + '//../top.svx',
				'src/../top.svx',
			]) {
				await expect(
					client.transformRequest(PREFIX + path + '.js'),
					path
				).rejects.toMatchObject({ code: 'ERR_LOAD_URL' });
			}
		} finally {
			await narrow.close();
		}
	});
});

describe('?metadata with frontmatter.parse', () => {
	let root: string;
	let server: ViteDevServer;

	beforeAll(async () => {
		root = write_app();
		server = await serve(
			root,
			plugins_for({
				frontmatter: {
					parse: (raw) => (raw === '' ? null : { raw, lines: raw.split('\n') }),
				},
			})
		);
	});

	afterAll(async () => {
		await server?.close();
		rmSync(root, { recursive: true, force: true });
	});

	test('parses with the option, as the compile of the document does', async () => {
		const pairs = await run(server, '/src/both.js', (mod) =>
			Object.keys(mod.compiled).map((path) => ({
				path,
				compiled: mod.compiled[path].metadata,
				queried: mod.queried[path].metadata,
			}))
		);
		const of = (name: string) =>
			pairs.find((p) => p.path === './posts/' + name)!;
		expect(of('a.svx').queried).toEqual({
			raw: 'title: A\ntags: [x, y]\n',
			lines: ['title: A', 'tags: [x, y]', ''],
		});
		expect(of('b.md').queried.raw).toBe('title: B\ndraft: true\n');
		expect(of('empty.svx').queried).toEqual({});
		expect(of('none.svx').queried).toBe(undefined);
		for (const pair of pairs)
			expect(pair.queried, pair.path).toEqual(pair.compiled);
	});
});

describe('?metadata in a build', () => {
	let root: string;

	beforeAll(() => {
		root = write_app();
	});

	afterAll(() => {
		rmSync(root, { recursive: true, force: true });
	});

	test.each([false, true])(
		'bundles the metadata and none of the documents, ssr %s',
		async (ssr) => {
			const result: any = await build({
				root,
				configFile: false,
				logLevel: 'silent',
				plugins: plugins_for(),
				build: {
					write: false,
					minify: false,
					ssr: ssr ? 'src/entry.js' : false,
					rollupOptions: ssr ? {} : { input: join(root, 'src/entry.js') },
				},
			});
			const chunks = (Array.isArray(result) ? result : [result]).flatMap(
				(r) => r.output
			);
			const code = chunks.map((c: any) => c.code ?? '').join('\n');
			expect(code).toContain('"title": "A"');
			expect(code).toContain('"title": "B"');
			expect(code).not.toContain('Body of');
			const ids = chunks.flatMap((c: any) => Object.keys(c.modules ?? {}));
			expect(ids).toContain(metadata_id(root, 'src/posts/a.svx'));
			for (const name of Object.keys(POSTS))
				expect(ids).not.toContain(vite_path(root, 'src/posts/' + name));
		}
	);
});
