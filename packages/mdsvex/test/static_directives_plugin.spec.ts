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
import type { MdsvexManifest, MdsvexOptions } from '../src/main';
import { is_static_file } from '../src/static_directives';

const HERE = dirname(fileURLToPath(import.meta.url));

const CALLOUT = [
	'<script>',
	'  let { kind, label, children } = $props();',
	'</script>',
	'<aside class={kind}><strong>{@render label?.()}</strong>{@render children?.()}</aside>',
].join('\n');

const BADGE = [
	'<script>',
	'  let { children } = $props();',
	'</script>',
	'<span class="badge">{@render children()}</span>',
].join('\n');

const BARREL = [
	"import './directives.css';",
	"export { default as callout } from './Callout.static.svelte';",
	"export { default as badge } from './Badge.svelte';",
].join('\n');

/** a site whose directives barrel registers one static and one live directive */
function write_app(more: Record<string, string> = {}): string {
	const root = mkdtempSync(join(HERE, '.tmp-static-'));
	const files: Record<string, string> = {
		'package.json': JSON.stringify({
			name: 'app',
			private: true,
			type: 'module',
			imports: { '#lib/*': './src/lib/*' },
		}),
		'src/lib/markdown.ts':
			"export * as directives from './directives/index.ts';",
		'src/lib/directives/index.ts': BARREL,
		'src/lib/directives/directives.css': '.badge { color: red; }',
		'src/lib/directives/Callout.static.svelte': CALLOUT,
		'src/lib/directives/Badge.svelte': BADGE,
		'src/lib/directives/Note.svelte': BADGE,
		'src/lib/templates/Post.svelte': [
			'<script module>',
			"  export * as directives from './post_directives.ts';",
			'</script>',
			'<script>',
			'  let { children } = $props();',
			'</script>',
			'<article>{@render children()}</article>',
		].join('\n'),
		'src/lib/templates/post_directives.ts':
			"export { default as note } from './Note.static.svelte';",
		'src/lib/templates/Note.static.svelte': BADGE,
		'src/doc.svx': [
			':::callout[Heads up](kind=warn)',
			'Read :badge[this].',
			':::',
			'',
		].join('\n'),
		'src/post.svx': '---\ntemplate: post\n---\n\nA :note[pin].\n',
		...more,
	};
	for (const [path, content] of Object.entries(files)) {
		mkdirSync(dirname(join(root, path)), { recursive: true });
		writeFileSync(join(root, path), content);
	}
	return root;
}

const OPTIONS: MdsvexOptions = {
	components: '#lib/markdown.ts',
	templates: { post: '#lib/templates/Post.svelte' },
};

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
		const { render } = await runner.import('svelte/server');
		const mod = await runner.import(url);
		return render(mod.default).body.replace(/<!--[^]*?-->/g, '');
	} finally {
		await runner.close();
	}
}

describe('is_static_file', () => {
	test('a component named <name>.static.<ext>', () => {
		expect(is_static_file('/a/Callout.static.svelte')).toBe(true);
		expect(is_static_file('/a/Note.static.svx')).toBe(true);
		expect(is_static_file('/a/Callout.svelte')).toBe(false);
		expect(is_static_file('/a/static/Callout.svelte')).toBe(false);
		expect(is_static_file('/a/Callout.static')).toBe(false);
		expect(is_static_file('/a/x.static.y.svelte')).toBe(false);
	});
});

