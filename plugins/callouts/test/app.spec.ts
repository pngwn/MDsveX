import { rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { callouts } from '@mdsvex/plugin-callouts';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { mdsvex } from 'mdsvex';
import { createServer, createServerModuleRunner, normalizePath } from 'vite';
import type { Plugin, ViteDevServer } from 'vite';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { write_app } from '../../test/app';

const HERE = dirname(fileURLToPath(import.meta.url));
const PACKAGE = dirname(HERE);

const FILES = {
	'src/note.svx': ':::note\nUse _this_.\n:::\n',
	'src/custom.svx': ':::warning[Breaking _change_]\n- one\n:::\n',
	'src/kinds.svx': [
		':::tip',
		':::',
		'',
		':::important',
		':::',
		'',
		':::caution',
		':::',
		'',
	].join('\n'),
	'src/lib/markdown.js': "export * as directives from './directives.js';",
	'src/lib/directives.js': "export { default as note } from './MyNote.svelte';",
	'src/lib/MyNote.svelte': [
		'<script>',
		'  let { children, title } = $props();',
		'</script>',
		'<aside class="mine" aria-label={title}>{@render children?.()}</aside>',
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

/** the package as installed, a copy of what it publishes */
function installed(root: string, file: string): string {
	return normalizePath(
		join(root, 'node_modules/@mdsvex/plugin-callouts/dist', file)
	);
}

/** the icon element of a callout, its path data left out */
function icon(named?: string): string {
	return (
		'<svg class="callout-icon" viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" focusable="false"' +
		(named === undefined
			? ' aria-hidden="true">'
			: ` role="img" aria-label="${named}">`)
	);
}

/** the markup with the shapes of each icon left out */
function shapes_out(html: string): string {
	return html.replace(/(<svg[^>]*>)[^]*?<\/svg>/g, '$1</svg>');
}

describe('in a vite app', () => {
	let root: string;
	let server: ViteDevServer;

	beforeAll(async () => {
		root = write_app(HERE, FILES, [PACKAGE]);
		server = await serve(root, mdsvex({ plugins: [callouts()] }));
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

	test('a callout is a note with its title and its body', async () => {
		expect(shapes_out(await ssr(server, '/src/note.svx'))).toBe(
			'<div class="callout" data-kind="note" role="note">' +
				'<p class="callout-title">' +
				icon() +
				'</svg> <span class="callout-title-text">Note</span></p> ' +
				'<div class="callout-body"><p>Use <em>this</em>.</p></div>' +
				'</div>'
		);
	});

	test('a custom title is the label, the icon names the kind', async () => {
		expect(shapes_out(await ssr(server, '/src/custom.svx'))).toBe(
			'<div class="callout" data-kind="warning" role="note">' +
				'<p class="callout-title">' +
				icon('Warning') +
				'</svg> <span class="callout-title-text">Breaking <em>change</em></span></p> ' +
				'<div class="callout-body"><ul><li>one</li></ul></div>' +
				'</div>'
		);
	});

	test('each kind has its own icon', async () => {
		const html = await ssr(server, '/src/kinds.svx');
		const icons = [...html.matchAll(/<svg[^>]*>([^]*?)<\/svg>/g)].map(
			(match) => match[1]
		);
		expect(icons).toHaveLength(3);
		expect(new Set(icons).size).toBe(3);
		expect(shapes_out(html)).toContain(
			'<div class="callout" data-kind="important" role="note"><p class="callout-title">' +
				icon() +
				'</svg> <span class="callout-title-text">Important</span></p> <div class="callout-body"></div></div>'
		);
	});

	test('the client gets the stylesheet and never the static component', async () => {
		const client = server.environments.client;
		const doc = await client.transformRequest('/src/note.svx');
		expect(doc?.code).toMatch(
			/import "\/node_modules\/@mdsvex\/plugin-callouts\/dist\/directives\.js\?(v=\w+&)?mdsvex-live";/
		);
		expect(doc?.code).not.toMatch(/Note_MDSVEX/);
		expect(doc?.code).toContain(
			'<div class="callout" data-kind="note" role="note">'
		);
		const entry = await client.transformRequest(
			'/node_modules/@mdsvex/plugin-callouts/dist/directives.js?mdsvex-live'
		);
		expect(entry?.code).toMatch(/import ".*\/dist\/callouts\.css"/);
		expect(entry?.code).not.toContain('.static.svelte');
		const css = await client.transformRequest(
			'/node_modules/@mdsvex/plugin-callouts/dist/callouts.css'
		);
		expect(css?.code).toContain("data-kind='warning'");
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
			mdsvex({ plugins: [callouts({ css: false })] })
		);
		try {
			const client = server.environments.client;
			const found = await client.pluginContainer.resolveId('mdsvex:plugin/0');
			expect(found?.id.replace(/\?.*$/, '')).toBe(
				installed(root, 'unstyled.js')
			);
			const entry = await client.transformRequest(
				'/node_modules/@mdsvex/plugin-callouts/dist/unstyled.js'
			);
			expect(entry?.code).not.toContain('.css');
		} finally {
			await server.close();
		}
	});

	test('translated titles reach the component', async () => {
		const server = await serve(
			root,
			mdsvex({ plugins: [callouts({ titles: { note: 'Remarque' } })] })
		);
		try {
			expect(await ssr(server, '/src/note.svx')).toContain(
				'<span class="callout-title-text">Remarque</span>'
			);
		} finally {
			await server.close();
		}
	});

	test('a note exported by the site replaces the component, and gets the title', async () => {
		const server = await serve(
			root,
			mdsvex({ plugins: [callouts()], components: '#lib/markdown.js' })
		);
		try {
			expect(await ssr(server, '/src/note.svx')).toBe(
				'<aside class="mine" aria-label="Note"><p>Use <em>this</em>.</p></aside>'
			);
		} finally {
			await server.close();
		}
	});
});
