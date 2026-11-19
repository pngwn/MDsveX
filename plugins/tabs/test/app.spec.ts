import { rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { tabs } from '@mdsvex/plugin-tabs';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { mdsvex } from 'mdsvex';
import { createServer, createServerModuleRunner, normalizePath } from 'vite';
import type { Plugin, ViteDevServer } from 'vite';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { write_app } from '../../test/app';

const HERE = dirname(fileURLToPath(import.meta.url));
const PACKAGE = dirname(HERE);

const DOC = [
	':::tabs[Pick *one*](group=os)',
	'## macOS',
	'',
	'Run the *installer*.',
	'',
	'## Windows `x64`',
	'',
	'Run setup.',
	':::',
	'',
].join('\n');

const GROUP = [
	':::tabs',
	'```sh [npm]',
	'npm i',
	'```',
	'',
	'```sh',
	'pnpm i',
	'```',
	':::',
	'',
].join('\n');

const NESTED = [
	'::::tabs',
	'Before.',
	'',
	'## Outer',
	'',
	':::tabs',
	'### Inner',
	'',
	'deep',
	':::',
	'::::',
	'',
	':::tab[Alone]',
	'outside',
	':::',
	'',
].join('\n');

const FILES = {
	'src/doc.svx': DOC,
	'src/group.svx': GROUP,
	'src/nested.svx': NESTED,
	'src/lib/markdown.js': "export * as directives from './directives.js';",
	'src/lib/directives.js': "export { default as tab } from './MyTab.svelte';",
	'src/lib/MyTab.svelte': [
		'<script>',
		'  let { label, children, title, index } = $props();',
		'</script>',
		'<section class="mine" data-index={index}><header>{@render label?.()}{title}</header>{@render children?.()}</section>',
	].join('\n'),
};

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

/**
 * server render in a fresh runner, so no module evaluated before is reused,
 * the ids of a component are numbered from s1 in each render
 */
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

/** the package as installed, a copy of what it publishes */
function installed(root: string, file: string): string {
	return normalizePath(
		join(root, 'node_modules/@mdsvex/plugin-tabs/dist', file)
	);
}

function button(id: string, index: number, selected: boolean, label: string) {
	return (
		`<button type="button" class="tab" role="tab" id="${id}-tab-${index}"` +
		` aria-controls="${id}-panel-${index}" aria-selected="${selected}"` +
		` tabindex="${selected ? 0 : -1}">${label}</button>`
	);
}

function panel(
	id: string,
	index: number,
	selected: boolean,
	label: string,
	body: string
) {
	return (
		`<div class="tab-panel" role="tabpanel" id="${id}-panel-${index}"` +
		` aria-labelledby="${id}-tab-${index}"${selected ? '' : ' hidden=""'} tabindex="0">` +
		`<div class="tab-panel-label" hidden="">${label}</div> ${body}</div>`
	);
}

describe('in a vite app', () => {
	let root: string;
	let server: ViteDevServer;

	beforeAll(async () => {
		root = write_app(HERE, FILES, [PACKAGE]);
		server = await serve(root, mdsvex({ plugins: [tabs()], highlight: false }));
	});

	afterAll(async () => {
		await server?.close();
		rmSync(root, { recursive: true, force: true });
	});

	test('the module resolves to the installed package, in both environments', async () => {
		for (const env of [server.environments.client, server.environments.ssr]) {
			const found = await env.pluginContainer.resolveId('mdsvex:plugin/0');
			expect(found?.id.replace(/\?.*$/, '')).toBe(
				installed(root, 'directives.js')
			);
			expect(found?.external).toBeFalsy();
		}
	});

	test('the server renders a tab list and every panel, the first one open', async () => {
		const windows = 'Windows <code>x64</code>';
		expect(await ssr(server, '/src/doc.svx')).toBe(
			'<div class="tabs">' +
				'<p class="tabs-label" id="s1-label">Pick <strong>one</strong></p> ' +
				'<div class="tabs-list" role="tablist" aria-labelledby="s1-label">' +
				button('s1', 0, true, 'macOS') +
				button('s1', 1, false, windows) +
				'</div> ' +
				panel(
					's1',
					0,
					true,
					'macOS',
					'<p>Run the <strong>installer</strong>.</p>'
				) +
				panel('s1', 1, false, windows, '<p>Run setup.</p>') +
				'</div>'
		);
	});

	test('a code group is labelled by the fences and marked for the stylesheet', async () => {
		expect(await ssr(server, '/src/group.svx')).toBe(
			'<div class="tabs tabs-code"> ' +
				'<div class="tabs-list" role="tablist">' +
				button('s1', 0, true, 'npm') +
				button('s1', 1, false, 'sh') +
				'</div> ' +
				panel(
					's1',
					0,
					true,
					'npm',
					'<pre><code class="language-sh">npm i</code></pre>'
				) +
				panel(
					's1',
					1,
					false,
					'sh',
					'<pre><code class="language-sh">pnpm i</code></pre>'
				) +
				'</div>'
		);
	});

	test('nested tabs have ids of their own, a tab outside of tabs is an open panel', async () => {
		const inner =
			'<div class="tabs"> <div class="tabs-list" role="tablist">' +
			button('s2', 0, true, 'Inner') +
			'</div> ' +
			panel('s2', 0, true, 'Inner', '<p>deep</p>') +
			'</div>';
		expect(await ssr(server, '/src/nested.svx')).toBe(
			'<div class="tabs"> <div class="tabs-list" role="tablist">' +
				'<p>Before.</p>' +
				button('s1', 0, true, 'Outer') +
				'</div> ' +
				'<p>Before.</p>' +
				panel('s1', 0, true, 'Outer', inner) +
				'</div>' +
				'<div class="tab-panel"><div class="tab-panel-label">Alone</div> <p>outside</p></div>'
		);
	});

	test('the client gets the components and the stylesheet', async () => {
		const client = server.environments.client;
		const doc = await client.transformRequest('/src/doc.svx');
		expect(doc?.code).toMatch(
			/import \{ tabs as Tabs_MDSVEX_D_G, tab as Tab_MDSVEX_D_G \} from "\/node_modules\/@mdsvex\/plugin-tabs\/dist\/directives\.js(\?[^"]*)?";/
		);
		const entry = await client.transformRequest(
			'/node_modules/@mdsvex/plugin-tabs/dist/directives.js'
		);
		expect(entry?.code).toMatch(/import ".*\/dist\/tabs\.css"/);
		const css = await client.transformRequest(
			'/node_modules/@mdsvex/plugin-tabs/dist/tabs.css'
		);
		expect(css?.code).toContain('@media (scripting: none)');
		const tab = await client.transformRequest(
			'/node_modules/@mdsvex/plugin-tabs/dist/Tab.svelte'
		);
		expect(tab?.code).toContain('role="tab"');
		expect(tab?.code).toMatch(/svelte.internal.client/);
	});
});

