import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { ParsePlugin } from '@mdsvex/parse';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import {
	build,
	createServer,
	createServerModuleRunner,
	normalizePath,
} from 'vite';
import type { Plugin, ViteDevServer } from 'vite';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { compile_text, mdsvex } from '../src/main';
import type { Bundle, DocumentText, MdsvexOptions } from '../src/main';

const HERE = dirname(fileURLToPath(import.meta.url));
const TEXT = '\0mdsvex:text:';
const DATA = '\0mdsvex:data:';
const METADATA = '\0mdsvex:metadata:';

const A =
	'---\ntitle: A\n---\n\n# First\n\nBody of a :smile:, see :cite[x].\n\n## Second\n\n```js\ncode()\n```\n';
const POSTS: Record<string, string> = {
	'a.svx': A,
	'b.svx': '# Only\r\n\r\nBody of b, {expr} a little longer.\r\n',
	'bare.svx': '---\ntitle: Bare\n---\n',
};

/** writes text, as an emoji plugin does */
const smile: ParsePlugin = {
	name: 'smile',
	sequential: true,
	text(run) {
		const at = run.text.indexOf(':smile:');
		if (at !== -1) run.replace(at, at + 7, 'text', '\u{1F604}');
	},
};

/** labels a cite once the document is whole, after a wait, as citations does */
const cites: Bundle = {
	name: 'cites',
	module: './src/cites.js',
	directives: {
		cite: {
			text: (args) =>
				args.label === undefined ? undefined : '[' + args.label + ']',
		},
	},
	parse: {
		async document(root) {
			await new Promise((done) => setTimeout(done, 1));
			const walk = (node: typeof root) => {
				for (let c = node.first_child; c !== null; c = c.next) {
					if (c.type === 'directive_inline' && c.attrs.name === 'cite')
						c.attrs.args = { label: '1' };
					walk(c);
				}
			};
			walk(root);
		},
	},
};

const A_TEXT: DocumentText = {
	title: 'First',
	text: 'First\n\nBody of a \u{1F604}, see [1].\n\nSecond\n\ncode()',
	sections: [
		{
			id: 'first',
			heading: 'First',
			depth: 1,
			text: 'Body of a \u{1F604}, see [1].',
		},
		{ id: 'second', heading: 'Second', depth: 2, text: 'code()' },
	],
};

