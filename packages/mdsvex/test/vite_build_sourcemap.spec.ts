import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { TraceMap, originalPositionFor } from '@jridgewell/trace-mapping';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { build, createServer } from 'vite';
import type { Rollup } from 'vite';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { mdsvex } from '../src/main';

const HERE = dirname(fileURLToPath(import.meta.url));

// frontmatter, markdown and a script after it move every line and column of
// the html away from the markdown
const DOC = [
	'---',
	'title: probe',
	'---',
	'',
	'# A *heading* that renders longer',
	'',
	'Some **bold** text with a [link](https://example.com)',
	'spanning lines, and `code`.',
	'',
	'- one',
	'- two',
	'',
	'<script>',
	'  let n = $state(0);',
	'  function first() { console.log("probe-alpha", n); }',
	'</script>',
	'',
	'> quoted {n} <i onclick={first}>x</i>',
	'',
	'<button onclick={() => { n++; console.log("probe-beta"); }}>go {n}</button>',
	'',
].join('\n');

function plugins() {
	return [
		mdsvex(),
		svelte({ configFile: false, extensions: ['.svelte', '.svx'] }),
	];
}

/** where the map traces the first marker in code */
function trace(code: string, map: any, marker: string) {
	const offset = code.indexOf(marker);
	expect(offset).toBeGreaterThan(-1);
	const lines = code.slice(0, offset).split('\n');
	const at = originalPositionFor(new TraceMap(map), {
		line: lines.length,
		column: lines[lines.length - 1].length,
	});
	return {
		source: at.source?.split('/').pop(),
		line: at.line,
		column: at.column,
	};
}

describe('source maps of a document through vite', () => {
	let root: string;

	beforeAll(() => {
		root = mkdtempSync(join(HERE, '.tmp-vite-map-'));
		writeFileSync(join(root, 'doc.svx'), DOC);
		writeFileSync(
			join(root, 'main.js'),
			"import { mount } from 'svelte';\nimport Doc from './doc.svx';\nmount(Doc, { target: document.body });\n"
		);
	});

	afterAll(() => {
		rmSync(root, { recursive: true, force: true });
	});

	test('a build maps the emitted code to the markdown', async () => {
		const warnings: string[] = [];
		const out = (await build({
			root,
			configFile: false,
			logLevel: 'silent',
			plugins: plugins(),
			build: {
				write: false,
				sourcemap: true,
				rollupOptions: {
					input: join(root, 'main.js'),
					onwarn: (w) => void warnings.push(w.message),
				},
			},
		})) as Rollup.RollupOutput;
		const chunk = out.output.find(
			(o): o is Rollup.OutputChunk => o.type === 'chunk' && o.isEntry
		)!;
		const map = chunk.map!;
		expect(trace(chunk.code, map, 'probe-alpha')).toEqual({
			source: 'doc.svx',
			line: 15,
			column: 33,
		});
		expect(trace(chunk.code, map, 'probe-beta')).toMatchObject({
			source: 'doc.svx',
			line: 20,
		});
		const doc = map.sources.findIndex((s) => s.endsWith('doc.svx'));
		expect(map.sourcesContent?.[doc]).toBe(DOC);
		expect(warnings.filter((w) => w.includes('Sourcemap'))).toEqual([]);
	}, 60_000);

	test('dev maps the served module to the markdown', async () => {
		const server = await createServer({
			root,
			configFile: false,
			logLevel: 'silent',
			appType: 'custom',
			cacheDir: join(root, '.vite'),
			optimizeDeps: { noDiscovery: true, include: [] },
			plugins: plugins(),
			server: { middlewareMode: true, hmr: false, watch: null },
		});
		try {
			const out = (await server.transformRequest('/doc.svx'))!;
			const inline = out.code.match(/base64,([A-Za-z0-9+/=]+)\s*$/);
			expect(inline).not.toBeNull();
			const map = JSON.parse(Buffer.from(inline![1], 'base64').toString());
			expect(trace(out.code, map, 'probe-alpha')).toEqual({
				source: 'doc.svx',
				line: 15,
				column: 33,
			});
			expect(trace(out.code, map, 'probe-beta')).toMatchObject({
				source: 'doc.svx',
				line: 20,
			});
		} finally {
			await server.close();
		}
	}, 60_000);
});
