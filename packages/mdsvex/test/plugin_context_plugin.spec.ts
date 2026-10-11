import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { svelte } from '@sveltejs/vite-plugin-svelte';
import { createLogger, createServer, normalizePath } from 'vite';
import type { ViteDevServer } from 'vite';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { mdsvex } from '../src/main';
import type { Bundle, MdsvexOptions } from '../src/main';
import { toc } from './toc_plugin';

const HERE = dirname(fileURLToPath(import.meta.url));
const ID = '/src/routes/page.svx';

const DOC = '# Guide\n\n## Set up\n\n#### Deep\n';

/** what every document told its handlers, by the text of its first heading */
function spy(seen: Record<string, unknown>[]): Bundle {
	return {
		name: 'spy',
		parse: {
			heading: {
				parse: (node, ctx) => () => {
					if (node.depth !== 1) return;
					seen.push({
						title: node.text_content,
						filename: ctx.filename,
						frontmatter: ctx.frontmatter,
					});
				},
			},
		},
	};
}

function plugin(options: MdsvexOptions = {}) {
	const [pre] = mdsvex(options) as any[];
	const warned: unknown[][] = [];
	const ctx = {
		addWatchFile() {},
		warn: (...args: unknown[]) => warned.push(args),
	};
	const transform = (code: string, id = ID) =>
		pre.transform.call(ctx, code, id);
	return { transform, warned };
}

describe('vite plugin: the context of parse plugins', () => {
	test('a plugin warning is reported with the position of its node', () => {
		const { transform, warned } = plugin({
			heading_ids: true,
			plugins: [toc()],
		});
		expect(transform(DOC).code).toContain('<h4 id="deep">Deep</h4>');
		expect(warned).toEqual([
			['a level 4 heading follows a level 2 heading', { line: 5, column: 0 }],
		]);
		// each compile of a document reports again, as a build would
		transform('# Guide\n\n### Three\n');
		expect(warned.length).toBe(2);
		transform('# Guide\n\n## Two\n');
		expect(warned.length).toBe(2);
	});

	test('ctx.filename is the id without its query', () => {
		const seen: Record<string, unknown>[] = [];
		const { transform } = plugin({ plugins: [spy(seen)] });
		transform('# one\n');
		transform('# two\n', '/src/routes/other.svx?template=blog');
		expect(seen.map((s) => s.filename)).toEqual([ID, '/src/routes/other.svx']);
	});

	test('ctx.frontmatter goes through frontmatter.parse', () => {
		const seen: Record<string, unknown>[] = [];
		const { transform } = plugin({
			plugins: [spy(seen)],
			frontmatter: { parse: (raw) => ({ raw }) },
		});
		const out = transform('---\nanything\n---\n\n# one\n');
		expect(seen[0].frontmatter).toEqual({ raw: 'anything\n' });
		expect(out.code).toContain(
			'export const metadata = {"raw":"anything\\n"};'
		);
	});
});

describe('vite plugin: a dev server', () => {
	let root: string;
	let server: ViteDevServer;
	const seen: Record<string, unknown>[] = [];
	const warned: string[] = [];

	beforeAll(async () => {
		root = mkdtempSync(join(HERE, '.tmp-context-'));
		const files: Record<string, string> = {
			'package.json': JSON.stringify({
				name: 'app',
				private: true,
				type: 'module',
			}),
			'src/doc.svx': '---\ntitle: Hi\n---\n\n' + DOC,
		};
		for (const [path, content] of Object.entries(files)) {
			mkdirSync(dirname(join(root, path)), { recursive: true });
			writeFileSync(join(root, path), content);
		}
		const logger = createLogger('silent');
		logger.warn = (message) => void warned.push(message);
		server = await createServer({
			root,
			configFile: false,
			customLogger: logger,
			appType: 'custom',
			cacheDir: join(root, '.vite'),
			optimizeDeps: { noDiscovery: true, include: [] },
			server: { middlewareMode: true, hmr: false, watch: null },
			plugins: [
				mdsvex({ heading_ids: true, plugins: [toc(), spy(seen)] }),
				svelte({ configFile: false, extensions: ['.svelte', '.svx'] }),
			],
		});
	});

	afterAll(async () => {
		await server?.close();
		rmSync(root, { recursive: true, force: true });
	});

	test('the handlers get the path vite knows the document by', async () => {
		const result =
			await server.environments.client.transformRequest('/src/doc.svx');
		expect(result?.code).toContain('Deep');
		expect(seen).toEqual([
			{
				title: 'Guide',
				// compared as vite normalizes it, a windows path has backslashes
				filename: normalizePath(join(root, 'src/doc.svx')),
				frontmatter: { title: 'Hi' },
			},
		]);
	});

	test('and vite logs the warning with the file and the position', () => {
		const logged = warned.filter((m) => m.includes('a level 4 heading'));
		expect(logged.length).toBe(1);
		expect(logged[0]).toContain('a level 4 heading follows a level 2 heading');
		// the document has four lines of frontmatter ahead of DOC
		expect(normalizePath(logged[0])).toContain('src/doc.svx:9:0');
	});
});
