import { rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { code_blocks } from '@mdsvex/plugin-code-blocks';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { mdsvex } from 'mdsvex';
import { createServer, createServerModuleRunner, normalizePath } from 'vite';
import type { Plugin, ViteDevServer } from 'vite';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { write_app } from '../../test/app';

const HERE = dirname(fileURLToPath(import.meta.url));
const PACKAGE = dirname(HERE);

const FILES = {
	'src/code.svx': [
		'<script>',
		"  let name = 'mdsvex';",
		'</script>',
		'',
		'```sh title="Install" caption="Then restart"',
		'pnpm add {name} # [!eval]',
		'```',
		'',
		'```sh nocopy',
		'ls',
		'```',
		'',
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
		join(root, 'node_modules/@mdsvex/plugin-code-blocks/dist', file)
	);
}

describe('in a vite app', () => {
	let root: string;
	let server: ViteDevServer;

	beforeAll(async () => {
		root = write_app(HERE, FILES, [PACKAGE]);
		server = await serve(root, mdsvex({ plugins: [code_blocks()] }));
	});

	afterAll(async () => {
		await server?.close();
		rmSync(root, { recursive: true, force: true });
	});

	test('a code block has its title, a copy button with a status and its caption', async () => {
		const html = await ssr(server, '/src/code.svx');
		expect(html).toContain(
			'<div class="code-block" data-language="sh">' +
				'<div class="code-block-title">Install</div> ' +
				'<div class="code-block-body">' +
				'<div class="code-block-actions">' +
				'<span class="code-block-status" role="status"></span> ' +
				'<button type="button" class="code-block-copy" aria-label="Copy code of Install">Copy</button>' +
				'</div> <pre'
		);
		expect(html).toContain(
			'</pre></div> <div class="code-block-caption">Then restart</div></div>'
		);
		// nocopy leaves the button out
		expect(html.match(/<button/g)).toHaveLength(1);
	});

	test('the code it copies has live values in place', async () => {
		const client = server.environments.client;
		const doc = await client.transformRequest('/src/code.svx');
		expect(doc?.code).toMatch(/code: `pnpm add \$\{name\}`/);
	});
});

describe('in a vite app with options', () => {
	test('the module resolves to the installed package, and css false leaves the stylesheet out', async () => {
		const root = write_app(HERE, FILES, [PACKAGE]);
		const server = await serve(
			root,
			mdsvex({ plugins: [code_blocks({ css: false })] })
		);
		try {
			const client = server.environments.client;
			const found = await client.pluginContainer.resolveId(
				'mdsvex:plugin-components/0'
			);
			expect(found?.id.replace(/\?.*$/, '')).toBe(
				installed(root, 'unstyled.js')
			);
			const entry = await client.transformRequest(
				'/node_modules/@mdsvex/plugin-code-blocks/dist/unstyled.js'
			);
			expect(entry?.code).not.toContain('.css');
		} finally {
			await server.close();
			rmSync(root, { recursive: true, force: true });
		}
	});
});
