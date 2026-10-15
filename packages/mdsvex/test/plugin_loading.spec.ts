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
	compile,
	compile_async,
	compile_inputs,
	mdsvex,
} from '../src/main';
import type { Bundle } from '../src/main';

const HERE = dirname(fileURLToPath(import.meta.url));

/** the title of each heading is the text of a file the document names in its frontmatter */
function glossary(): Bundle {
	return {
		name: 'glossary',
		parse: {
			heading: {
				parse(node, ctx) {
					return () =>
						ctx.defer(node, async (heading, task) => {
							const file = task.frontmatter?.glossary;
							if (typeof file !== 'string') return;
							const path = await task.resolve(file);
							const text = await task.cached(path!, (key) => task.read(key));
							heading.attrs.title = text.trim();
						});
				},
			},
		},
	};
}

/** a summary of the whole document, made once every heading is known */
function summary(): Bundle {
	return {
		name: 'summary',
		parse: {
			async document(root, ctx) {
				let count = 0;
				for (let child = root.first_child; child !== null; child = child.next)
					if (child.type === 'heading') count++;
				await Promise.resolve();
				ctx.set('headings', count);
				ctx.depend('/summary/config.json');
			},
		},
	};
}

describe('the document hook', () => {
	test('runs after the parse, and a sync one under compile', () => {
		const counted: Bundle = {
			name: 'count',
			parse: {
				document(root, ctx) {
					ctx.set('nodes', root.first_child === null ? 0 : 1);
				},
			},
		};
		expect(compile('# a\n', { plugins: [counted] }).data).toEqual({
			count: { nodes: 1 },
		});
	});

	test('one that waits needs compile_async', async () => {
		expect(() => compile('# a\n', { plugins: [summary()] })).toThrow(
			PluginAsyncError
		);
		const result = await compile_async('# a\n\n# b\n', {
			plugins: [summary()],
		});
		expect(result.data).toEqual({ summary: { headings: 2 } });
		expect(result.dependencies).toEqual(['/summary/config.json']);
	});
});

describe('read, resolve and dependencies', () => {
	const files: Record<string, string> = { '/site/terms.txt': 'A term\n' };
	const read = async (path: string) => {
		const text = files[path];
		if (text === undefined) throw new Error(`no file ${path}`);
		return text;
	};
	const resolve = (spec: string, from: string | undefined) =>
		spec.startsWith('./') ? from!.replace(/[^/]+$/, spec.slice(2)) : null;
	const DOC = '---\nglossary: ./terms.txt\n---\n\n# One\n';

	test('the host passes the reader and the resolver, and the result names what was read', async () => {
		const result = await compile_async(DOC, {
			plugins: [glossary()],
			filename: '/site/post.svx',
			read,
			resolve,
		});
		expect(result.code).toContain('<h1 title="A term">One</h1>');
		expect(result.dependencies).toEqual(['/site/terms.txt']);
	});

	test('without a reader ctx.read is a TypeError', async () => {
		await expect(
			compile_async(DOC, {
				plugins: [glossary()],
				filename: '/site/post.svx',
				resolve,
			})
		).rejects.toMatchObject({
			name: 'PluginTaskError',
			cause: expect.objectContaining({
				message:
					'ctx.read needs a reader, the host passes one as its read option',
			}),
		});
	});

	test('a compile with nothing read has no dependencies', () => {
		expect(compile('# a\n').dependencies).toBeUndefined();
	});

	test('a session shares what ctx.cached keeps until it is invalidated', async () => {
		let reads = 0;
		const counting = async (path: string) => {
			reads++;
			return read(path);
		};
		const session = new CompilerSession();
		const plugins = [glossary()];
		const once = async () => {
			const inputs = compile_inputs({
				plugins,
				filename: '/site/post.svx',
				read: counting,
				resolve,
			});
			const parsed = session.parse(DOC, inputs);
			await session.settle(parsed);
			expect(parsed.dependencies).toEqual(['/site/terms.txt']);
			return session.render(parsed, inputs).code;
		};
		await once();
		await once();
		expect(reads).toBe(1);
		files['/site/terms.txt'] = 'A new term\n';
		session.invalidate(['/site/terms.txt']);
		expect(await once()).toContain('title="A new term"');
		expect(reads).toBe(2);
		files['/site/terms.txt'] = 'A term\n';
	});

	test('compile_async takes the session a watching host invalidates', async () => {
		let reads = 0;
		const counting = async (path: string) => {
			reads++;
			return read(path);
		};
		const plugins = [glossary()];
		const options = {
			plugins,
			filename: '/site/post.svx',
			read: counting,
			resolve,
		};
		const session = new CompilerSession();
		await compile_async(DOC, options, session);
		await compile_async(DOC, options, session);
		expect(reads).toBe(1);
		files['/site/terms.txt'] = 'A new term\n';
		session.invalidate(['/site/terms.txt']);
		const after = await compile_async(DOC, options, session);
		expect(after.code).toContain('title="A new term"');
		expect(after.dependencies).toEqual(['/site/terms.txt']);
		expect(reads).toBe(2);
		files['/site/terms.txt'] = 'A term\n';
	});

	test('without a session compile_async keeps loads for its plugins array', async () => {
		let reads = 0;
		const counting = async (path: string) => {
			reads++;
			return read(path);
		};
		const options = () => ({
			plugins,
			filename: '/site/post.svx',
			read: counting,
			resolve,
		});
		let plugins = [glossary()];
		await compile_async(DOC, options());
		await compile_async(DOC, options());
		expect(reads).toBe(1);
		plugins = [glossary()];
		await compile_async(DOC, options());
		expect(reads).toBe(2);
	});
});

