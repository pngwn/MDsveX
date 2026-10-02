import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { svelte } from '@sveltejs/vite-plugin-svelte';
import { createServer, createServerModuleRunner, normalizePath } from 'vite';
import type { Plugin, ViteDevServer } from 'vite';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import {
	mdsvex,
	module_script,
	scan_exports,
	scan_exports_detail,
} from '../src/main';

const HERE = dirname(fileURLToPath(import.meta.url));

describe('scan_exports', () => {
	test('reads js exports, re-exports included', async () => {
		const code = [
			"export { default as h1, default as h2 } from './H.svelte';",
			"import P from './P.svelte';",
			'export { P as p };',
			'export const helper = 1;',
			'export function img() {}',
			"export * as ns from './ns.js';",
		].join('\n');
		expect(await scan_exports(code, 'js')).toEqual([
			'h1',
			'h2',
			'p',
			'helper',
			'img',
			'ns',
		]);
	});

	test('strips typescript, type exports are not names', async () => {
		const code = [
			"export { default as pre } from './Pre.svelte';",
			'export type Props = { level: number };',
			'export interface Other {}',
			"export type { Thing } from './thing';",
			'export const a: number = 1;',
			'export enum Kind { A }',
		].join('\n');
		expect(await scan_exports(code, 'js')).toEqual(['pre', 'a', 'Kind']);
	});

	test('reports export * re-exports it cannot see through', async () => {
		const result = await scan_exports_detail(
			"export * from './md.js';\nexport { default as p } from './P.svelte';",
			'js'
		);
		expect(result).toEqual({
			names: ['p'],
			stars: ['./md.js'],
			namespaces: [],
		});
	});

	test('reports namespace re-exports with their specifiers', async () => {
		const result = await scan_exports_detail(
			[
				"export * as directives from './directives.ts';",
				'export * as \'odd name\' from "./odd.js";',
				"export { default as p } from './P.svelte';",
				"import * as other from './other.js';",
				'export { other };',
			].join('\n'),
			'js'
		);
		expect(result).toEqual({
			names: ['directives', 'odd name', 'p', 'other'],
			stars: [],
			namespaces: [
				{ name: 'directives', specifier: './directives.ts' },
				{ name: 'odd name', specifier: './odd.js' },
			],
		});
	});

	test('reads only the module script of a svelte file', async () => {
		const code = [
			'<!-- <script module>export const commented = 1;</script> -->',
			'<script lang="ts" generics="T extends Record<string, unknown>">',
			'  export const instance = 1;',
			'</script>',
			'<script module lang="ts">',
			"  export { default as h2 } from './H2.svelte';",
			'  export type Level = 1 | 2;',
			'  export const pre: string = "x";',
			'</script>',
			'<style lang="scss">$x: 1; .a { b: $x }</style>',
			'<h1>{instance}</h1>',
		].join('\n');
		expect(await scan_exports(code, 'svelte')).toEqual(['h2', 'pre']);
	});

	test('takes context="module" and finds nothing without a module script', async () => {
		expect(
			await scan_exports(
				'<script context="module">export const a = 1;</script>',
				'svelte'
			)
		).toEqual(['a']);
		expect(
			await scan_exports(
				'<script>export const a = 1;</script><p>x</p>',
				'svelte'
			)
		).toEqual([]);
		expect(module_script('<p>no scripts</p>')).toBeNull();
	});
});

