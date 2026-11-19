import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { format } from 'prettier';
import type { Options } from 'prettier';
import { afterAll, describe, expect, test } from 'vitest';

import plugin from '../src/index';

const SOURCE = '---\ntitle:   hi\n---\n\n# a\n';
const FORMATTED = '---\ntitle: hi\n---\n\n# a\n';

const dirs: string[] = [];
afterAll(() => {
	for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

/** a project with a manifest and a document two folders down */
function project(manifest: object | null, config = false): string {
	const root = mkdtempSync(join(tmpdir(), 'mdsvex-prettier-'));
	dirs.push(root);
	if (manifest !== null) {
		mkdirSync(join(root, 'node_modules/.mdsvex'), { recursive: true });
		writeFileSync(
			join(root, 'node_modules/.mdsvex/manifest.json'),
			JSON.stringify(manifest)
		);
	}
	mkdirSync(join(root, 'src/routes'), { recursive: true });
	if (config) writeFileSync(join(root, 'src/mdsvex.config.json'), '{}');
	return join(root, 'src/routes/page.svx');
}

function svx(
	filepath: string | undefined,
	options: Options = {}
): Promise<string> {
	return format(SOURCE, {
		parser: 'mdsvex',
		plugins: [plugin],
		filepath,
		...options,
	});
}

describe('frontmatter', () => {
	test('is formatted when the manifest has no frontmatter parser', async () => {
		const file = project({ version: 1, frontmatter_parse: false });
		expect(await svx(file)).toBe(FORMATTED);
	});

	test('is kept when the project parses frontmatter itself', async () => {
		const file = project({ version: 1, frontmatter_parse: true });
		expect(await svx(file)).toBe(SOURCE);
	});

	test('a manifest of another version is passed over', async () => {
		const file = project({ version: 99, frontmatter_parse: true });
		expect(await svx(file)).toBe(FORMATTED);
	});

	test('a json config nearer the document ends the search', async () => {
		const file = project({ version: 1, frontmatter_parse: true }, true);
		expect(await svx(file)).toBe(FORMATTED);
	});

	test('without a file or a manifest it is formatted', async () => {
		expect(await svx(undefined)).toBe(FORMATTED);
		expect(await svx(project(null))).toBe(FORMATTED);
	});

	test('mdsvexFrontmatter overrides the manifest', async () => {
		const custom = project({ version: 1, frontmatter_parse: true });
		const plain = project({ version: 1, frontmatter_parse: false });
		expect(await svx(custom, { mdsvexFrontmatter: 'yaml' } as Options)).toBe(
			FORMATTED
		);
		expect(await svx(plain, { mdsvexFrontmatter: 'keep' } as Options)).toBe(
			SOURCE
		);
	});
});
