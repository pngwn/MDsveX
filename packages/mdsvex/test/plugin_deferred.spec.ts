import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { svelte } from '@sveltejs/vite-plugin-svelte';
import { createServer, normalizePath } from 'vite';
import type { ViteDevServer } from 'vite';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import {
	CompilerSession,
	PluginAsyncError,
	PluginTaskError,
	compile,
	compile_async,
	compile_inputs,
	mdsvex,
} from '../src/main';
import type { Bundle } from '../src/main';

const HERE = dirname(fileURLToPath(import.meta.url));

/** a label for each heading from a lookup that takes a while, and a list of what it found */
function labels(fail?: string): Bundle {
	return {
		name: 'labels',
		parse: {
			heading: {
				parse(node, ctx) {
					return () =>
						ctx.defer(node, async (heading, task) => {
							await new Promise((done) => setTimeout(done, 1));
							const text = heading.text_content;
							if (text === fail) throw new Error(`no label for ${text}`);
							heading.attrs.title = `label ${text}`;
							task.add('found', text);
						});
				},
			},
		},
	};
}

const DOC = '# One\n\n## Two\n';

describe('compile_async', () => {
	test('waits for what plugins deferred, then renders', async () => {
		const { code, data } = await compile_async(DOC, { plugins: [labels()] });
		expect(code).toBe(
			'<script module>\nexport const plugin_data = {"labels":{"found":["One","Two"]}};\n</script>' +
				'<h1 title="label One">One</h1><h2 title="label Two">Two</h2>'
		);
		expect(data).toEqual({ labels: { found: ['One', 'Two'] } });
	});

	test('a document that defers nothing compiles as compile does', async () => {
		const plain = { plugins: [{ name: 'quiet', parse: {} }] };
		expect(await compile_async(DOC, plain)).toEqual(compile(DOC, plain));
		expect(await compile_async(DOC)).toEqual(compile(DOC));
	});

	test('a task that rejects rejects with a PluginTaskError', async () => {
		const failed = compile_async('\n# One\n', { plugins: [labels('One')] });
		await expect(failed).rejects.toBeInstanceOf(PluginTaskError);
		await expect(failed).rejects.toMatchObject({
			plugin: 'labels',
			message:
				'a task plugin "labels" deferred on the heading node at line 2, column 0 failed: no label for One',
		});
	});
});

describe('compile', () => {
	test('throws a PluginAsyncError at the first defer', () => {
		let error: unknown;
		try {
			compile(DOC, { plugins: [labels()] });
		} catch (e) {
			error = e;
		}
		expect(error).toBeInstanceOf(PluginAsyncError);
		expect((error as Error).message).toBe(
			'plugin "labels" called ctx.defer at line 1, column 0, and this parse can not wait for async work, ' +
				'compile() is synchronous, use compile_async() for a document whose plugins wait'
		);
	});
});

describe('the host contract', () => {
	test('parse, settle, read needs, render', async () => {
		const session = new CompilerSession();
		const inputs = compile_inputs({ plugins: [labels()] });
		const parsed = session.parse('# One\n\n```ts src=./a.ts\n```\n', inputs);
		expect(parsed.data).toBeUndefined();
		const settled = session.settle(parsed);
		expect(settled).toBeInstanceOf(Promise);
		await settled;
		expect(parsed.data).toEqual({ labels: { found: ['One'] } });
		expect(parsed.needs).toEqual([
			expect.objectContaining({ type: 'source', spec: './a.ts' }),
		]);
		inputs.sources = { './a.ts': 'let a = 1;' };
		const { code } = session.render(parsed, inputs);
		expect(code).toContain('<h1 title="label One">One</h1>');
		expect(code).toContain('let');
	});

	test('settle is undefined when nothing was deferred', () => {
		const session = new CompilerSession();
		const parsed = session.parse(DOC, compile_inputs());
		expect(session.settle(parsed)).toBeUndefined();
		expect(session.render(parsed, compile_inputs()).code).toBe(
			compile(DOC).code
		);
	});

	test('a document whose plugins deferred renders only once settled', () => {
		const session = new CompilerSession();
		const inputs = compile_inputs({ plugins: [labels()] });
		const parsed = session.parse(DOC, inputs);
		expect(() => session.render(parsed, inputs)).toThrow(
			'wait for settle(parsed) before its render'
		);
	});
});

describe('the vite plugin', () => {
	let root: string;
	let server: ViteDevServer;

	beforeAll(async () => {
		root = mkdtempSync(join(HERE, '.tmp-plugin-deferred-'));
		const files: Record<string, string> = {
			'package.json': '{"name":"app","private":true,"type":"module"}',
			'src/a.svx': DOC,
			'src/b.svx': '# Shown\n\n```ts src=./b.ts\n```\n',
			'src/b.ts': 'export const b = 2;\n',
		};
		for (const [path, content] of Object.entries(files)) {
			mkdirSync(dirname(join(root, path)), { recursive: true });
			writeFileSync(join(root, path), content);
		}
		server = await createServer({
			root,
			configFile: false,
			logLevel: 'silent',
			appType: 'custom',
			cacheDir: join(root, '.vite'),
			optimizeDeps: { noDiscovery: true, include: [] },
			server: { middlewareMode: true, hmr: false, watch: null },
			plugins: [
				mdsvex({ plugins: [labels()], highlight: false }),
				svelte({ configFile: false, extensions: ['.svelte', '.svx'] }),
			],
		});
	});

	afterAll(async () => {
		await server?.close();
		rmSync(root, { recursive: true, force: true });
	});

	const path = (file: string) => normalizePath(join(root, file));

	test('waits for deferred work before it renders', async () => {
		const result = await server.environments.ssr.transformRequest('/src/a.svx');
		expect(result!.code).toContain('title="label One"');
		expect(result!.code).toContain('"found": ["One", "Two"]');
	});

	test('and for the files a fence shows, in the same gap', async () => {
		const result = await server.environments.ssr.transformRequest('/src/b.svx');
		expect(result!.code).toContain('title="label Shown"');
		expect(result!.code).toContain('const');
		expect(result!.code).toContain('"found": ["Shown"]');
	});

	test('?data settles too', async () => {
		const loaded = await server.environments.ssr.pluginContainer.load(
			'\0mdsvex:data:' + path('src/a.svx') + '.js'
		);
		const code = typeof loaded === 'string' ? loaded : loaded?.code;
		expect(code).toContain(
			'export const plugin_data = {"labels":{"found":["One","Two"]}};'
		);
	});
});
