import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { svelte } from '@sveltejs/vite-plugin-svelte';
import { createServer, createServerModuleRunner, normalizePath } from 'vite';
import type { Plugin, ViteDevServer } from 'vite';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';

import { MANIFEST_PATH, mdsvex } from '../src/main';
import type { Bundle, MdsvexManifest } from '../src/main';

const HERE = dirname(fileURLToPath(import.meta.url));

/** the steps plugin as a package would ship it, its module resolves from the vite root */
function steps(): Bundle {
	return {
		name: 'steps',
		module: '#lib/steps/index.js',
		directives: {
			steps: {
				static: true,
				children: {
					heading(node, ctx) {
						ctx.state.step?.close();
						ctx.state.step = node.wrap_from('directive_container', {
							name: 'step',
							args: { number: String(ctx.index + 1) },
						});
						node.wrap_from('directive_label').close();
					},
				},
			},
			step: { static: true },
		},
		components: { specifier: '#lib/steps/elements.js', names: ['hr'] },
	};
}

const SVX = [
	':::steps[]',
	'',
	'## Install',
	'',
	'Run the *installer*.',
	'',
	'---',
	'',
	'## Configure',
	'',
	'Set it up.',
	':::',
	'',
].join('\n');

/** a vite app on disk inside the package, so svelte resolves from it */
function write_app(extra: Record<string, string> = {}): string {
	const root = mkdtempSync(join(HERE, '.tmp-plugins-'));
	const files: Record<string, string> = {
		'package.json': JSON.stringify({
			name: 'app',
			private: true,
			type: 'module',
			imports: { '#lib/*': './src/lib/*' },
		}),
		'src/lib/steps/index.js': [
			"export { default as steps } from './Steps.svelte';",
			"export { default as step } from './Step.svelte';",
		].join('\n'),
		'src/lib/steps/elements.js':
			"export { default as hr } from './Rule.svelte';",
		'src/lib/steps/Steps.svelte': [
			'<script>',
			'  let { children } = $props();',
			'</script>',
			'<ol class="steps">{@render children()}</ol>',
		].join('\n'),
		'src/lib/steps/Step.svelte': [
			'<script>',
			'  let { number, label, children } = $props();',
			'</script>',
			'<li data-step={number}>{@render label()}{@render children?.()}</li>',
		].join('\n'),
		'src/lib/steps/Rule.svelte': '<hr class="rule" />',
		'src/lib/MyStep.svelte': [
			'<script>',
			'  let { number, label, children } = $props();',
			'</script>',
			'<section class="mine" data-step={number}>{@render label()}{@render children?.()}</section>',
		].join('\n'),
		'src/lib/markdown.js': "export * as directives from './directives.js';",
		'src/lib/directives.js':
			"export { default as step } from './MyStep.svelte';",
		'src/doc.svx': SVX,
		...extra,
	};
	for (const [path, content] of Object.entries(files)) {
		mkdirSync(dirname(join(root, path)), { recursive: true });
		writeFileSync(join(root, path), content);
	}
	return root;
}

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

async function manifest_of(root: string): Promise<MdsvexManifest> {
	const file = join(root, MANIFEST_PATH);
	return vi.waitFor(() => JSON.parse(readFileSync(file, 'utf8')), {
		timeout: 2000,
	});
}