describe('the vite plugin', () => {
	let root: string;
	let server: ViteDevServer;
	let plugins: any[];

	beforeAll(async () => {
		root = mkdtempSync(join(HERE, '.tmp-plugin-loading-'));
		const files: Record<string, string> = {
			'package.json': '{"name":"app","private":true,"type":"module"}',
			'src/post.svx': '---\nglossary: ./terms.txt\n---\n\n# One\n',
			'src/terms.txt': 'First\n',
		};
		for (const [path, content] of Object.entries(files)) {
			mkdirSync(dirname(join(root, path)), { recursive: true });
			writeFileSync(join(root, path), content);
		}
		plugins = [
			mdsvex({ plugins: [glossary()], highlight: false }),
			svelte({ configFile: false, extensions: ['.svelte', '.svx'] }),
		];
		server = await createServer({
			root,
			configFile: false,
			logLevel: 'silent',
			appType: 'custom',
			cacheDir: join(root, '.vite'),
			optimizeDeps: { noDiscovery: true, include: [] },
			server: { middlewareMode: true, hmr: false, watch: null },
			plugins,
		});
	});

	afterAll(async () => {
		await server?.close();
		rmSync(root, { recursive: true, force: true });
	});

	const path = (file: string) => normalizePath(join(root, file));

	test('reads and resolves for plugins, and a change to what they read compiles the document again', async () => {
		const ssr = server.environments.ssr;
		const first = await ssr.transformRequest('/src/post.svx');
		expect(first!.code).toContain('title="First"');
		const data_id = '\0mdsvex:data:' + path('src/post.svx') + '.js';
		await ssr.pluginContainer.load(data_id);
		// a module for the ?data import, as an import of it makes one
		await ssr.moduleGraph.ensureEntryFromUrl(data_id);

		const file = path('src/terms.txt');
		writeFileSync(file, 'Second\n');
		ssr.moduleGraph.onFileChange(file);
		const hot = plugins[0][0].hotUpdate as Function;
		const modules = await hot.call(
			{ environment: ssr },
			{
				type: 'update',
				file,
				timestamp: Date.now(),
				modules: [],
				read: async () => 'Second\n',
				server,
			}
		);
		const ids = (modules ?? []).map((m: any) => m.id);
		expect(ids).toContain(path('src/post.svx'));
		expect(ids).toContain(data_id);
		const again = await ssr.transformRequest('/src/post.svx');
		expect(again!.code).toContain('title="Second"');
	});
});