describe('in a vite app with options', () => {
	let root: string;

	beforeAll(() => {
		root = write_app(HERE, FILES, [PACKAGE]);
	});

	afterAll(() => {
		rmSync(root, { recursive: true, force: true });
	});

	test('css false leaves the stylesheet out', async () => {
		const server = await serve(
			root,
			mdsvex({ plugins: [tabs({ css: false })] })
		);
		try {
			const client = server.environments.client;
			const found = await client.pluginContainer.resolveId('mdsvex:plugin/0');
			expect(found?.id.replace(/\?.*$/, '')).toBe(
				installed(root, 'unstyled.js')
			);
			const entry = await client.transformRequest(
				'/node_modules/@mdsvex/plugin-tabs/dist/unstyled.js'
			);
			expect(entry?.code).not.toContain('.css');
			expect(await ssr(server, '/src/doc.svx')).toContain(
				'<div class="tabs-list" role="tablist" aria-labelledby="s1-label"><button'
			);
		} finally {
			await server.close();
		}
	});

	test('a tab exported by the site replaces the component and gets the same props', async () => {
		const server = await serve(
			root,
			mdsvex({
				plugins: [tabs()],
				components: '#lib/markdown.js',
				highlight: false,
			})
		);
		try {
			const mine = (index: number, label: string, body: string) =>
				`<section class="mine" data-index="${index}"><header>${label}</header>${body}</section>`;
			const one = mine(
				0,
				'npm',
				'<pre><code class="language-sh">npm i</code></pre>'
			);
			const two = mine(
				1,
				'sh',
				'<pre><code class="language-sh">pnpm i</code></pre>'
			);
			expect(await ssr(server, '/src/group.svx')).toBe(
				'<div class="tabs tabs-code"> <div class="tabs-list" role="tablist">' +
					one +
					two +
					'</div> ' +
					one +
					two +
					'</div>'
			);
		} finally {
			await server.close();
		}
	});
});