describe('static directives', () => {
	let root: string;
	let server: ViteDevServer;
	let plugins: Plugin[];
	const manifest = (): MdsvexManifest =>
		JSON.parse(readFileSync(join(root, MANIFEST_PATH), 'utf8'));

	beforeAll(async () => {
		root = write_app();
		plugins = mdsvex(OPTIONS);
		server = await serve(root, plugins);
	});

	afterAll(async () => {
		await server?.close();
		rmSync(root, { recursive: true, force: true });
	});

	test('the manifest names the static directives of each module', async () => {
		await ssr(server, '/src/doc.svx');
		await ssr(server, '/src/post.svx');
		await vi.waitFor(() => {
			expect(manifest().directives).toEqual([
				{
					id: 'mdsvex:directives',
					file: vite_path(root, 'src/lib/directives/index.ts'),
					names: ['callout', 'badge'],
					static: ['callout'],
				},
			]);
			expect(manifest().templates.post.directives).toEqual([
				{
					id: expect.stringMatching(/^mdsvex:template-directives\/post/),
					file: vite_path(root, 'src/lib/templates/post_directives.ts'),
					names: ['note'],
					static: ['note'],
				},
			]);
		});
	});

	test('a static directive renders as its shell and imports no component', async () => {
		// the svelte mdsvex hands on, before the ssr transform rewrites imports
		const transform = plugins[0].transform as Function;
		const ctx = { addWatchFile() {}, warn() {} };
		const doc = await transform.call(
			ctx,
			readFileSync(join(root, 'src/doc.svx'), 'utf8'),
			vite_path(root, 'src/doc.svx')
		);
		expect(doc.code).toContain(
			"<script>\nimport { badge as Badge_MDSVEX_D_G } from 'mdsvex:directives';\n</script>" +
				'<aside class="warn"><strong>Heads up</strong><p>Read <Badge_MDSVEX_D_G>this</Badge_MDSVEX_D_G>.</p></aside>'
		);
		const post = await transform.call(
			ctx,
			readFileSync(join(root, 'src/post.svx'), 'utf8'),
			vite_path(root, 'src/post.svx')
		);
		expect(post.code).not.toMatch(/note as/);
		expect(post.code).toContain('A <span class="badge">pin</span>.');
	});

	test('the shells render the html the live components would', async () => {
		expect(await ssr(server, '/src/doc.svx')).toBe(
			'<aside class="warn"><strong>Heads up</strong><p>Read ' +
				'<span class="badge">this</span>.</p></aside>'
		);
		expect(await ssr(server, '/src/post.svx')).toBe(
			'<article><p>A <span class="badge">pin</span>.</p></article>'
		);
	});

	test('an edit of a static component renders its shells again', async () => {
		const ssr_env = server.environments.ssr;
		await ssr_env.transformRequest('/src/doc.svx');
		const file = vite_path(root, 'src/lib/directives/Callout.static.svelte');
		writeFileSync(
			file,
			CALLOUT.replace('class={kind}', 'class="callout {kind}"')
		);
		ssr_env.moduleGraph.onFileChange(file);
		const hot = plugins[0].hotUpdate as Function;
		const update = async (environment: unknown) => {
			const options = {
				type: 'update',
				file,
				timestamp: 5,
				modules: [] as any[],
				read: async () => '',
				server,
			};
			// nothing returned keeps update.modules, which the documents joined
			return (await hot.call({ environment }, options)) ?? options.modules;
		};
		const result = await update(ssr_env);
		expect(result.map((m: any) => m.file)).toContain(
			vite_path(root, 'src/doc.svx')
		);
		// the static environment asks too, and gets no module back
		expect(await update(server.environments.mdsvex_static)).toEqual([]);
		expect(await ssr(server, '/src/doc.svx')).toContain(
			'<aside class="callout warn">'
		);
	});

	test('moving a re-export to a .static. file recompiles the documents that used it', async () => {
		const ssr_env = server.environments.ssr;
		await ssr_env.transformRequest('/src/doc.svx');
		writeFileSync(join(root, 'src/lib/directives/Badge.static.svelte'), BADGE);
		const file = vite_path(root, 'src/lib/directives/index.ts');
		const code = BARREL.replace("'./Badge.svelte'", "'./Badge.static.svelte'");
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
		await ssr(server, '/src/doc.svx');
		await vi.waitFor(() => {
			expect(manifest().directives[0].static).toEqual(['callout', 'badge']);
		});
	});
});

