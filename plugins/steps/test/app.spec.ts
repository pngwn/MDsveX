import { rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { steps } from '@mdsvex/plugin-steps';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { mdsvex } from 'mdsvex';
import { createServer, createServerModuleRunner, normalizePath } from 'vite';
import type { Plugin, ViteDevServer } from 'vite';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { write_app } from '../../test/app';

const HERE = dirname(fileURLToPath(import.meta.url));
const PACKAGE = dirname(HERE);

const DOC = [
	':::steps[Set *up*]',
	'## Install',
	'',
	'Run the *installer*.',
	'',
	'## Configure',
	':::',
	'',
].join('\n');

const NESTED = [
	'::::steps',
	'Before you start.',
	'',
	'## Outer',
	'',
	':::steps',
	'### Inner',
	':::',
	'::::',
	'',
	':::steps',
	'No headings.',
	':::',
	'',
].join('\n');

const FILES = {
	'src/doc.svx': DOC,
	'src/nested.svx': NESTED,
	'src/lib/markdown.js': "export * as directives from './directives.js';",
	'src/lib/directives.js': "export { default as step } from './MyStep.svelte';",
	'src/lib/MyStep.svelte': [
		'<script>',
		'  let { label, children } = $props();',
		'</script>',
		'<section class="mine"><header>{@render label?.()}</header>{@render children?.()}</section>',
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
		join(root, 'node_modules/@mdsvex/plugin-steps/dist', file)
	);
}

describe('in a vite app', () => {
	let root: string;
	let server: ViteDevServer;

	beforeAll(async () => {
		root = write_app(HERE, FILES, [PACKAGE]);
		server = await serve(root, mdsvex({ plugins: [steps()] }));
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

	test('renders an ordered list of steps on the server', async () => {
		expect(await ssr(server, '/src/doc.svx')).toBe(
			'<p class="steps-label">Set <strong>up</strong></p>' +
				'<ol class="steps" role="list">' +
				'<li class="step">' +
				'<div class="step-title"><h2>Install</h2></div> ' +
				'<div class="step-body"><p>Run the <strong>installer</strong>.</p></div>' +
				'</li>' +
				'<li class="step">' +
				'<div class="step-title"><h2>Configure</h2></div> ' +
				'<div class="step-body"></div>' +
				'</li>' +
				'</ol>'
		);
	});

	test('nested steps, content before the first heading and a container with none', async () => {
		expect(await ssr(server, '/src/nested.svx')).toBe(
			'<ol class="steps" role="list">' +
				'<p>Before you start.</p>' +
				'<li class="step">' +
				'<div class="step-title"><h2>Outer</h2></div> ' +
				'<div class="step-body">' +
				'<ol class="steps" role="list">' +
				'<li class="step">' +
				'<div class="step-title"><h3>Inner</h3></div> ' +
				'<div class="step-body"></div>' +
				'</li>' +
				'</ol>' +
				'</div>' +
				'</li>' +
				'</ol>' +
				'<ol class="steps" role="list"><p>No headings.</p></ol>'
		);
	});

	test('the client gets the stylesheet and never the static components', async () => {
		const client = server.environments.client;
		const doc = await client.transformRequest('/src/doc.svx');
		expect(doc?.code).toMatch(
			/import "\/node_modules\/@mdsvex\/plugin-steps\/dist\/directives\.js\?(v=\w+&)?mdsvex-live";/
		);
		expect(doc?.code).not.toMatch(/Steps?_MDSVEX/);
		expect(doc?.code).toContain(
			'<ol class="steps" role="list"><li class="step">'
		);
		const entry = await client.transformRequest(
			'/node_modules/@mdsvex/plugin-steps/dist/directives.js?mdsvex-live'
		);
		expect(entry?.code).toMatch(/import ".*\/dist\/steps\.css"/);
		expect(entry?.code).not.toContain('.static.svelte');
		const css = await client.transformRequest(
			'/node_modules/@mdsvex/plugin-steps/dist/steps.css'
		);
		expect(css?.code).toContain('counter-increment: step');
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
			mdsvex({ plugins: [steps({ css: false })] })
		);
		try {
			const client = server.environments.client;
			const found = await client.pluginContainer.resolveId('mdsvex:plugin/0');
			expect(found?.id.replace(/\?.*$/, '')).toBe(
				installed(root, 'unstyled.js')
			);
			const entry = await client.transformRequest(
				'/node_modules/@mdsvex/plugin-steps/dist/unstyled.js'
			);
			expect(entry?.code).not.toContain('.css');
			expect(await ssr(server, '/src/doc.svx')).toContain(
				'<ol class="steps" role="list"><li class="step">'
			);
		} finally {
			await server.close();
		}
	});

	test('a step exported by the site replaces the component and gets the same label and children', async () => {
		const server = await serve(
			root,
			mdsvex({ plugins: [steps()], components: '#lib/markdown.js' })
		);
		try {
			expect(await ssr(server, '/src/doc.svx')).toBe(
				'<p class="steps-label">Set <strong>up</strong></p>' +
					'<ol class="steps" role="list">' +
					'<section class="mine"><header><h2>Install</h2></header><p>Run the <strong>installer</strong>.</p></section>' +
					'<section class="mine"><header><h2>Configure</h2></header></section>' +
					'</ol>'
			);
		} finally {
			await server.close();
		}
	});
});

describe('in a vite app that prebundles its dependencies', () => {
	test('the module is served as published, so its static re-exports are left out', async () => {
		const root = write_app(HERE, FILES, [PACKAGE]);
		// the optimizer on, as vite-plugin-svelte and every app leave it
		const server = await createServer({
			root,
			configFile: false,
			logLevel: 'silent',
			appType: 'custom',
			cacheDir: join(root, '.vite'),
			server: { middlewareMode: true, hmr: false, watch: null },
			plugins: [
				mdsvex({ plugins: [steps()] }),
				svelte({ configFile: false, extensions: ['.svelte', '.svx'] }),
			],
		});
		const client = server.environments.client;
		try {
			const doc = await client.transformRequest('/src/doc.svx');
			expect(doc?.code).toMatch(
				/import "\/node_modules\/@mdsvex\/plugin-steps\/dist\/directives\.js\?(v=\w+&)?mdsvex-live";/
			);
			expect(doc?.code).not.toMatch(/Steps?_MDSVEX/);
			expect(
				(await client.pluginContainer.resolveId('mdsvex:plugin/0'))?.id
			).toMatch(
				/\/node_modules\/@mdsvex\/plugin-steps\/dist\/directives\.js\?/
			);
		} finally {
			// the optimizer settles before the server can close
			await client.waitForRequestsIdle();
			await server.close();
			rmSync(root, { recursive: true, force: true });
		}
	});
});