/** a vite app on disk inside the package, so svelte resolves from it */
function write_app(): string {
	const root = mkdtempSync(join(HERE, '.tmp-components-'));
	const files: Record<string, string> = {
		'package.json': JSON.stringify({
			name: 'app',
			private: true,
			type: 'module',
			imports: { '#lib/*': './src/lib/*' },
		}),
		'src/lib/markdown.ts': [
			"export { default as h1 } from './Heading.svelte';",
			'export type Unused = string;',
		].join('\n'),
		'src/lib/Heading.svelte': [
			'<script>',
			'  let { level, children, ...rest } = $props();',
			'</script>',
			'<h1 class="custom" data-level={level} {...rest}>{@render children()}</h1>',
		].join('\n'),
		'src/lib/Defaults.svelte': [
			'<script module lang="ts">',
			"  export { default as img } from './Image.svelte';",
			"  export { default as h1 } from './Ignored.svelte';",
			'</script>',
		].join('\n'),
		'src/lib/Image.svelte': [
			'<script>',
			'  let { src, alt } = $props();',
			'</script>',
			'<figure><img {src} {alt} /><figcaption>{alt}</figcaption></figure>',
		].join('\n'),
		'src/lib/Ignored.svelte': '<h1>never</h1>',
		'src/lib/Paragraph.svelte': [
			'<script>',
			'  let { children } = $props();',
			'</script>',
			'<p class="para">{@render children()}</p>',
		].join('\n'),
		'src/lib/all.ts': [
			"export { default as h2 } from './Heading.svelte';",
			"export { default as warning } from './Warning.svelte';",
			"export { default as input } from './Ignored.svelte';",
		].join('\n'),
		'src/lib/Warning.svelte': [
			'<script>',
			'  let { type, children } = $props();',
			'</script>',
			'<aside class="warning {type}">{@render children()}</aside>',
		].join('\n'),
		'src/all.svx': [
			'<script>',
			"  let v = $state('a');",
			'</script>',
			'',
			'<h2 id="raw">Raw</h2>',
			'',
			'<warning type="tip">',
			'',
			'*careful*',
			'',
			'</warning>',
			'',
			'<input bind:value={v}>',
			'',
		].join('\n'),
		'src/doc.svx': '# Title\n\n![cat](/cat.png)\n',
		'src/plain.svx': 'no replacement here\n',
	};
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

async function serve(root: string, main: Plugin[]): Promise<ViteDevServer> {
	return createServer({
		root,
		configFile: false,
		logLevel: 'silent',
		appType: 'custom',
		cacheDir: join(root, '.vite'),
		optimizeDeps: { noDiscovery: true, include: [] },
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

describe('components option', () => {
	let root: string;
	let server: ViteDevServer;
	let plugins: Plugin[];

	beforeAll(async () => {
		root = write_app();
		plugins = mdsvex({
			// the later module wins, but only for names it exports
			components: [
				new URL('./src/lib/Defaults.svelte', pathToFileURL(root + '/')),
				'#lib/markdown.ts',
			],
		});
		server = await serve(root, plugins);
	});

	afterAll(async () => {
		await server?.close();
		rmSync(root, { recursive: true, force: true });
	});

	test('maps each virtual id to the resolved file', async () => {
		const container = server.environments.client.pluginContainer;
		const first = await container.resolveId('mdsvex:components/0');
		const second = await container.resolveId('mdsvex:components/1');
		expect(first?.id).toBe(vite_path(root, 'src/lib/Defaults.svelte'));
		expect(second?.id).toBe(vite_path(root, 'src/lib/markdown.ts'));
	});

	test('compiles against the scanned names and imports virtual ids', async () => {
		await server.environments.ssr.pluginContainer.resolveId(
			'mdsvex:components'
		);
		const transform = plugins[0].transform as Function;
		const result = await transform.call(
			{ addWatchFile() {} },
			'# Title\n\n![cat](/cat.png)\n',
			vite_path(root, 'src/doc.svx')
		);
		expect(result.code).toContain(
			"import { h1 as H1_MDSVEX_G } from 'mdsvex:components/1';\n" +
				"import { img as Img_MDSVEX_G } from 'mdsvex:components/0';\n"
		);
		expect(result.code).not.toContain(root);
	});

	test('renders the replacements with their props', async () => {
		const html = await ssr(server, '/src/doc.svx');
		expect(html).toContain('<h1 class="custom" data-level="1">Title</h1>');
		expect(html).toContain(
			'<figure><img src="/cat.png" alt="cat"/><figcaption>cat</figcaption></figure>'
		);
		expect(await ssr(server, '/src/plain.svx')).toContain(
			'<p>no replacement here</p>'
		);
	});

	test('a changed export set recompiles the documents that used it', async () => {
		const ssr_env = server.environments.ssr;
		const client_env = server.environments.client;
		await ssr_env.transformRequest('/src/doc.svx');
		await client_env.transformRequest('/src/doc.svx');

		const file = vite_path(root, 'src/lib/markdown.ts');
		const code = [
			"export { default as h1 } from './Heading.svelte';",
			"export { default as p } from './Paragraph.svelte';",
		].join('\n');
		writeFileSync(file, code);
		// as the vite watcher does before it runs hot updates
		for (const env of [ssr_env, client_env]) env.moduleGraph.onFileChange(file);

		const hot = plugins[0].hotUpdate as Function;
		const update = (environment: unknown, timestamp: number) =>
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

		const in_ssr = await update(ssr_env, 1);
		const in_client = await update(client_env, 1);
		const doc = vite_path(root, 'src/doc.svx');
		expect(in_ssr.map((m: any) => m.file)).toContain(doc);
		expect(in_client.map((m: any) => m.file)).toContain(doc);
		for (const mod of ssr_env.moduleGraph.getModulesByFile(doc)!)
			expect(mod.transformResult).toBeNull();

		const html = await ssr(server, '/src/doc.svx');
		expect(html).toContain('<h1 class="custom" data-level="1">Title</h1>');
		expect(html).toContain('<p class="para">');

		expect(await update(ssr_env, 2)).toBeUndefined();
		const other = await hot.call(
			{ environment: ssr_env },
			{
				type: 'update',
				file: doc,
				timestamp: 3,
				modules: [],
				read: async () => '',
			}
		);
		expect(other).toBeUndefined();
	});
});

describe('component_mode all', () => {
	let root: string;
	let server: ViteDevServer;
	let plugins: Plugin[];

	beforeAll(async () => {
		root = write_app();
		plugins = mdsvex({ components: '#lib/all.ts', component_mode: 'all' });
		server = await serve(root, plugins);
	});

	afterAll(async () => {
		await server?.close();
		rmSync(root, { recursive: true, force: true });
	});

	test('renders typed elements as their replacements', async () => {
		const html = await ssr(server, '/src/all.svx');
		expect(html).toContain(
			'<h1 class="custom" data-level="2" id="raw">Raw</h1>'
		);
		expect(html).toContain(
			'<aside class="warning tip"><p><strong>careful</strong></p></aside>'
		);
		expect(html).toContain('<input value="a"/>');
	});

	test('warns about an element a directive keeps', async () => {
		await server.environments.ssr.pluginContainer.resolveId(
			'mdsvex:components'
		);
		const warned: unknown[][] = [];
		const transform = plugins[0].transform as Function;
		await transform.call(
			{ addWatchFile() {}, warn: (...args: unknown[]) => warned.push(args) },
			'text\n\n<input bind:value={v}>\n',
			vite_path(root, 'src/inline.svx')
		);
		expect(warned).toEqual([
			[
				"<input> stays an element, a component can't take bind:value",
				{ line: 3, column: 0 },
			],
		]);
	});
});

describe('components resolution failure', () => {
	test('names the specifier and the root once, when the server starts', async () => {
		const root = write_app();
		try {
			// buildStart resolves, so the server does not start
			const message = await serve(
				root,
				mdsvex({ components: ['#lib/missing.ts', './nope.ts'] })
			).then(
				async (server) => {
					await server.close();
					return 'started';
				},
				// under vitest reading the stack maps it through the sourceMappingURL template in main.ts and throws
				(e: Error) => e.message
			);
			expect(message).toBe(
				'[mdsvex] could not resolve the components module "#lib/missing.ts", "./nope.ts" ' +
					`from the vite root ${normalizePath(root)}`
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test('an unknown component_mode throws when the plugin is made', () => {
		expect(() => mdsvex({ component_mode: 'every' as any })).toThrow(
			/component_mode/
		);
	});
});

/** a components module whose directives namespace re-exports a second module */
function write_directives_app(markdown: string[]): string {
	const root = mkdtempSync(join(HERE, '.tmp-directives-'));
	const files: Record<string, string> = {
		'package.json': JSON.stringify({
			name: 'app',
			private: true,
			type: 'module',
			imports: { '#lib/*': './src/lib/*' },
		}),
		'src/lib/markdown.ts': markdown.join('\n'),
		'src/lib/directives/index.ts': [
			"export { default as Callout } from './Callout.svelte';",
			"export { default as abbr } from './Abbr.svelte';",
		].join('\n'),
		'src/lib/directives/Callout.svelte': [
			'<script>',
			'  let { kind, label, children } = $props();',
			'</script>',
			'<aside class={kind}><strong>{@render label?.()}</strong>{@render children?.()}</aside>',
		].join('\n'),
		'src/lib/directives/Abbr.svelte': [
			'<script>',
			'  let { title, children } = $props();',
			'</script>',
			'<abbr {title}>{@render children()}</abbr>',
		].join('\n'),
		'src/lib/directives/Toc.svelte': '<nav>toc</nav>',
		'src/lib/Paragraph.svelte': [
			'<script>',
			'  let { children } = $props();',
			'</script>',
			'<p class="para">{@render children()}</p>',
		].join('\n'),
		'src/doc.svx': [
			':::Callout[Heads up](kind=warn)',
			'Read :abbr[PFM](title="Penguin flavoured markdown").',
			':::',
			'',
		].join('\n'),
		'src/toc.svx': '::toc[]\n',
	};
	for (const [path, content] of Object.entries(files)) {
		mkdirSync(dirname(join(root, path)), { recursive: true });
		writeFileSync(join(root, path), content);
	}
	return root;
}

describe('directives namespace', () => {
	let root: string;
	let server: ViteDevServer;
	let plugins: Plugin[];

	beforeAll(async () => {
		root = write_directives_app([
			"export { default as p } from './Paragraph.svelte';",
			"export * as directives from './directives/index.ts';",
		]);
		plugins = mdsvex({ components: '#lib/markdown.ts' });
		server = await serve(root, plugins);
	});

	afterAll(async () => {
		await server?.close();
		rmSync(root, { recursive: true, force: true });
	});

	test('maps the directives id to the module the namespace re-exports', async () => {
		const container = server.environments.client.pluginContainer;
		expect((await container.resolveId('mdsvex:directives'))?.id).toBe(
			vite_path(root, 'src/lib/directives/index.ts')
		);
		expect((await container.resolveId('mdsvex:components'))?.id).toBe(
			vite_path(root, 'src/lib/markdown.ts')
		);
	});

	test('imports directives apart from elements, never the namespace name', async () => {
		await server.environments.ssr.pluginContainer.resolveId(
			'mdsvex:components'
		);
		const transform = plugins[0].transform as Function;
		const result = await transform.call(
			{ addWatchFile() {} },
			'directives :abbr[x]\n',
			vite_path(root, 'src/other.svx')
		);
		expect(result.code).toContain(
			"import { p as P_MDSVEX_G } from 'mdsvex:components';\n" +
				"import { abbr as Abbr_MDSVEX_D_G } from 'mdsvex:directives';\n"
		);
		expect(result.code).not.toContain('directives as');
	});

	test('renders args as props, the text as label and the body as children', async () => {
		const html = await ssr(server, '/src/doc.svx');
		expect(html).toBe(
			'<aside class="warn"><strong>Heads up</strong><p class="para">Read ' +
				'<abbr title="Penguin flavoured markdown">PFM</abbr>.</p></aside>'
		);
	});

	test('an unregistered directive fails the transform, naming it', async () => {
		await expect(
			server.environments.ssr.transformRequest('/src/toc.svx')
		).rejects.toThrow(/::toc at 1:1/);
	});

	test('a changed directives module recompiles the documents that used it', async () => {
		const ssr_env = server.environments.ssr;
		await ssr_env.transformRequest('/src/doc.svx');

		const file = vite_path(root, 'src/lib/directives/index.ts');
		const code = [
			"export { default as Callout } from './Callout.svelte';",
			"export { default as abbr } from './Abbr.svelte';",
			"export { default as toc } from './Toc.svelte';",
		].join('\n');
		writeFileSync(file, code);
		ssr_env.moduleGraph.onFileChange(file);

		const hot = plugins[0].hotUpdate as Function;
		const result = await hot.call(
			{ environment: ssr_env },
			{
				type: 'update',
				file,
				timestamp: 1,
				modules: [],
				read: async () => code,
				server,
			}
		);
		expect(result.map((m: any) => m.file)).toContain(
			vite_path(root, 'src/doc.svx')
		);
		expect(await ssr(server, '/src/toc.svx')).toBe('<nav>toc</nav>');
	});

	test('moving the namespace to another module resolves it again in every environment', async () => {
		const ssr_env = server.environments.ssr;
		const client_env = server.environments.client;
		await ssr_env.transformRequest('/src/doc.svx');
		await client_env.transformRequest('/src/doc.svx');

		writeFileSync(
			join(root, 'src/lib/more.ts'),
			"export { default as Callout } from './directives/Toc.svelte';\n" +
				"export { default as abbr } from './directives/Abbr.svelte';"
		);
		const file = vite_path(root, 'src/lib/markdown.ts');
		const code = [
			"export { default as p } from './Paragraph.svelte';",
			"export * as directives from './more.ts';",
		].join('\n');
		writeFileSync(file, code);
		for (const env of [ssr_env, client_env]) env.moduleGraph.onFileChange(file);

		const hot = plugins[0].hotUpdate as Function;
		const update = (environment: unknown) =>
			hot.call(
				{ environment },
				{
					type: 'update',
					file,
					timestamp: 2,
					modules: [],
					read: async () => code,
					server,
				}
			);
		const doc = vite_path(root, 'src/doc.svx');
		expect((await update(ssr_env)).map((m: any) => m.file)).toContain(doc);
		expect((await update(client_env)).map((m: any) => m.file)).toContain(doc);

		expect(await ssr(server, '/src/doc.svx')).toBe('<nav>toc</nav>');
		expect(
			(await client_env.pluginContainer.resolveId('mdsvex:directives'))?.id
		).toBe(vite_path(root, 'src/lib/more.ts'));
	});
});

describe('directives namespace errors', () => {
	async function start_error(markdown: string[]): Promise<string> {
		const root = write_directives_app(markdown);
		try {
			return await serve(root, mdsvex({ components: '#lib/markdown.ts' })).then(
				async (server) => {
					await server.close();
					return 'started';
				},
				(e: Error) => e.message.replace(normalizePath(root), '<root>')
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	}

	test('a directives export that is not a namespace re-export', async () => {
		const message = await start_error([
			"import Callout from './directives/Callout.svelte';",
			'export const directives = { Callout };',
		]);
		expect(message).toBe(
			'[mdsvex] <root>/src/lib/markdown.ts exports directives, which must be a ' +
				'namespace re-export so its names can be read without running it: ' +
				"export * as directives from './directives.ts'"
		);
	});

	test('a directives module that does not resolve', async () => {
		const message = await start_error([
			"export * as directives from './missing.ts';",
		]);
		expect(message).toBe(
			'[mdsvex] could not resolve the directives module "./missing.ts" ' +
				'from <root>/src/lib/markdown.ts'
		);
	});
});
