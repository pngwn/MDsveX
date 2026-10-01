import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { svelte } from '@sveltejs/vite-plugin-svelte';
import { createServer, createServerModuleRunner } from 'vite';
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
		expect(result).toEqual({ names: ['p'], stars: ['./md.js'] });
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
		'src/doc.svx': '# Title\n\n![cat](/cat.png)\n',
		'src/plain.svx': 'no replacement here\n',
	};
	for (const [path, content] of Object.entries(files)) {
		mkdirSync(dirname(join(root, path)), { recursive: true });
		writeFileSync(join(root, path), content);
	}
	return root;
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
		expect(first?.id).toBe(join(root, 'src/lib/Defaults.svelte'));
		expect(second?.id).toBe(join(root, 'src/lib/markdown.ts'));
	});

	test('compiles against the scanned names and imports virtual ids', async () => {
		await server.environments.ssr.pluginContainer.resolveId(
			'mdsvex:components'
		);
		const transform = plugins[0].transform as Function;
		const result = await transform.call(
			{ addWatchFile() {} },
			'# Title\n\n![cat](/cat.png)\n',
			join(root, 'src/doc.svx')
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

		const file = join(root, 'src/lib/markdown.ts');
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
		const doc = join(root, 'src/doc.svx');
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
					`from the vite root ${root}`
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
