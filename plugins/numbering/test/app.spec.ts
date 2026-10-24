import { rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { numbering } from '@mdsvex/plugin-numbering';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { compile, mdsvex } from 'mdsvex';
import { createServer, createServerModuleRunner } from 'vite';
import type { ViteDevServer } from 'vite';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { write_app } from '../../test/app';

const HERE = dirname(fileURLToPath(import.meta.url));
const PACKAGE = dirname(HERE);

const FILES = {
	'src/doc.svx': [
		'## Results',
		'',
		':::table[What each plan costs](id=tbl:plans)',
		'| plan | price |',
		'| --- | --- |',
		'| free | 0 |',
		':::',
		'',
		'```math id=eq:energy',
		'E = mc^2',
		'```',
		'',
		'See :ref[tbl:plans], :ref[eq:energy] and :ref[sec:results].',
		'',
	].join('\n'),
};

describe('in a vite app', () => {
	let root: string;
	let server: ViteDevServer;

	beforeAll(async () => {
		root = write_app(HERE, FILES, [PACKAGE]);
		server = await createServer({
			root,
			configFile: false,
			logLevel: 'silent',
			appType: 'custom',
			cacheDir: join(root, '.vite'),
			optimizeDeps: { noDiscovery: true, include: [] },
			server: { middlewareMode: true, hmr: false, watch: null },
			plugins: [
				mdsvex({ heading_ids: true, plugins: [numbering()] }),
				svelte({ configFile: false, extensions: ['.svelte', '.svx'] }),
			],
		});
	});

	afterAll(async () => {
		await server?.close();
		rmSync(root, { recursive: true, force: true });
	});

	test('the page renders the numbers and links its references to them', async () => {
		const runner = createServerModuleRunner(server.environments.ssr, {
			hmr: false,
		});
		try {
			const { render } = await runner.import('svelte/server');
			const page = await runner.import('/src/doc.svx');
			const html = render(page.default)
				.body.replace(/<!--[^]*?-->/g, '')
				.replace(/<math[^]*<\/math>/, '<math/>');
			expect(html).toBe(
				'<h2 id="results">Results</h2>' +
					'<figure id="tbl:plans" class="table"><figcaption><span class="table-number">Table 1</span>: What each plan costs</figcaption> ' +
					'<table><thead><tr><th>plan</th><th>price</th></tr></thead><tbody><tr><td>free</td><td>0</td></tr></tbody></table></figure>' +
					'<div id="eq:energy" class="equation"><div class="math math-display" translate="no"><math/></div></div>' +
					'<p>See <span class="ref"><a href="#tbl:plans">Table 1</a></span>, ' +
					'<span class="ref"><a href="#eq:energy">Equation 1</a></span> and ' +
					'<span class="ref"><a href="#results">Section 1</a></span>.</p>'
			);
		} finally {
			await runner.close();
		}
	});

	test('the client gets the components and none of the compiler', async () => {
		const client = server.environments.client;
		const doc = await client.transformRequest('/src/doc.svx');
		expect(doc?.code).toMatch(
			/from "\/node_modules\/@mdsvex\/plugin-numbering\/dist\/directives\.js/
		);
		expect(doc?.code).not.toMatch(/from "[^"]*mdsvex\/dist/);
		const words = await client.transformRequest(
			'/node_modules/@mdsvex/plugin-numbering/dist/words.js'
		);
		expect(words?.code).not.toMatch(/from ["']mdsvex/);
	});
});

describe('as published', () => {
	test('the files it publishes are the ones its exports name', async () => {
		const root = write_app(HERE, {}, [PACKAGE]);
		try {
			const require = createRequire(join(root, 'index.js'));
			const entry = require.resolve('@mdsvex/plugin-numbering');
			expect(entry).toBe(
				join(
					root,
					'node_modules',
					'@mdsvex',
					'plugin-numbering',
					'dist',
					'index.js'
				)
			);
			const published = await import(pathToFileURL(entry).href);
			const { data } = compile('```math id=eq:a\nx\n```\n', {
				plugins: [published.numbering()],
			});
			expect(data?.numbering).toEqual({
				'target:eq:a': { kind: 'eq', number: '1', text: 'Equation 1' },
			});
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
