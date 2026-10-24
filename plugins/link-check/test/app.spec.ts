import { rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { link_check } from '@mdsvex/plugin-link-check';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { compile, mdsvex } from 'mdsvex';
import { build, createLogger, createServer, normalizePath } from 'vite';
import type { Logger, Plugin, ViteDevServer } from 'vite';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { write_app } from '../../test/app';

const HERE = dirname(fileURLToPath(import.meta.url));
const PACKAGE = dirname(HERE);

const GUIDE = '# Guide\n\n## Install\n\nRun it.\n';

const FILES = {
	'src/routes/guide/+page.md': GUIDE,
	'src/routes/+page.md': [
		'# Home',
		'',
		'Read [the install steps](./guide/+page.md#install), [the same by route](/guide#install)',
		'and [the top](#home).',
		'',
	].join('\n'),
	'src/routes/broken/+page.md':
		'# Broken\n\n[a](#nope) and [b](../guide/+page.md#nope) and [c](../gone.md)\n',
};

/** a logger that keeps the warnings */
function keeping(): { logger: Logger; warnings: string[] } {
	const warnings: string[] = [];
	const logger = createLogger('silent');
	logger.warn = (message) => void warnings.push(message);
	logger.warnOnce = logger.warn;
	return { logger, warnings };
}

async function serve(
	root: string,
	main: Plugin[],
	logger: Logger
): Promise<ViteDevServer> {
	return createServer({
		root,
		configFile: false,
		customLogger: logger,
		appType: 'custom',
		cacheDir: join(root, '.vite'),
		optimizeDeps: { noDiscovery: true, include: [] },
		server: { middlewareMode: true, hmr: false, watch: null },
		plugins: [
			main,
			svelte({ configFile: false, extensions: ['.svelte', '.md'] }),
		],
	});
}

/** the url and message of each warning about a link, in order */
const about_links = (warnings: string[]) =>
	warnings
		.filter((w) => w.includes('links to'))
		.map((w) => /(\S+) links to/.exec(w)![1]);

describe('in a vite app', () => {
	let root: string;
	let server: ViteDevServer;
	let plugins: Plugin[];
	const { logger, warnings } = keeping();

	beforeAll(async () => {
		root = write_app(HERE, FILES, [PACKAGE]);
		plugins = mdsvex({
			extensions: ['.md'],
			heading_ids: true,
			links: { routes: 'src/routes' },
			plugins: [link_check({ routes: join(root, 'src/routes') })],
		});
		server = await serve(root, plugins, logger);
	});

	afterAll(async () => {
		await server?.close();
		rmSync(root, { recursive: true, force: true });
	});

	test('links that go somewhere say nothing, the routes rewrite as before', async () => {
		warnings.length = 0;
		const { code } = (await server.environments.ssr.transformRequest(
			'/src/routes/+page.md'
		))!;
		// the link by file became the route
		expect(code).toContain('Read <a href="/guide#install">');
		expect(about_links(warnings)).toEqual([]);
	});

	test('each link that goes nowhere is a warning of the document', async () => {
		warnings.length = 0;
		await server.environments.ssr.transformRequest(
			'/src/routes/broken/+page.md'
		);
		expect(about_links(warnings).sort()).toEqual([
			'#nope',
			'../gone.md',
			'../guide/+page.md#nope',
		]);
		expect(warnings.join('\n')).toContain('src/routes/broken/+page.md');
	});

	test('a change to a linked document checks the documents that link to it again', async () => {
		const ssr = server.environments.ssr;
		warnings.length = 0;
		await ssr.transformRequest('/src/routes/+page.md');
		expect(about_links(warnings)).toEqual([]);
		const file = normalizePath(join(root, 'src/routes/guide/+page.md'));
		const changed = GUIDE.replace('## Install', '## Setup');
		writeFileSync(file, changed);
		try {
			ssr.moduleGraph.onFileChange(file);
			const hot = plugins[0].hotUpdate as Function;
			const modules = await hot.call(
				{ environment: ssr },
				{
					type: 'update',
					file,
					timestamp: Date.now(),
					modules: [...(ssr.moduleGraph.getModulesByFile(file) ?? [])],
					read: async () => changed,
					server,
				}
			);
			expect((modules ?? []).map((m: any) => m.id)).toContain(
				normalizePath(join(root, 'src/routes/+page.md'))
			);
			await ssr.transformRequest('/src/routes/+page.md');
			expect(about_links(warnings)).toEqual([
				'./guide/+page.md#install',
				'/guide#install',
			]);
		} finally {
			writeFileSync(file, GUIDE);
		}
	});
});

describe('a strict build', () => {
	test('fails on the first document with a link that goes nowhere', async () => {
		const root = write_app(HERE, FILES, [PACKAGE]);
		try {
			const error = await build({
				root,
				configFile: false,
				logLevel: 'silent',
				build: {
					write: false,
					ssr: true,
					rollupOptions: {
						input: [join(root, 'src/routes/broken/+page.md')],
					},
				},
				plugins: [
					mdsvex({
						extensions: ['.md'],
						heading_ids: true,
						plugins: [link_check({ strict: true })],
					}),
					svelte({ configFile: false, extensions: ['.svelte', '.md'] }),
				],
			}).then(
				() => undefined,
				(e) => e
			);
			expect(String(error?.message)).toContain(
				'src/routes/broken/+page.md has 3 links that go nowhere:'
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});

describe('as published', () => {
	test('the files it publishes are the ones its exports name', async () => {
		const root = write_app(HERE, {}, [PACKAGE]);
		try {
			const require = createRequire(join(root, 'index.js'));
			const entry = require.resolve('@mdsvex/plugin-link-check');
			expect(entry).toBe(
				join(
					root,
					'node_modules',
					'@mdsvex',
					'plugin-link-check',
					'dist',
					'index.js'
				)
			);
			const published = await import(pathToFileURL(entry).href);
			const { warnings } = compile('[a](#gone)\n', {
				plugins: [published.link_check({ documents: false })],
			});
			expect(warnings?.map((w) => w.code)).toEqual(['missing_anchor']);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
