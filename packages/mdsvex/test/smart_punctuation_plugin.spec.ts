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
import { createServer, createServerModuleRunner } from 'vite';
import type { Plugin, ViteDevServer } from 'vite';
import { describe, expect, test, vi } from 'vitest';

import { MANIFEST_PATH, mdsvex } from '../src/main';
import type { MdsvexManifest, MdsvexOptions } from '../src/main';

const HERE = dirname(fileURLToPath(import.meta.url));
const ID = '/src/routes/page.svx';
const DOC = '"a" -- it\'s `"b"`...\n';
const PLAIN = "<p>&quot;a&quot; -- it's <code>&quot;b&quot;</code>...</p>";
const SMART = '<p>“a” – it’s <code>&quot;b&quot;</code>…</p>';

function plugin(options: MdsvexOptions = {}) {
	const [pre] = mdsvex({ highlight: false, ...options }) as any[];
	const ctx = { addWatchFile() {}, warn() {} };
	return (code: string, id = ID) => pre.transform.call(ctx, code, id);
}

describe('vite plugin smart_punctuation', () => {
	test('off by default', () => {
		expect(plugin()(DOC).code).toBe(PLAIN);
		expect(plugin({ smart_punctuation: false })(DOC).code).toBe(PLAIN);
	});

	test('on for every document of the plugin', () => {
		const transform = plugin({ smart_punctuation: true });
		expect(transform(DOC).code).toBe(SMART);
		expect(transform('# "b"\n', '/src/routes/other.svx').code).toBe(
			'<h1>“b”</h1>'
		);
	});

	test('an object picks the kinds and the quotes', () => {
		const transform = plugin({
			smart_punctuation: { quotes: ['„', '“', '‚', '‘'], ellipses: false },
		});
		expect(transform(DOC).code).toBe(
			'<p>„a“ – it’s <code>&quot;b&quot;</code>...</p>'
		);
	});

	test('a value that is not the option throws when the plugin is made', () => {
		expect(() =>
			mdsvex({ smart_punctuation: 'on' as unknown as true })
		).toThrow('[mdsvex] smart_punctuation');
		expect(() =>
			mdsvex({
				smart_punctuation: { quotes: ['a'] as unknown as true },
			})
		).toThrow('[mdsvex] smart_punctuation.quotes');
	});
});

function write_app(files: Record<string, string>): string {
	const root = mkdtempSync(join(HERE, '.tmp-smart-'));
	const all: Record<string, string> = {
		'package.json': JSON.stringify({
			name: 'app',
			private: true,
			type: 'module',
		}),
		...files,
	};
	for (const [path, content] of Object.entries(all)) {
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
		const { render } = await runner.import('svelte/server');
		const mod = await runner.import(url);
		return render(mod.default).body.replace(/<!--[^]*?-->/g, '');
	} finally {
		await runner.close();
	}
}

async function manifest_of(root: string): Promise<MdsvexManifest> {
	return vi.waitFor(
		() =>
			JSON.parse(
				readFileSync(join(root, MANIFEST_PATH), 'utf8')
			) as MdsvexManifest
	);
}

describe('smart_punctuation in a dev server', () => {
	const FILES = { 'src/doc.svx': '"a" -- it\'s {1 + 1}\'s...\n' };

	test('svelte renders the characters and the manifest has the option', async () => {
		const root = write_app(FILES);
		const option = { quotes: ['«', '»', '‹', '›'] as const, dashes: false };
		const server = await serve(root, mdsvex({ smart_punctuation: option }));
		try {
			expect(await ssr(server, '/src/doc.svx')).toBe('<p>«a» -- it’s 2’s…</p>');
			expect((await manifest_of(root)).smart_punctuation).toEqual(option);
		} finally {
			await server.close();
			rmSync(root, { recursive: true, force: true });
		}
	});

	test('a manifest without the option means off', async () => {
		const root = write_app(FILES);
		const server = await serve(root, mdsvex());
		try {
			expect(await ssr(server, '/src/doc.svx')).toBe(
				'<p>"a" -- it\'s 2\'s...</p>'
			);
			expect('smart_punctuation' in (await manifest_of(root))).toBe(false);
		} finally {
			await server.close();
			rmSync(root, { recursive: true, force: true });
		}
	});
});