/** a vite app on disk inside the package, so svelte resolves from it */
function write_app(): string {
	const root = mkdtempSync(join(HERE, '.tmp-text-query-'));
	const files: Record<string, string> = {
		'package.json': JSON.stringify({
			name: 'app',
			private: true,
			type: 'module',
		}),
		'src/Cite.svelte': '<script>let { label } = $props();</script>[{label}]',
		'src/cites.js': "export { default as cite } from './Cite.svelte';\n",
		'src/one.js': "export { default } from './posts/a.svx?text';\n",
		'src/list.js':
			"export const texts = import.meta.glob('./posts/*.svx', { query: '?text', import: 'default', eager: true });\n" +
			"export const metadata = import.meta.glob('./posts/*.svx', { query: '?metadata', import: 'metadata', eager: true });\n",
		'src/entry.js': "import { texts } from './list.js';\nconsole.log(texts);\n",
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

function text_id(root: string, path: string): string {
	return TEXT + vite_path(root, path) + '.js';
}

const OPTIONS: MdsvexOptions = {
	heading_ids: true,
	plugins: [cites],
	parse_plugins: [smile],
};

function plugins_for(options?: MdsvexOptions): Plugin[][] {
	return [
		mdsvex({ ...OPTIONS, ...options }),
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
	read: (mod: any) => T
): Promise<T> {
	const runner = createServerModuleRunner(server.environments.ssr, {
		hmr: false,
	});
	try {
		return read(await runner.import(url));
	} finally {
		await runner.close();
	}
}

describe('?text in dev', () => {
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
			text_id(root, path)
		);
		return typeof result === 'string' ? result : result?.code;
	}

	/** writes a document and runs the hot update of an environment for it */
	function edit(path: string, code: string) {
		const file = vite_path(root, path);
		writeFileSync(file, code);
		for (const env of [server.environments.ssr, server.environments.client])
			env.moduleGraph.onFileChange(file);
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

	test('?text resolves to a virtual module in each environment', async () => {
		for (const env of [server.environments.client, server.environments.ssr]) {
			const resolved = await env.pluginContainer.resolveId(
				'./posts/a.svx?text',
				vite_path(root, 'src/list.js')
			);
			expect(resolved?.id).toBe(text_id(root, 'src/posts/a.svx'));
			const other = await env.pluginContainer.resolveId(
				'./posts/a.svx?textual',
				vite_path(root, 'src/list.js')
			);
			expect(other?.id.startsWith(TEXT) ?? false).toBe(false);
		}
	});

	test('?text loads the text with the plugins settled, as compile_text gives it', async () => {
		const code = await load('src/posts/a.svx');
		expect(code).toBe('export default ' + JSON.stringify(A_TEXT) + ';\n');
		const text = await run(server, '/src/one.js', (mod) => mod.default);
		expect(text).toEqual(A_TEXT);
		expect(text).toEqual(await compile_text(A, OPTIONS));
	});

	test('an index globs ?text and compiles no document', async () => {
		const fresh = await serve(root, plugins_for());
		try {
			const texts = await run(fresh, '/src/list.js', (mod) => mod.texts);
			expect(texts).toEqual({
				'./posts/a.svx': A_TEXT,
				'./posts/b.svx': {
					title: 'Only',
					text: 'Only\n\nBody of b, a little longer.',
					sections: [
						{
							id: 'only',
							heading: 'Only',
							depth: 1,
							text: 'Body of b, a little longer.',
						},
					],
				},
				'./posts/bare.svx': { text: '', sections: [] },
			});
			const graph = fresh.environments.ssr.moduleGraph;
			for (const name of Object.keys(POSTS)) {
				const doc = graph.getModuleById(vite_path(root, 'src/posts/' + name));
				expect(doc?.transformResult ?? null).toBeNull();
			}
		} finally {
			await fresh.close();
		}
	});

	test('an edit that changes the text reloads ?text, one of the frontmatter alone leaves it', async () => {
		const ssr = server.environments.ssr;
		const client = server.environments.client;
		const id = text_id(root, 'src/posts/a.svx');
		const metadata_id = METADATA + vite_path(root, 'src/posts/a.svx') + '.js';
		for (const env of [ssr, client]) {
			await env.transformRequest('/src/list.js');
			await env.transformRequest(id);
		}
		const module_of = (env: typeof ssr, of = id) =>
			env.moduleGraph.getModuleById(of)!;

		const titled = edit('src/posts/a.svx', A.replace('title: A', 'title: A2'));
		for (const env of [ssr, client]) {
			const changed = await titled(env, 1);
			expect(changed.map((m: any) => m.id)).toEqual([metadata_id]);
			expect(module_of(env).transformResult).not.toBeNull();
		}

		// a module the edit invalidated compares the next edit once it loaded again
		for (const env of [ssr, client]) await env.transformRequest(metadata_id);
		const longer = edit(
			'src/posts/a.svx',
			A.replace('title: A', 'title: A2') + '\n## Third\n\nMore words.\n'
		);
		for (const env of [ssr, client]) {
			const changed = await longer(env, 2);
			expect(changed.map((m: any) => m.id)).toEqual([id]);
			expect(module_of(env).transformResult).toBeNull();
		}
		const texts = await run(server, '/src/list.js', (mod) => mod.texts);
		expect(texts['./posts/a.svx'].sections.at(-1)).toEqual({
			id: 'third',
			heading: 'Third',
			depth: 2,
			text: 'More words.',
		});

		const back = edit('src/posts/a.svx', A);
		for (const env of [ssr, client]) await back(env, 3);
		expect(await load('src/posts/a.svx')).toContain(JSON.stringify(A_TEXT));
	});

	test('?data and ?text are separate modules of one document', async () => {
		const ssr = server.environments.ssr;
		const data = await ssr.transformRequest(
			DATA + vite_path(root, 'src/posts/a.svx') + '.js'
		);
		expect(data?.code).toContain('plugin_data');
		expect(data?.code).not.toContain('Body of a');
	});
});

describe('?text with other configs', () => {
	let root: string;

	beforeAll(() => {
		root = write_app();
	});

	afterAll(() => {
		rmSync(root, { recursive: true, force: true });
	});

	test('without plugins it reads the text as written, code_blocks false drops code', async () => {
		const server = await serve(
			root,
			plugins_for({
				plugins: undefined,
				parse_plugins: undefined,
				text: { code_blocks: false },
			})
		);
		try {
			const loaded = await server.environments.ssr.transformRequest(
				text_id(root, 'src/posts/a.svx')
			);
			expect(loaded?.code).toContain('"Body of a :smile:, see x."');
			expect(loaded?.code).not.toContain('code()');
		} finally {
			await server.close();
		}
	});

	test('a text option of the wrong shape throws when the plugin is made', () => {
		expect(() => mdsvex({ text: { code_blocks: 'no' as never } })).toThrow(
			'[mdsvex] text must be an object, its code_blocks true or false'
		);
		expect(() => mdsvex({ text: true as never })).toThrow(
			'[mdsvex] text must be an object'
		);
	});
});

describe('?text in a build', () => {
	let root: string;

	beforeAll(() => {
		root = write_app();
	});

	afterAll(() => {
		rmSync(root, { recursive: true, force: true });
	});

	test.each([false, true])(
		'an index bundles the text and none of the documents, ssr %s',
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
				(r: any) => r.output
			);
			const code = chunks.map((c: any) => c.code ?? '').join('\n');
			const ids = chunks.flatMap((c: any) => Object.keys(c.modules ?? {}));
			expect(code).toContain('Body of a \u{1F604}, see [1].');
			expect(code).toContain('"heading": "Second"');
			expect(code).not.toContain('$$renderer');
			expect(ids).toContain(text_id(root, 'src/posts/a.svx'));
			for (const name of Object.keys(POSTS))
				expect(ids).not.toContain(vite_path(root, 'src/posts/' + name));
		}
	);
});
