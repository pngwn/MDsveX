import { rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { embeds } from '@mdsvex/plugin-embeds';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { mdsvex } from 'mdsvex';
import { createServer, createServerModuleRunner, normalizePath } from 'vite';
import type { Plugin, ViteDevServer } from 'vite';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { write_app } from '../../test/app';

const HERE = dirname(fileURLToPath(import.meta.url));
const PACKAGE = dirname(HERE);

const FILES = {
	'src/embeds.svx': [
		'::youtube[A *talk*](id=dQw4w9WgXcQ, start=30)',
		'',
		'::vimeo[A film](id=76979871)',
		'',
		'::youtube[No id]',
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
		join(root, 'node_modules/@mdsvex/plugin-embeds/dist', file)
	);
}

describe('in a vite app', () => {
	let root: string;
	let server: ViteDevServer;

	beforeAll(async () => {
		root = write_app(HERE, FILES, [PACKAGE]);
		server = await serve(root, mdsvex({ plugins: [embeds()] }));
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

	test('embeds are lazy frames named by their label', async () => {
		const html = await ssr(server, '/src/embeds.svx');
		expect(html).toBe(
			'<div class="embed embed-youtube"><iframe src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?start=30" title="A talk" loading="lazy" ' +
				'allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" ' +
				'referrerpolicy="strict-origin-when-cross-origin" allowfullscreen=""></iframe></div>' +
				'<div class="embed embed-vimeo"><iframe src="https://player.vimeo.com/video/76979871?dnt=1" title="A film" loading="lazy" ' +
				'allow="autoplay; fullscreen; picture-in-picture; clipboard-write" ' +
				'referrerpolicy="strict-origin-when-cross-origin" allowfullscreen=""></iframe></div>' +
				'<p>No id</p>'
		);
	});

	test('the client gets the components and the stylesheet', async () => {
		const client = server.environments.client;
		const entry = await client.transformRequest(
			'/node_modules/@mdsvex/plugin-embeds/dist/directives.js'
		);
		expect(entry?.code).toMatch(/import ".*\/dist\/embeds\.css"/);
		const youtube = await client.transformRequest(
			'/node_modules/@mdsvex/plugin-embeds/dist/YouTube.svelte'
		);
		expect(youtube?.code).toMatch(/svelte.internal.client/);
	});
});

describe('in a vite app with options', () => {
	test('css false leaves the stylesheet out', async () => {
		const root = write_app(HERE, FILES, [PACKAGE]);
		const server = await serve(
			root,
			mdsvex({ plugins: [embeds({ css: false })] })
		);
		try {
			const client = server.environments.client;
			const found = await client.pluginContainer.resolveId('mdsvex:plugin/0');
			expect(found?.id.replace(/\?.*$/, '')).toBe(
				installed(root, 'unstyled.js')
			);
			const entry = await client.transformRequest(
				'/node_modules/@mdsvex/plugin-embeds/dist/unstyled.js'
			);
			expect(entry?.code).not.toContain('.css');
		} finally {
			await server.close();
			rmSync(root, { recursive: true, force: true });
		}
	});
});