describe('static directive registration errors', () => {
	async function start_error(barrel: string): Promise<string> {
		const root = write_app({ 'src/lib/directives/index.ts': barrel });
		let server: ViteDevServer | undefined;
		try {
			// a registration error stops the server at start, as every one does
			server = await serve(root, mdsvex(OPTIONS));
			await server.environments.ssr.transformRequest('/src/doc.svx');
			return 'compiled';
		} catch (e) {
			return (e as Error).message.split(normalizePath(root)).join('<root>');
		} finally {
			await server?.close();
			rmSync(root, { recursive: true, force: true });
		}
	}

	test('importing a static component and exporting the binding', async () => {
		const message = await start_error(
			[
				"import Callout from './Callout.static.svelte';",
				'export { Callout as callout };',
			].join('\n')
		);
		expect(message).toContain(
			'[mdsvex] <root>/src/lib/directives/index.ts imports the static component ' +
				'"./Callout.static.svelte". register a static directive as ' +
				'export { default as name } from "./Callout.static.svelte"'
		);
	});

	test('a named export of a static component', async () => {
		const message = await start_error(
			"export { kind as callout } from './Callout.static.svelte';"
		);
		expect(message).toContain(
			're-exports "kind" of the static component "./Callout.static.svelte", ' +
				'a static directive is the default export of its file: ' +
				'export { default as callout } from "./Callout.static.svelte"'
		);
	});

	test('export * from a static component', async () => {
		const message = await start_error(
			"export * from './Callout.static.svelte';"
		);
		expect(message).toContain(
			're-exports with export * from the static component "./Callout.static.svelte"'
		);
	});

	test('a static component with a handler fails the check at start', async () => {
		const root = write_app({
			'src/lib/directives/Callout.static.svelte':
				'<script>let { label, children } = $props();</script>' +
				'<aside onclick={() => {}}>{@render label()}{@render children()}</aside>',
		});
		let message = 'compiled';
		try {
			const server = await serve(root, mdsvex(OPTIONS));
			await server.close();
		} catch (e) {
			message = (e as Error).message.split(normalizePath(root)).join('<root>');
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
		expect(message).toBe(
			'[mdsvex] the static component <root>/src/lib/directives/Callout.static.svelte ' +
				'uses what never runs in static output:\n' +
				'  onclick at <root>/src/lib/directives/Callout.static.svelte:1:60\n' +
				'a static directive renders once at build time and ships no code, ' +
				'rename the file without .static to render it live'
		);
	});

	test('a live component compiles as before', async () => {
		expect(
			await start_error(
				[
					"export { default as callout } from './Badge.svelte';",
					"export { default as badge } from './Badge.svelte';",
				].join('\n')
			)
		).toBe('compiled');
	});
});

describe('static directive render errors', () => {
	async function transform_error(callout: string): Promise<string> {
		const root = write_app({
			'src/lib/directives/Callout.static.svelte': callout,
		});
		const server = await serve(root, mdsvex(OPTIONS));
		try {
			await server.environments.ssr.transformRequest('/src/doc.svx');
			return 'compiled';
		} catch (e) {
			return (e as Error).message.split(normalizePath(root)).join('<root>');
		} finally {
			await server.close();
			rmSync(root, { recursive: true, force: true });
		}
	}

	test('a component that leaves out a snippet it is given', async () => {
		expect(
			await transform_error(
				'<script>let { label } = $props();</script><aside>{@render label()}</aside>'
			)
		).toContain(
			'[mdsvex] the static directive callout at <root>/src/doc.svx:1:1 is given children but its component never renders it'
		);
	});

	test('a component that throws names the directive', async () => {
		expect(
			await transform_error("<script>throw new Error('boom');</script>")
		).toContain(
			'[mdsvex] the static directive callout at <root>/src/doc.svx:1:1 failed to render at build time: boom'
		);
	});

	test('a component with svelte:head content', async () => {
		expect(
			await transform_error(
				'<script>let { label, children } = $props();</script><svelte:head><title>x</title></svelte:head>{@render label()}{@render children()}'
			)
		).toContain('renders <svelte:head> content');
	});
});

describe('static directive styles, assets and the live barrel', () => {
	let root: string;
	let server: ViteDevServer;
	let plugins: Plugin[];
	const STYLED = [
		'<script>',
		"  import './callout.css';",
		"  import logo from './logo.svg';",
		'  let { kind, label, children } = $props();',
		'</script>',
		'<aside class={kind}><img src={logo} alt="" /><strong>{@render label?.()}</strong>{@render children?.()}</aside>',
		'<style>',
		'  aside { border-left: 4px solid red; }',
		'</style>',
	].join('\n');

	beforeAll(async () => {
		root = write_app({
			'src/lib/directives/Callout.static.svelte': STYLED,
			'src/lib/directives/callout.css': '.warn { color: orange; }',
			// large enough that vite would not inline it as data
			'src/lib/directives/logo.svg':
				'<svg xmlns="http://www.w3.org/2000/svg"><!--' +
				'x'.repeat(6000) +
				'--></svg>',
			'src/only.svx': ':::callout[Hi](kind=warn)\nbody\n:::\n',
		});
		plugins = mdsvex(OPTIONS);
		server = await serve(root, plugins);
	});

	afterAll(async () => {
		await server?.close();
		rmSync(root, { recursive: true, force: true });
	});

	async function svelte_of(path: string): Promise<string> {
		const transform = plugins[0].transform as Function;
		const result = await transform.call(
			{ addWatchFile() {}, warn() {} },
			readFileSync(join(root, path), 'utf8'),
			vite_path(root, path)
		);
		return result.code;
	}

	test('the document imports the styles and the asset of the component', async () => {
		const code = await svelte_of('src/only.svx');
		const dir = vite_path(root, 'src/lib/directives');
		expect(code).toBe(
			'<script>\n' +
				"import 'mdsvex:directives';\n" +
				// the order live code imports them in, vite-plugin-svelte puts the scoped styles first
				`import "${dir}/Callout.static.svelte.mdsvex-static.css";\n` +
				`import "${dir}/callout.css";\n` +
				`import __mdsvex_asset_0 from "${dir}/logo.svg";\n` +
				'</script><aside class="warn svelte-' +
				code.split('svelte-')[1].split('"')[0] +
				'"><img src="{__mdsvex_asset_0}" alt=""/><strong>Hi</strong><p>body</p></aside>'
		);
	});

	test('the server render gives the url the asset has in dev', async () => {
		expect(await ssr(server, '/src/only.svx')).toContain(
			'<img src="/src/lib/directives/logo.svg" alt=""/>'
		);
	});

	test('the client gets the scoped css of the component from mdsvex', async () => {
		await ssr(server, '/src/only.svx');
		const id =
			vite_path(root, 'src/lib/directives/Callout.static.svelte') +
			'.mdsvex-static.css';
		const css = await server.environments.client.transformRequest(id);
		expect(css?.code).toMatch(
			/aside\.svelte-[\w-]+ \{[^}]*border-left: 4px solid red/
		);
	});

	test('an edit of the style of a static component updates its css module', async () => {
		const client = server.environments.client;
		await ssr(server, '/src/only.svx');
		const file = vite_path(root, 'src/lib/directives/Callout.static.svelte');
		const css_id = file + '.mdsvex-static.css';
		await client.transformRequest(css_id);
		writeFileSync(file, STYLED.replace('solid red', 'solid blue'));
		for (const env of Object.values(server.environments))
			env.moduleGraph.onFileChange(file);
		const hot = plugins[0].hotUpdate as Function;
		const options = {
			type: 'update',
			file,
			timestamp: 9,
			modules: [] as any[],
			read: async () => '',
			server,
		};
		const result =
			(await hot.call({ environment: client }, options)) ?? options.modules;
		expect(result.map((m: any) => m.id)).toContain(css_id);
		const css = await client.transformRequest(css_id);
		expect(css?.code).toContain('solid blue');
	});

	test('client and server load the barrel without its static re-exports', async () => {
		const barrel = vite_path(root, 'src/lib/directives/index.ts');
		for (const env of [server.environments.client, server.environments.ssr]) {
			expect(
				(await env.pluginContainer.resolveId('mdsvex:directives'))?.id
			).toBe(barrel + '?mdsvex-live');
		}
		const live = await server.environments.client.transformRequest(
			barrel + '?mdsvex-live'
		);
		expect(live?.code).not.toContain('Callout.static.svelte');
		expect(live?.code).toContain('Badge.svelte');
		expect(live?.code).toContain('directives.css');
		// the static environment renders through the whole barrel
		expect(
			(
				await server.environments.mdsvex_static.pluginContainer.resolveId(
					'mdsvex:directives'
				)
			)?.id
		).toBe(barrel);
		// and a page that imports the barrel itself gets all of it
		const whole = await server.environments.client.transformRequest(barrel);
		expect(whole?.code).toContain('Callout.static.svelte');
	});
});

describe('the check of a static component on edit', () => {
	test('a handler added in dev fails the document, removing it renders again', async () => {
		const root = write_app();
		const plugins = mdsvex(OPTIONS);
		const server = await serve(root, plugins);
		const ssr_env = server.environments.ssr;
		const file = vite_path(root, 'src/lib/directives/Callout.static.svelte');
		const hot = plugins[0].hotUpdate as Function;
		const edit = async (code: string, timestamp: number) => {
			writeFileSync(file, code);
			ssr_env.moduleGraph.onFileChange(file);
			await hot.call(
				{ environment: server.environments.mdsvex_static },
				{
					type: 'update',
					file,
					timestamp,
					modules: [],
					read: async () => code,
					server,
				}
			);
			const doc = ssr_env.moduleGraph.getModuleById(
				vite_path(root, 'src/doc.svx')
			);
			if (doc) ssr_env.moduleGraph.invalidateModule(doc);
		};
		try {
			await ssr_env.transformRequest('/src/doc.svx');
			await edit(
				CALLOUT.replace(
					'<aside class={kind}>',
					'<aside class={kind} onclick={() => {}}>'
				),
				7
			);
			const message = await ssr_env.transformRequest('/src/doc.svx').then(
				() => 'compiled',
				(e: Error) => e.message.split(normalizePath(root)).join('<root>')
			);
			expect(message).toContain(
				'[mdsvex] the static directive callout at <root>/src/doc.svx:1:1 can not render: ' +
					'the static component <root>/src/lib/directives/Callout.static.svelte ' +
					'uses what never runs in static output:\n  onclick at '
			);
			await edit(CALLOUT, 8);
			expect(await ssr(server, '/src/doc.svx')).toContain(
				'<aside class="warn">'
			);
		} finally {
			await server.close();
			rmSync(root, { recursive: true, force: true });
		}
	});
});

describe('static directives of a plugin', () => {
	let root: string;
	let server: ViteDevServer;
	let plugins: Plugin[];

	beforeAll(async () => {
		root = write_app({
			'src/lib/steps/index.js': [
				"export { default as steps } from './Steps.static.svelte';",
				"export { default as step } from './Step.svelte';",
			].join('\n'),
			'src/lib/steps/Steps.static.svelte': [
				'<script>',
				'  let { children } = $props();',
				'</script>',
				'<ol class="steps">{@render children()}</ol>',
			].join('\n'),
			'src/lib/steps/Step.svelte': BADGE,
			'src/steps.svx': '::::steps\n:::step\nOne\n:::\n::::\n',
		});
		// a plugin and nothing else, no directives barrel and no template
		plugins = mdsvex({
			plugins: [
				{
					name: 'steps',
					module: '#lib/steps/index.js',
					directives: { steps: {}, step: {} },
				},
			],
		});
		server = await serve(root, plugins);
	});

	afterAll(async () => {
		await server?.close();
		rmSync(root, { recursive: true, force: true });
	});

	test('a .static. component of its module renders as a shell', async () => {
		const transform = plugins[0].transform as Function;
		const doc = await transform.call(
			{ addWatchFile() {}, warn() {} },
			readFileSync(join(root, 'src/steps.svx'), 'utf8'),
			vite_path(root, 'src/steps.svx')
		);
		expect(doc.code).not.toMatch(/steps as/);
		expect(doc.code).toMatch(
			/import \{ step as \w+ \} from 'mdsvex:plugin\/0';/
		);
		expect(doc.code).toContain('<ol class="steps">');
		expect(await ssr(server, '/src/steps.svx')).toBe(
			'<ol class="steps"><span class="badge"><p>One</p></span></ol>'
		);
	});

	test('the manifest names its static directives', async () => {
		await vi.waitFor(() => {
			const manifest: MdsvexManifest = JSON.parse(
				readFileSync(join(root, MANIFEST_PATH), 'utf8')
			);
			expect(manifest.plugins?.[0].directives).toEqual({
				id: 'mdsvex:plugin/0',
				file: vite_path(root, 'src/lib/steps/index.js'),
				names: ['steps', 'step'],
				static: ['steps'],
			});
		});
	});

	test('client and server load its module without the static re-export', async () => {
		const module = vite_path(root, 'src/lib/steps/index.js');
		for (const env of [server.environments.client, server.environments.ssr]) {
			expect((await env.pluginContainer.resolveId('mdsvex:plugin/0'))?.id).toBe(
				module + '?mdsvex-live'
			);
		}
		const live = await server.environments.client.transformRequest(
			module + '?mdsvex-live'
		);
		expect(live?.code).not.toContain('Steps.static.svelte');
		expect(live?.code).toContain('Step.svelte');
	});
});
