import { readdirSync, readFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'vitest';

import { parse_markdown_svelte } from '../src/main';
import { print_ast } from './print';

const THIS_DIR = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = resolve(THIS_DIR, 'fixtures');
const SNAPSHOT_DIR = resolve(THIS_DIR, 'snapshots');

function snapshot_for(input: string): string {
	const { nodes } = parse_markdown_svelte(input);
	return print_ast(nodes, input);
}

function numeric_sort(a: string, b: string): number {
	const na = parseInt(a, 10);
	const nb = parseInt(b, 10);
	if (!isNaN(na) && !isNaN(nb)) return na - nb;
	return a.localeCompare(b);
}

// ---------------------------------------------------------------------------
// 1. Markdown fixtures
// ---------------------------------------------------------------------------

describe('markdown fixtures', () => {
	const dir = join(FIXTURE_DIR, 'markdown');
	const files = readdirSync(dir)
		.filter((f) => f.endsWith('.md'))
		.sort();

	for (const file of files) {
		const name = basename(file, '.md');
		test(name, async () => {
			const input = readFileSync(join(dir, file), 'utf8');
			const ast = snapshot_for(input);
			await expect(ast).toMatchFileSnapshot(
				join(SNAPSHOT_DIR, 'markdown', `${name}.snap.ast`),
				`Input: \n${input}\n\n${ast}`
			);
		});
	}
});

// ---------------------------------------------------------------------------
// 2. Hybrid fixtures
// ---------------------------------------------------------------------------

describe('hybrid fixtures', () => {
	const dir = join(FIXTURE_DIR, 'hybrid');
	const files = readdirSync(dir)
		.filter((f) => f.endsWith('.svx'))
		.sort();

	for (const file of files) {
		const name = basename(file, '.svx');
		test(name, async () => {
			const input = readFileSync(join(dir, file), 'utf8');
			const ast = snapshot_for(input);
			await expect(ast).toMatchFileSnapshot(
				join(SNAPSHOT_DIR, 'hybrid', `${name}.snap.ast`),
				`Input: \n${input}\n\n${ast}`			);
		});
	}
});

// ---------------------------------------------------------------------------
// 3. PFM-tests fixtures (implemented categories only)
// ---------------------------------------------------------------------------

const PFM_CATEGORIES = [
	'atx_headings',
	'autolinks',
	'backslash_escapes',
	'blank_lines',
	'block_quotes',
	'code_spans',
	'emphasis_and_strong_emphasis',
	'fenced_code_blocks',
	'hard_line_breaks',
	'html',
	'images',
	'link_reference_definitions',
	'links',
	'list_items',
	'lists',
	'paragraphs',
	'soft_line_breaks',
	'thematic_breaks',
	'generic_directives',
	'frontmatter',
	'imports',
	'setext_headings',
	'tabs',
	'textual_content',
	'precedence',
	'inlines',
];

describe('pfm-tests fixtures', () => {
	const pfm_root = join(FIXTURE_DIR, 'pfm');

	for (const category of PFM_CATEGORIES) {
		describe(category, () => {
			const cat_dir = join(pfm_root, category);
			const files = readdirSync(cat_dir)
				.filter((f) => f.endsWith('.md'))
				.sort(numeric_sort);

			for (const file of files) {
				const id = basename(file, '.md');
				test(id, async () => {
					const input = readFileSync(join(cat_dir, file), 'utf8');
					const ast = snapshot_for(input);
					await expect(ast).toMatchFileSnapshot(
						join(SNAPSHOT_DIR, 'pfm', category, `${id}.snap.ast`),
						`Input: \n${input}\n\n${ast}`					);
				});
			}
		});
	}
});

// ---------------------------------------------------------------------------
// 4. Svelte fixtures
// ---------------------------------------------------------------------------

function find_svelte_files(dir: string, base: string = ''): string[] {
	const entries = readdirSync(dir, { withFileTypes: true });
	const results: string[] = [];
	for (const entry of entries) {
		const rel = base ? `${base}/${entry.name}` : entry.name;
		if (entry.isDirectory()) {
			results.push(...find_svelte_files(join(dir, entry.name), rel));
		} else if (entry.name.endsWith('.svelte')) {
			results.push(rel);
		}
	}
	return results;
}

describe('svelte fixtures', () => {
	const svelte_root = join(FIXTURE_DIR, 'svelte');
	const files = find_svelte_files(svelte_root).sort();

	for (const rel of files) {
		test(rel, async () => {
			const input = readFileSync(join(svelte_root, rel), 'utf8');
			const ast = snapshot_for(input);
			const snap_path = rel.replace(/\.svelte$/, '.snap.ast');
			await expect(ast).toMatchFileSnapshot(
				join(SNAPSHOT_DIR, 'svelte', snap_path),
				`Input: \n${input}\n\n${ast}`			);
		});
	}
});
