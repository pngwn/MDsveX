import {
	mkdirSync,
	mkdtempSync,
	realpathSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { TraceMap, originalPositionFor } from '@jridgewell/trace-mapping';
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
import { snippet_hash } from '../src/run_blocks';
import {
	dir_of,
	joined,
	missing_module,
	snippet_code,
	snippet_id,
	snippet_map,
	snippet_modules,
} from '../src/snippet_modules';

const HERE = dirname(fileURLToPath(import.meta.url));

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

const COUNTER = [
	'<script lang="ts">',
	"\timport { add } from '../lib/math';",
	'\tlet count: number = $state(add(2, 3));',
	'</script>',
	'',
	'<button onclick={() => count++}>{count}</button>',
	'',
	'<style>',
	'\tbutton { color: red; }',
	'</style>',
].join('\n');

const SUM = [
	"import { add } from '../lib/math';",
	'',
	'const total: number = add(1, 2);',
	'export default () => total;',
].join('\n');

const QUOTED = 'export default () => 7;';

function fence(info: string, code: string): string {
	return '```' + info + '\n' + code + '\n```\n';
}

const DOC = [
	'# Title',
	'',
	fence('svelte run', COUNTER),
	fence('ts run [sum.ts]', SUM),
	'> ' + fence('js run', QUOTED).trimEnd().split('\n').join('\n> '),
	'',
].join('\n');

/** the url of the module of a block of a document */
function snippet_url(doc: string, extension: string, code: string): string {
	return `${doc}.snippet-${snippet_hash(extension + '\n' + code)}.${extension}`;
}

// what the docs give as the recipe
const PRE = [
	'<script>',
	'\tlet { lang, module, load, src, children } = $props();',
	"\tconst Demo = lang === 'svelte' ? module?.default : undefined;",
	'\tconst result =',
	"\t\t!Demo && typeof module?.default === 'function' ? module.default() : undefined;",
	'</script>',
	'',
	'{#if Demo}',
	'\t<div class="demo"><Demo /></div>',
	'{:else if result !== undefined}',
	'\t<output>{result}</output>',
	'{:else if load}',
	'\t<button class="lazy">run</button>',
	'{/if}',
	'<figure data-src={src}>{@render children()}</figure>',
].join('\n');

const FILES: Record<string, string> = {
	'package.json': JSON.stringify({
		name: 'app',
		private: true,
		type: 'module',
	}),
	'src/lib/math.ts':
		'export function add(a: number, b: number) {\n\treturn a + b;\n}\n',
	'src/lib/Hello.svelte': '<b>hello from a file</b>\n',
	'src/lib/markdown.ts': "export { default as pre } from './Pre.svelte';",
	'src/lib/Pre.svelte': PRE,
	'src/docs/doc.svx': DOC,
	'src/docs/plain.svx': '# Plain\n\n```ts\nlet run = 1;\n```\n',
	'src/docs/file.svx': '```svelte src=../lib/Hello.svelte run\n```\n',
	'src/docs/lazy.svx': fence('ts run=client', 'export default () => 9;'),
	'src/docs/live.svx': fence('ts run eval', 'let a = 1;'),
	'src/docs/styled.svx': '\n\n' + fence('css run', 'a { color: red; }'),
	'src/docs/broken.svx':
		'# Broken\n\ntext\n\n' +
		fence('svelte run', '<p>fine</p>\n\n{#if}') +
		'\n' +
		fence('ts run', 'const a = 1;\nconst = 2;'),
	'src/docs/changing.svx':
		fence('svelte run', '<i>kept</i>') +
		'\n' +
		fence('ts run', 'export default () => 1;'),
	'src/entry.js': "export { default } from './docs/doc.svx';\n",
};

function write_app(): string {
	// vite names files by their real path
	const root = realpathSync(mkdtempSync(join(HERE, '.tmp-run-')));
	write(root, FILES);
	return root;
}

function plugins(options: MdsvexOptions = {}): Plugin[] {
	return [
		...mdsvex({
			highlight: false,
			components: '/src/lib/markdown.ts',
			...options,
		}),
		...(svelte({
			configFile: false,
			extensions: ['.svelte', '.svx'],
		}) as Plugin[]),
	];
}

async function serve(root: string, main: Plugin[]): Promise<ViteDevServer> {
	return createServer({
		root,
		configFile: false,
		logLevel: 'silent',
		appType: 'custom',
		cacheDir: join(root, '.vite'),
		optimizeDeps: { noDiscovery: true, include: [] },
		server: { middlewareMode: true, hmr: false, watch: null },
		plugins: main,
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

describe('the modules of the blocks that run', () => {
	test('an id is the document, a hash and an extension', () => {
		expect(snippet_id('/docs/guide.md.snippet-0123456789.svelte')).toEqual({
			doc: '/docs/guide.md',
			hash: '0123456789',
			extension: 'svelte',
		});
		expect(snippet_id('C:/docs/a.snippet-x.md.snippet-abcdef0123.ts')).toEqual({
			doc: 'C:/docs/a.snippet-x.md',
			hash: 'abcdef0123',
			extension: 'ts',
		});
		for (const path of [
			'/docs/guide.md',
			'/docs/guide.md.snippet-0123.svelte',
			'/docs/guide.md.snippet-0123456789.css',
			'/docs/guide.md.snippet-0123456789.svelte.js',
			'.snippet-0123456789.ts',
		])
			expect(snippet_id(path)).toBeNull();
	});

	test('a relative specifier joins the directory of its document', () => {
		expect(dir_of('C:/site/docs/a.md')).toBe('C:/site/docs');
		expect(joined('C:/site/docs', './a.md.snippet-0123456789.ts')).toBe(
			'C:/site/docs/a.md.snippet-0123456789.ts'
		);
		expect(joined('/site/docs', '../b/./c.ts')).toBe('/site/b/c.ts');
	});

	test('a compile replaces the snippets of a document, the disk only adds', () => {
		const modules = snippet_modules();
		const a = { hash: 'a', lang: 'ts', extension: 'ts', code: '1', line: 2 };
		const b = { hash: 'b', lang: 'ts', extension: 'ts', code: '2', line: 2 };
		expect(modules.empty).toBe(true);
		modules.set('C:\\docs\\a.md', 'one', [a]);
		expect(modules.get('C:/docs/a.md', 'a')).toEqual({
			snippet: a,
			raw: 'one',
		});
		modules.add('C:/docs/a.md', 'two', [a, b]);
		expect(modules.get('C:/docs/a.md', 'a')!.raw).toBe('one');
		expect(modules.get('C:/docs/a.md', 'b')!.raw).toBe('two');
		modules.set('C:/docs/a.md', 'three', [b]);
		expect(modules.get('C:/docs/a.md', 'a')).toBeUndefined();
		modules.drop('C:/docs/a.md');
		expect(modules.empty).toBe(true);
	});

	test('the module of a snippet has its code on the lines of the document', () => {
		const raw =
			'# a\r\n\r\n> ```js run\r\n> const a = 1;\r\n>   call(a);\r\n> ```\r\n';
		const code = 'const a = 1;\n  call(a);';
		const snippet = { hash: 'x', lang: 'js', extension: 'js', code, line: 4 };
		expect(snippet_code(snippet)).toBe('\n\n\n' + code);
		const map = snippet_map('/docs/a.md', raw, snippet);
		expect(map.sources).toEqual(['a.md']);
		expect(map.sourcesContent).toEqual([raw]);
		const traced = new TraceMap(map as any);
		// const, then a, on the fourth line, after the quote marker
		expect(originalPositionFor(traced, { line: 4, column: 0 })).toMatchObject({
			source: 'a.md',
			line: 4,
			column: 2,
		});
		expect(originalPositionFor(traced, { line: 4, column: 6 })).toMatchObject({
			line: 4,
			column: 8,
		});
		expect(originalPositionFor(traced, { line: 5, column: 7 })).toMatchObject({
			line: 5,
			column: 9,
		});
		// a svelte block keeps its columns, so its map can be applied twice
		const svelte = snippet_map('/docs/a.md', raw, {
			...snippet,
			extension: 'svelte',
		});
		const twice = new TraceMap(svelte as any);
		expect(originalPositionFor(twice, { line: 5, column: 7 })).toMatchObject({
			line: 5,
			column: 7,
		});
		// a document that no longer has the lines maps nothing
		const stale = snippet_map('/docs/a.md', '# other\n', snippet);
		expect(stale.mappings).toBe(';;;;');
	});

	test('a missing module is valid in its language', () => {
		expect(missing_module('ts', 'gone')).toBe(
			'console.warn("gone");\nexport {};\n'
		);
		expect(missing_module('svelte', 'gone')).toBe(
			'<script module>\n\tconsole.warn("gone");\n</script>\n'
		);
	});
});

describe('run in the plugin', () => {
	let root: string;
	beforeAll(() => {
		root = write_app();
	});
	afterAll(() => rmSync(root, { recursive: true, force: true }));

	test('a document that runs no block transforms synchronously and keeps no snippet', () => {
		const [pre] = mdsvex({ highlight: false }) as any[];
		const ctx = { warn() {}, addWatchFile() {} };
		for (const doc of [
			'',
			'# a\n\ntext\n',
			'```ts\nlet run = 1;\n```\n',
			'```sh title="run.sh"\nls\n```\n',
			'```ts truncate\nlet a;\n```\n',
		]) {
			const out = pre.transform.call(
				ctx,
				doc,
				vite_path(root, 'src/docs/a.svx')
			);
			expect(out).not.toBeInstanceOf(Promise);
			expect(out.code).not.toContain('__snippet_');
		}
		// nothing was kept, so load has only the disk to ask
		expect(
			pre.resolveId.call(ctx, './other.js', vite_path(root, 'src/docs/a.svx'))
		).toBeUndefined();
	});

	test('a document that only runs blocks transforms synchronously too', () => {
		const [pre] = mdsvex({
			highlight: false,
			components: '/src/lib/markdown.ts',
		}) as any[];
		pre.configResolved({
			// vite gives the root with forward slashes
			root: normalizePath(root),
			base: '/',
			command: 'serve',
			plugins: [],
			logger: { warn() {} },
		});
		const resolved: string[] = [];
		const ctx = {
			warn() {},
			addWatchFile() {},
			async resolve(spec: string) {
				resolved.push(spec);
				return { id: vite_path(root, spec) };
			},
			async load() {
				return { code: "export { default as pre } from './Pre.svelte';" };
			},
		};
		const id = vite_path(root, 'src/docs/a.svx');
		return Promise.resolve(pre.transform.call(ctx, '# warm\n', id)).then(() => {
			const out = pre.transform.call(
				ctx,
				fence('ts run', 'export default 1;'),
				id
			);
			expect(out).not.toBeInstanceOf(Promise);
			expect(out.code).toContain(
				`import * as __snippet_${snippet_hash('ts\nexport default 1;')} from "./a.svx.snippet-`
			);
		});
	});

	test('resolveId takes a specifier, an id, an fs url and leaves the rest', async () => {
		const [pre] = mdsvex({
			highlight: false,
			extensions: ['.svx', '.md'],
		}) as any[];
		pre.configResolved({
			// vite gives the root with forward slashes
			root: normalizePath(root),
			base: '/',
			command: 'serve',
			plugins: [],
			logger: { warn() {} },
		});
		const doc = vite_path(root, 'src/docs/doc.svx');
		const name = 'doc.svx.snippet-0123456789.ts';
		const resolve = (id: string, importer?: string) =>
			pre.resolveId.call({}, id, importer);
		expect(resolve('./' + name, doc)).toBe(doc.replace('doc.svx', name));
		expect(resolve('./' + name, doc + '?template=blog')).toBe(
			doc.replace('doc.svx', name)
		);
		expect(resolve('../docs/' + name + '?v=1', doc)).toBe(
			doc.replace('doc.svx', name) + '?v=1'
		);
		expect(resolve(doc.replace('doc.svx', name))).toBe(
			doc.replace('doc.svx', name)
		);
		// a url is a path from the root
		expect(await resolve('/src/docs/' + name)).toBe(
			doc.replace('doc.svx', name)
		);
		// a document outside the root is served by its path
		expect(resolve('/@fs/C:/other/a.md.snippet-0123456789.ts')).toBe(
			'C:/other/a.md.snippet-0123456789.ts'
		);
		expect(resolve('/@fs/other/a.md.snippet-0123456789.ts')).toBe(
			'/other/a.md.snippet-0123456789.ts'
		);
		// not a document of this plugin, a style of a block, a bare name
		expect(resolve('./a.txt.snippet-0123456789.ts', doc)).toBeUndefined();
		expect(
			resolve(
				'./' + name.replace('.ts', '.svelte') + '?svelte&type=style&lang.css',
				doc
			)
		).toBeUndefined();
		expect(resolve(name, doc)).toBeUndefined();
		expect(resolve('./' + name)).toBeUndefined();
	});
});

describe('run in a dev server', { timeout: 60_000 }, () => {
	let root: string;
	let server: ViteDevServer;

	beforeAll(async () => {
		root = write_app();
		server = await serve(root, plugins());
	}, 30_000);

	afterAll(async () => {
		await server?.close();
		rmSync(root, { recursive: true, force: true });
	});

	test('a server render runs a svelte block and a script block, with their imports', async () => {
		const html = await ssr(server, '/src/docs/doc.svx');
		expect(html).toMatch(
			/<div class="demo"><button class="svelte-[^"]+">5<\/button><\/div>/
		);
		expect(html).toContain('<output>3</output>');
		expect(html).toContain('<output>7</output>');
		// the code is still shown
		expect(html).toContain('export default () => total;</code></pre>');
	});

	test('the client graph serves each block under the id its document imports', async () => {
		const client = server.environments.client;
		const doc = await client.transformRequest('/src/docs/doc.svx');
		const counter = snippet_url('/src/docs/doc.svx', 'svelte', COUNTER);
		const sum = snippet_url('/src/docs/doc.svx', 'ts', SUM);
		expect(doc!.code).toContain(`from "${counter}"`);
		expect(doc!.code).toContain(`from "${sum}"`);

		const ts = await client.transformRequest(sum);
		expect(ts!.code).toContain('const total = add(1, 2);');
		// a relative import resolves from the directory of the document
		expect(ts!.code).toContain('from "/src/lib/math.ts"');

		const sv = await client.transformRequest(counter);
		expect(sv!.code).toContain('svelte_internal_client');
		expect(sv!.code).toContain('from "/src/lib/math.ts"');
		expect(sv!.code).not.toContain(': number');
		const style = /"([^"]+type=style[^"]*)"/.exec(sv!.code)![1];
		expect((await client.transformRequest(style))!.code).toContain(
			'color: red'
		);
		// the module is a file beside the document as far as the graph knows
		const mod = client.moduleGraph.getModuleById(
			vite_path(root, counter.slice(1))
		);
		expect(mod!.file).toBe(vite_path(root, counter.slice(1)));
	});

	test('a position in a block maps to its line of the document', async () => {
		const client = server.environments.client;
		const sum = snippet_url('/src/docs/doc.svx', 'ts', SUM);
		const ts = await client.transformRequest(sum);
		const lines = ts!.code.split('\n');
		const line = lines.findIndex((l) => l.includes('const total'));
		const traced = new TraceMap(ts!.map as any);
		const at = originalPositionFor(traced, {
			line: line + 1,
			column: lines[line].indexOf('total'),
		});
		const written = DOC.split('\n');
		expect(at.source).toContain('doc.svx');
		expect(at.source).not.toContain('snippet');
		expect(written[at.line! - 1]).toBe('const total: number = add(1, 2);');
		expect(at.column).toBe(6);

		const counter = snippet_url('/src/docs/doc.svx', 'svelte', COUNTER);
		const sv = await client.transformRequest(counter);
		const sv_lines = sv!.code.split('\n');
		const sv_line = sv_lines.findIndex((l) => l.includes('add(2, 3)'));
		const sv_at = originalPositionFor(new TraceMap(sv!.map as any), {
			line: sv_line + 1,
			column: sv_lines[sv_line].indexOf('add(2, 3)'),
		});
		expect(sv_at.source).toContain('doc.svx');
		expect(written[sv_at.line! - 1]).toContain('$state(add(2, 3))');
	});

	test('an environment that never compiled the document reads it from disk', async () => {
		const cold = await serve(root, plugins());
		try {
			const sum = snippet_url('/src/docs/doc.svx', 'ts', SUM);
			// by the url alone, as a browser that kept the page asks after a restart
			const ts = await cold.environments.client.transformRequest(sum);
			expect(ts!.code).toContain('const total = add(1, 2);');
			expect(ts!.code).toContain('from "/src/lib/math.ts"');
			const quoted = snippet_url('/src/docs/doc.svx', 'js', QUOTED);
			const js = await cold.environments.ssr.transformRequest(quoted);
			expect(js!.code).toContain('7');
		} finally {
			await cold.close();
		}
	});

	test('a hash the document no longer has is an empty module that warns', async () => {
		const warned: string[] = [];
		const quiet = await serve(root, [
			...plugins(),
			{
				name: 'warnings',
				configResolved(config) {
					const warn = config.logger.warn;
					config.logger.warn = (message, options) => {
						warned.push(message);
						warn(message, options);
					};
				},
			},
		]);
		try {
			const client = quiet.environments.client;
			const ts = await client.transformRequest(
				'/src/docs/doc.svx.snippet-0000000000.ts'
			);
			expect(ts!.code).toContain('console.warn(');
			expect(ts!.code).toContain('0000000000');
			const sv = await client.transformRequest(
				'/src/docs/doc.svx.snippet-0000000000.svelte'
			);
			expect(sv!.code).toContain('console.warn(');
			// a document that is not there at all
			const none = await client.transformRequest(
				'/src/docs/none.svx.snippet-0000000000.js'
			);
			expect(none!.code).toContain('console.warn(');
			expect(warned.join('\n')).toContain(
				'has no block that runs with the hash'
			);
		} finally {
			await quiet.close();
		}
	});

	test('an edit to one block changes its id and keeps the module of the other', async () => {
		const client = server.environments.client;
		const ssr_env = server.environments.ssr;
		const url = '/src/docs/changing.svx';
		const file = vite_path(root, url.slice(1));
		const kept = snippet_url(url, 'svelte', '<i>kept</i>');
		const before = snippet_url(url, 'ts', 'export default () => 1;');
		const after = snippet_url(url, 'ts', 'export default () => 2;');
		expect(await ssr(server, url)).toContain('<output>1</output>');
		const first = await client.transformRequest(url);
		expect(first!.code).toContain(before);
		await client.transformRequest(kept);
		await client.transformRequest(before);
		const kept_id = vite_path(root, kept.slice(1));
		const transformed =
			client.moduleGraph.getModuleById(kept_id)!.transformResult;
		expect(transformed).not.toBeNull();

		writeFileSync(file, FILES['src/docs/changing.svx'].replace('=> 1', '=> 2'));
		// as the vite watcher does before it runs hot updates
		for (const env of [ssr_env, client]) env.moduleGraph.onFileChange(file);
		const second = await client.transformRequest(url);
		expect(second!.code).toContain(after);
		expect(second!.code).not.toContain(before);
		expect(second!.code).toContain(kept);
		// the block that did not change is the module it was
		expect(client.moduleGraph.getModuleById(kept_id)!.transformResult).toBe(
			transformed
		);
		expect((await client.transformRequest(after))!.code).toContain('2');
		expect(await ssr(server, url)).toContain('<output>2</output>');
	});

	test('src= with run imports the file and passes src too', async () => {
		const html = await ssr(server, '/src/docs/file.svx');
		expect(html).toContain(
			'<div class="demo"><b>hello from a file</b></div> <figure data-src="../lib/Hello.svelte">'
		);
		const client =
			await server.environments.client.transformRequest('/src/docs/file.svx');
		expect(client!.code).toContain('from "/src/lib/Hello.svelte"');
		expect(client!.code).not.toContain('.snippet-');
	});

	test('run=client hands over a function that imports the block', async () => {
		const url = '/src/docs/lazy.svx';
		const lazy = snippet_url(url, 'ts', 'export default () => 9;');
		const html = await ssr(server, url);
		expect(html).toContain('<button class="lazy">run</button>');
		expect(html).not.toContain('<output>');
		const client = await server.environments.client.transformRequest(url);
		expect(client!.code).toContain(`import("${lazy}")`);
		expect(client!.code).not.toContain('import * as __snippet_');
		// the server never loaded the module
		expect(
			server.environments.ssr.moduleGraph.getModuleById(
				vite_path(root, lazy.slice(1))
			)?.transformResult ?? null
		).toBeNull();
		const runner = createServerModuleRunner(server.environments.ssr, {
			hmr: false,
		});
		try {
			const mod = await runner.import(lazy);
			expect(mod.default()).toBe(9);
		} finally {
			await runner.close();
		}
	});

	test('a block that can not run fails its document with a position', async () => {
		for (const env of [server.environments.ssr, server.environments.client]) {
			const live: any = await env
				.transformRequest('/src/docs/live.svx')
				.catch((e: unknown) => e);
			expect(live.name).toBe('RunError');
			expect(live.code).toBe('run_eval');
			expect(live.loc).toMatchObject({ line: 1, column: 1 });
			expect(live.id).toContain('src/docs/live.svx');
		}
		const styled: any = await server.environments.ssr
			.transformRequest('/src/docs/styled.svx')
			.catch((e: unknown) => e);
		expect(styled.code).toBe('run_lang');
		expect(styled.loc).toMatchObject({ line: 3, column: 1 });
		// the session is not left holding the document that failed
		expect(await ssr(server, '/src/docs/plain.svx')).toContain('let run = 1;');
	});

	test('code that does not compile fails its block at the line of the document', async () => {
		const client = server.environments.client;
		const url = '/src/docs/broken.svx';
		// the document itself is fine, its blocks are not
		const doc = await client.transformRequest(url);
		expect(doc!.code).toContain('.snippet-');
		const sv: any = await client
			.transformRequest(snippet_url(url, 'svelte', '<p>fine</p>\n\n{#if}'))
			.catch((e: unknown) => e);
		expect(sv.name).toBe('CompileError');
		expect(sv.loc.file).toContain('broken.svx');
		expect(sv.loc.line).toBe(8);
		expect(sv.frame).toContain(' 8 |  {#if}');
		const ts: any = await client
			.transformRequest(snippet_url(url, 'ts', 'const a = 1;\nconst = 2;'))
			.catch((e: unknown) => e);
		expect(ts.message).toContain('Expected identifier');
		expect(ts.loc.file).toContain('broken.svx');
		expect(ts.loc).toMatchObject({ line: 13, column: 6 });
	});

	test('without a component for pre a block that runs is an error', async () => {
		const bare = await serve(root, plugins({ components: undefined }));
		try {
			const e: any = await bare.environments.ssr
				.transformRequest('/src/docs/doc.svx')
				.catch((e: unknown) => e);
			expect(e.name).toBe('RunError');
			expect(e.code).toBe('run_pre');
			expect(e.loc).toMatchObject({ line: 3, column: 1 });
			expect(await ssr(bare, '/src/docs/plain.svx')).toContain('let run = 1;');
		} finally {
			await bare.close();
		}
	});
});

describe('run in a build', { timeout: 60_000 }, () => {
	let root: string;
	beforeAll(() => {
		root = write_app();
	});
	afterAll(() => rmSync(root, { recursive: true, force: true }));

	test('the bundle holds each block once, compiled, with its style', async () => {
		const out = (await build({
			root,
			configFile: false,
			logLevel: 'silent',
			plugins: plugins(),
			build: {
				write: false,
				minify: false,
				lib: { entry: join(root, 'src/entry.js'), formats: ['es'] },
				rollupOptions: { external: [/^svelte/] },
			},
		})) as any;
		const outputs = (Array.isArray(out) ? out : [out]).flatMap(
			(o: any) => o.output
		);
		const js = outputs.find((o: any) => o.type === 'chunk').code as string;
		expect(js).toContain('$.state($.proxy(add(2, 3)))');
		expect(js).toContain('() => 7');
		// compiled once, the text the block shows is a string of the document
		expect(js.split('const total = add(1, 2);').length).toBe(2);
		const css = outputs.find((o: any) => o.fileName.endsWith('.css'));
		expect(String(css?.source)).toContain('color: red');
	});
});
