import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { format } from 'prettier';
import { describe, expect, test } from 'vitest';

import plugin from '../src/index';
import { shape } from './shape';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '../../..');

function files_in(dir: string, exts: string[], out: string[] = []): string[] {
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		if (entry.name === 'node_modules' || entry.name === 'dist') continue;
		const path = join(dir, entry.name);
		if (entry.isDirectory()) files_in(path, exts, out);
		else if (exts.some((ext) => entry.name.endsWith(ext))) out.push(path);
	}
	return out;
}

const CORPUS = [
	...new Set([
		...files_in(join(REPO, 'packages/parse/test/fixtures/pfm'), ['.md']),
		...files_in(join(REPO, 'packages/parse/test/fixtures/markdown'), ['.md']),
		...files_in(join(REPO, 'packages'), ['.svx', '.svtext']),
		...files_in(join(REPO, 'language-tools/vscode-pfm/test-fixture'), ['.pfm']),
	]),
];

function svx(source: string): Promise<string> {
	return format(source, { parser: 'mdsvex', plugins: [plugin] });
}

describe('corpus', () => {
	test('has documents', () => {
		expect(CORPUS.length).toBeGreaterThan(900);
	});

	test.each(CORPUS.map((path) => [relative(REPO, path), path]))(
		'%s',
		async (_, path) => {
			const source = readFileSync(path, 'utf8').replace(/\r\n?/g, '\n');
			const once = await svx(source);
			expect(shape(once), 'formatting changed what the document means').toBe(
				shape(source)
			);
			expect(await svx(once), 'a second format changed the output').toBe(once);
		}
	);
});
