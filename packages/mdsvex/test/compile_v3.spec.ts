import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'vitest';
import { mappings_to_v3 } from '@mdsvex/render/sourcemap';

import { compile, CompilerSession } from '../src/main';
import type { ParsePlugin } from '../src/main';

const FIXTURES = resolve(
	dirname(fileURLToPath(import.meta.url)),
	'../../parse/test/fixtures'
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

/** what the vite plugin stored before compile_v3, from the Mapping objects. */
function object_path(raw: string, plugins?: ParsePlugin[]) {
	const result = compile(raw, { sourcemap: true, parsePlugins: plugins });
	return {
		code: result.code,
		map: mappings_to_v3(result.mappings!, raw, result.code, ID),
	};
}

const variants: [string, (s: string) => string][] = [
	['lf', (s) => s],
	['crlf', (s) => s.replace(/\n/g, '\r\n')],
	['cr', (s) => s.replace(/\n/g, '\r')],
	['mixed', (s) => s.replace(/\n\n/g, '\r\n\n').replace(/\n#/g, '\r#')],
];

describe('CompilerSession.compile_v3', () => {
	const files = fixture_files(FIXTURES);

	test('finds the parser fixtures', () => {
		expect(files.length).toBeGreaterThan(100);
	});

	for (const [name, to] of variants) {
		test(`equals mappings_to_v3 over compile for every fixture (${name})`, () => {
			const session = new CompilerSession();
			for (const file of files) {
				const raw = to(readFileSync(file, 'utf8'));
				const got = session.compile_v3(raw, ID);
				const want = object_path(raw);
				expect(got.code, file).toBe(want.code);
				expect(JSON.stringify(got.map), file).toBe(JSON.stringify(want.map));
			}
		});
	}

	test('matches the object path with parse plugins', () => {
		const plugin: ParsePlugin = {
			heading: {
				parse(node) {
					node.attrs.id = 'from-plugin';
				},
			},
		};
		const session = new CompilerSession();
		for (const raw of ['# a\n\ntext *b*\n', '# a\r\n\r\ntext\r\n']) {
			const got = session.compile_v3(raw, ID, [plugin]);
			expect(got.code).toContain('from-plugin');
			expect(JSON.stringify(got)).toBe(
				JSON.stringify(object_path(raw, [plugin]))
			);
		}
	});

	test('interleaves with compile on one session', () => {
		const session = new CompilerSession();
		const docs = ['# one\n\n{x}\n', 'plain\r\ntext\r\n', '', '| a |\n| - |\n'];
		for (let pass = 0; pass < 3; pass++) {
			for (const raw of docs) {
				const mapped = session.compile(raw, { sourcemap: true });
				expect(mapped).toEqual(compile(raw, { sourcemap: true }));
				expect(JSON.stringify(session.compile_v3(raw, ID))).toBe(
					JSON.stringify(object_path(raw))
				);
			}
		}
	});
});
