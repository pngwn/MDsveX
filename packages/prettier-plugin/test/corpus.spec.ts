import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { format } from 'prettier';
import { describe, expect, test } from 'vitest';

import plugin from '../src/index';
import { parse } from '../src/ast';
import type { SvxNode } from '../src/ast';

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
	...files_in(join(REPO, 'packages/parse/test/fixtures/pfm'), ['.md']),
	...files_in(join(REPO, 'packages/parse/test/fixtures/markdown'), ['.md']),
	...files_in(join(REPO, 'packages/parse/test/fixtures/hybrid'), ['.svx']),
	...files_in(join(REPO, 'packages'), ['.svx', '.svtext']),
	...files_in(join(REPO, 'language-tools/vscode-pfm/test-fixture'), ['.pfm']),
];

function svx(source: string): Promise<string> {
	return format(source, { parser: 'mdsvex', plugins: [plugin] });
}

// offsets into the source, which formatting moves
const OFFSET_META = new Set(['info_start', 'info_end']);
// whose source is printed as it is
const VERBATIM = new Set([
	'code_fence',
	'code_span',
	'mustache',
	'svelte_tag',
	'html_comment',
	'frontmatter',
	'import_statement',
	'raw',
]);

/**
 * the tree as lines of text without offsets, two documents whose shapes match
 * render the same, the spaces that end a line are left out as they mean nothing
 */
function shape(source: string): string {
	const lines: string[] = [];
	const walk = (node: SvxNode, depth: number) => {
		let line = '  '.repeat(depth) + node.type;
		if (node.meta) {
			const meta = Object.entries(node.meta).filter(([k]) => !OFFSET_META.has(k));
			if (meta.length > 0) line += ' ' + JSON.stringify(Object.fromEntries(meta));
		}
		if (VERBATIM.has(node.type)) {
			line += ' ' + JSON.stringify(source.slice(node.start, node.end).replace(/[ \t]+$/, ''));
			lines.push(line);
			return;
		}
		lines.push(line);
		const children = node.children;
		for (let i = 0; i < children.length; i++) {
			const child = children[i];
			if (child.type !== 'text') {
				walk(child, depth + 1);
				continue;
			}
			// texts split and merge as offsets move
			let value = '';
			while (i < children.length && children[i].type === 'text') {
				value += source.slice(children[i].value_start, children[i].value_end);
				i++;
			}
			i--;
			// the text of a revoked tag holds its line ends
			value = value.replace(/[ \t]+\n/g, '\n');
			const next = children[i + 1]?.type;
			if (next === undefined || next === 'soft_break' || next === 'line_break') {
				value = value.replace(/[ \t]+$/, '');
			}
			if (value === '') continue;
			lines.push('  '.repeat(depth + 1) + 'text ' + JSON.stringify(value));
		}
	};
	walk(parse(source), 0);
	return lines.join('\n');
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
