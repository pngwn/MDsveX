import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import remapping from '@ampproject/remapping';
import { encode } from '@jridgewell/sourcemap-codec';
import type { SourceMapMappings } from '@jridgewell/sourcemap-codec';
import { describe, expect, test } from 'vitest';

import { CompilerSession, mdsvex } from '../src/main';
import type { ParsePlugin } from '../src/main';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = resolve(HERE, '../../parse/test/fixtures');
// svelte is a dependency of the render package, not of this one
const svelte = createRequire(resolve(HERE, '../../render/package.json'))(
	'svelte/compiler'
);

function fixture_files(dir: string): string[] {
	const files: string[] = [];
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) files.push(...fixture_files(path));
		else if (/\.(md|svx)$/.test(entry.name)) files.push(path);
	}
	return files.sort();
}

const ID = '/src/routes/page.svx';

type CompileMap = {
	version: 3;
	sources: string[];
	names: string[];
	mappings: string | SourceMapMappings;
};
type MakeMap = (html: string) => CompileMap | null;

function svelte_map(options: Record<string, unknown>): MakeMap {
	return (html) => {
		try {
			return svelte.compile(html, { filename: 'page.svx', ...options }).js.map;
		} catch {
			return null;
		}
	};
}

/** every column of every html line and some past the end */
function dense_map(encoded: boolean): MakeMap {
	return (html) => {
		const text = html.split('\n');
		const lines: SourceMapMappings = [];
		let line: SourceMapMappings[number] = [];
		for (let l = 0; l < text.length + 2; l++) {
			const width = (text[l]?.length ?? 3) + 1;
			for (let c = 0; c <= width; c++) {
				line.push([line.length, 0, l, c]);
				if (line.length === 40) {
					lines.push(line);
					line = [];
				}
			}
		}
		lines.push(line);
		return {
			version: 3,
			sources: ['page.svx'],
			names: [],
			mappings: encoded ? encode(lines) : lines,
		};
	};
}

/** the post transform output if pre stored the whole map */
function eager(raw: string, compile_map: CompileMap, plugins?: ParsePlugin[]) {
	const { map } = new CompilerSession().compile_v3(raw, ID, plugins);
	const chained = remapping([compile_map as never, map as never], () => null);
	if (chained.sourcesContent) {
		chained.sourcesContent = chained.sourcesContent.map(() => raw);
	}
	const base64 = Buffer.from(JSON.stringify(chained)).toString('base64');
	return `JS\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,${base64}\n`;
}

function transform(raw: string, make: MakeMap, plugins?: ParsePlugin[]) {
	const [pre, post] = mdsvex({ parsePlugins: plugins }) as any[];
	const html = pre.transform(raw, ID).code as string;
	const compile_map = make(html);
	if (compile_map === null) return null;
	const out = post.transform.call(
		{ getCombinedSourcemap: () => compile_map },
		'JS',
		ID
	);
	return { out: out?.code as string | undefined, compile_map };
}

const variants: [string, (s: string) => string][] = [
	['lf', (s) => s],
	['crlf', (s) => s.replace(/\n/g, '\r\n')],
	['cr', (s) => s.replace(/\n/g, '\r')],
];

const maps: [string, MakeMap][] = [
	['svelte client', svelte_map({ generate: 'client' })],
	['svelte server', svelte_map({ generate: 'server' })],
	['svelte dev', svelte_map({ generate: 'client', dev: true })],
	['dense decoded', dense_map(false)],
	['dense encoded', dense_map(true)],
];

describe('vite plugin sourcemap', () => {
	const files = fixture_files(FIXTURES);

	for (const [variant, to] of variants) {
		for (const [name, make] of maps) {
			test(`chains like the eager map (${variant}, ${name})`, () => {
				let chained = 0;
				// every fifth fixture keeps the svelte compiles quick
				for (let i = 0; i < files.length; i += 5) {
					const raw = to(readFileSync(files[i], 'utf8'));
					const result = transform(raw, make);
					if (result === null || raw === '') continue;
					expect(result.out, files[i]).toBe(eager(raw, result.compile_map));
					chained++;
				}
				expect(chained).toBeGreaterThan(100);
			});
		}
	}

	test('chains like the eager map with parse plugins', () => {
		const plugin: ParsePlugin = {
			heading: {
				parse(node) {
					node.attrs.id = 'from-plugin';
				},
			},
		};
		for (const raw of ['# a\n\ntext *b*\n', '# a\r\n\r\ntext {x}\r\n']) {
			for (const [, make] of maps) {
				const result = transform(raw, make, [plugin])!;
				expect(result.out).toBe(eager(raw, result.compile_map, [plugin]));
			}
		}
	});

	test('falls back to the full map for mappings it cannot read', () => {
		const raw = '# a\n\ntext {x}\n';
		const cases = [
			'A!AA;AACA', // a stray character
			'AA;AACA', // a short segment
			'AAAAAA,CACA;AACA', // a sixth field
			'AABA', // a negative zero line
			'AACA,ACBA', // a second source
		];
		const outcome = (run: () => string | undefined) => {
			try {
				return run();
			} catch (error) {
				return String(error);
			}
		};
		for (const mappings of cases) {
			const make: MakeMap = () => ({
				version: 3,
				sources: ['page.svx'],
				names: [],
				mappings,
			});
			const compile_map = make('')!;
			expect(
				outcome(() => transform(raw, make)!.out),
				mappings
			).toBe(outcome(() => eager(raw, compile_map)));
		}
	});

	test('skips empty documents and empty maps', () => {
		expect(transform('', dense_map(true))!.out).toBeUndefined();
		const make: MakeMap = () => ({
			version: 3,
			sources: ['page.svx'],
			names: [],
			mappings: '',
		});
		expect(transform('# a\n', make)!.out).toBeUndefined();
	});
});