describe('plugins option', () => {
	let root: string;
	let server: ViteDevServer;
	let plugins: Plugin[];

	beforeAll(async () => {
		root = write_app();
		plugins = mdsvex({ plugins: [steps()] });
		server = await serve(root, plugins);
	});

	afterAll(async () => {
		await server?.close();
		rmSync(root, { recursive: true, force: true });
	});

	test('maps each virtual id to the module the plugin names', async () => {
		const container = server.environments.client.pluginContainer;
		expect((await container.resolveId('mdsvex:plugin/0'))?.id).toBe(
			vite_path(root, 'src/lib/steps/index.js')
		);
		expect((await container.resolveId('mdsvex:plugin-components/0'))?.id).toBe(
			vite_path(root, 'src/lib/steps/elements.js')
		);
	});

	test('documents import virtual ids, never a path', async () => {
		const transform = plugins[0].transform as Function;
		const result = await transform.call(
			{ addWatchFile() {} },
			SVX,
			vite_path(root, 'src/other.svx')
		);
		expect(result.code).toContain(
			"import { steps as Steps_MDSVEX_D_G, step as Step_MDSVEX_D_G } from 'mdsvex:plugin/0';\n" +
				"import { hr as Hr_MDSVEX_G } from 'mdsvex:plugin-components/0';\n"
		);
		expect(result.code).not.toContain(root);
	});

	test('the components import and render, on the server and for the client', async () => {
		expect(await ssr(server, '/src/doc.svx')).toBe(
			'<ol class="steps">' +
				'<li data-step="1"><h2>Install</h2><p>Run the <strong>installer</strong>.</p><hr class="rule"/></li>' +
				'<li data-step="2"><h2>Configure</h2><p>Set it up.</p></li>' +
				'</ol>'
		);
		const client =
			await server.environments.client.transformRequest('/src/doc.svx');
		// vite resolved the virtual ids to the files of the plugin
		expect(client?.code).toContain(
			'import { steps as Steps_MDSVEX_D_G, step as Step_MDSVEX_D_G } from "/src/lib/steps/index.js";'
		);
		expect(client?.code).toContain(
			'import { hr as Hr_MDSVEX_G } from "/src/lib/steps/elements.js";'
		);
	});

	test('the manifest lists the plugin with its resolved modules', async () => {
		const manifest = await manifest_of(root);
		expect(manifest.version).toBe(1);
		expect(manifest.plugins).toEqual([
			{
				name: 'steps',
				directives: {
					id: 'mdsvex:plugin/0',
					file: vite_path(root, 'src/lib/steps/index.js'),
					names: ['steps', 'step'],
				},
				components: {
					id: 'mdsvex:plugin-components/0',
					file: vite_path(root, 'src/lib/steps/elements.js'),
					names: ['hr'],
				},
			},
		]);
		expect(manifest.directives).toEqual([]);
		// bound handlers only reach directives that have a component
		expect(manifest.directive_plugins).toBe(false);
	});
});

describe('plugins option with a components module', () => {
	let root: string;
	let server: ViteDevServer;

	beforeAll(async () => {
		root = write_app();
		server = await serve(
			root,
			mdsvex({ plugins: [steps()], components: '#lib/markdown.js' })
		);
	});

	afterAll(async () => {
		await server?.close();
		rmSync(root, { recursive: true, force: true });
	});

	test('an export of the same name replaces the component, the handlers still run', async () => {
		expect(await ssr(server, '/src/doc.svx')).toBe(
			'<ol class="steps">' +
				'<section class="mine" data-step="1"><h2>Install</h2><p>Run the <strong>installer</strong>.</p><hr class="rule"/></section>' +
				'<section class="mine" data-step="2"><h2>Configure</h2><p>Set it up.</p></section>' +
				'</ol>'
		);
	});

	test('the manifest keeps the plugin apart from the directives modules', async () => {
		const manifest = await manifest_of(root);
		expect(manifest.plugins?.[0].directives?.names).toEqual(['steps', 'step']);
		expect(manifest.directives).toEqual([
			{
				id: 'mdsvex:directives',
				file: vite_path(root, 'src/lib/directives.js'),
				names: ['step'],
			},
		]);
	});
});

describe('plugins option errors', () => {
	test('a module that does not resolve is named once, when the server starts', async () => {
		const root = write_app();
		const missing = steps();
		missing.module = '#lib/nowhere.js';
		try {
			// buildStart resolves, so the server does not start
			const message = await serve(root, mdsvex({ plugins: [missing] })).then(
				async (server) => {
					await server.close();
					return 'started';
				},
				(e: Error) => e.message
			);
			expect(message).toBe(
				'[mdsvex] could not resolve the module "#lib/nowhere.js" of plugin steps ' +
					`from the vite root ${normalizePath(root)}`
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test('a malformed plugins option throws when the plugin is made', () => {
		expect(() => mdsvex({ plugins: steps() as any })).toThrow(
			'[mdsvex] plugins must be an array of plugins'
		);
		// the function was passed, not what it returns
		expect(() => mdsvex({ plugins: [steps as any] })).toThrow(
			'[mdsvex] plugins[0] must be an object, call the plugin'
		);
		const no_module = steps();
		delete no_module.module;
		expect(() => mdsvex({ plugins: [no_module] })).toThrow(
			'[mdsvex] plugins[0] (steps) needs a module'
		);
	});

	test('a plugin with a document wide directive handler tells the editor', async () => {
		const root = write_app();
		const loose = steps();
		loose.parse = { directive_leaf: { parse() {} } };
		const server = await serve(root, mdsvex({ plugins: [loose] }));
		try {
			await server.environments.ssr.transformRequest('/src/doc.svx');
			expect((await manifest_of(root)).directive_plugins).toBe(true);
		} finally {
			await server.close();
			rmSync(root, { recursive: true, force: true });
		}
	});
});
