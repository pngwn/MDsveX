#!/usr/bin/env node

import { access, readdir, readFile, writeFile } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const testsRoot = join(__dirname, '..', 'tests');
const parserEntry = resolve(__dirname, '../../parse/src/main.ts');
const require = createRequire(import.meta.url);

const { build } = require('esbuild');
let parserModulePromise;

async function loadParserModule() {
	if (!parserModulePromise) {
		parserModulePromise = (async () => {
			const { outputFiles } = await build({
				entryPoints: [parserEntry],
				bundle: true,
				platform: 'node',
				format: 'esm',
				write: false,
				target: 'es2020',
				logLevel: 'silent',
			});
			const source = outputFiles[0]?.text ?? '';
			const dataUrl = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
			return import(dataUrl);
		})();
	}
	return parserModulePromise;
}

async function* walkAstFiles(directory) {
	const entries = await readdir(directory, { withFileTypes: true });
	for (const entry of entries) {
		const fullPath = join(directory, entry.name);
		if (entry.isDirectory()) {
			yield* walkAstFiles(fullPath);
		} else if (entry.isFile() && entry.name === 'ast.js') {
			yield fullPath;
		}
	}
}

function mapTokenKindToNodeKind(tokenKind, nodeKinds, tokenKinds) {
	switch (tokenKind) {
		case tokenKinds.text:
			return nodeKinds.paragraph;
		case tokenKinds.html:
			return nodeKinds.html;
		case tokenKinds.heading:
			return nodeKinds.heading;
		case tokenKinds.mustache:
			return nodeKinds.mustache;
		case tokenKinds.code_fence:
			return nodeKinds.code_fence;
		case tokenKinds.line_break:
			return nodeKinds.line_break;
		default:
			return null;
	}
}

function escapeValue(value) {
	return value
		.replace(/\\/g, '\\\\')
		.replace(/\t/g, '\\t')
		.replace(/\r/g, '\\r')
		.replace(/\n/g, '\\n');
}

function buildNodeTokenMap(arena, tokens, nodeKinds, tokenKinds) {
	const buckets = new Map();
	for (let index = 0; index < tokens.size; index += 1) {
		const tokenKind = tokens.kind_at(index);
		const nodeKind = mapTokenKindToNodeKind(tokenKind, nodeKinds, tokenKinds);
		if (nodeKind === null) {
			continue;
		}
		const start = tokens.start_at(index);
		const end = tokens.end_at(index);
		const key = `${nodeKind}:${start}:${end}`;
		if (!buckets.has(key)) {
			buckets.set(key, []);
		}
		buckets.get(key).push({
			extra: tokens.extra_at(index),
			valueStart: tokens.value_start_at(index),
			valueEnd: tokens.value_end_at(index),
		});
	}

	const nodeTokens = new Map();
	for (let index = 0; index < arena.size; index += 1) {
		const kind = arena.get_kind(index);
		if (kind === nodeKinds.root || kind === nodeKinds.text) {
			continue;
		}
		const start = arena.get_start(index);
		const end = arena.get_end(index);
		const key = `${kind}:${start}:${end}`;
		const bucket = buckets.get(key);
		if (bucket && bucket.length > 0) {
			nodeTokens.set(index, bucket.shift());
		}
	}
	return nodeTokens;
}

function describeNode(index, arena, nodeTokens, nodeKinds, source) {
	const kind = arena.get_kind(index);
	switch (kind) {
		case nodeKinds.root:
			return 'root';
		case nodeKinds.paragraph:
			return 'paragraph';
		case nodeKinds.heading: {
			const token = nodeTokens.get(index);
			const level = token ? token.extra : arena.get_payload(index);
			return `heading(${level})`;
		}
		case nodeKinds.text: {
			const value = source.slice(arena.get_start(index), arena.get_end(index));
			return `text(${escapeValue(value)})`;
		}
		case nodeKinds.html: {
			const value = source.slice(arena.get_start(index), arena.get_end(index));
			return `html(${escapeValue(value)})`;
		}
		case nodeKinds.mustache: {
			const token = nodeTokens.get(index);
			const raw = token
				? source.slice(token.valueStart, token.valueEnd)
				: source.slice(arena.get_start(index), arena.get_end(index));
			return `mustache(${escapeValue(raw)})`;
		}
		case nodeKinds.code_fence: {
			const token = nodeTokens.get(index);
			if (token) {
				const content = source.slice(token.valueStart, token.valueEnd);
				const escaped = escapeValue(content);
				return escaped.length > 0 ? `code_fence(${escaped})` : 'code_fence';
			}
			return 'code_fence';
		}
		case nodeKinds.line_break:
			return 'line_break';
		default:
			return nodeKinds[kind] ?? `node_${kind}`;
	}
}

function formatAst(markdown, parser) {
	const { parse_markdown_svelte, node_kind: nodeKinds, token_kind: tokenKinds } = parser;
	const { arena, root, tokens } = parse_markdown_svelte(markdown);
	const children = Array.from({ length: arena.size }, () => []);
	for (let index = 0; index < arena.size; index += 1) {
		const parent = arena.get_parent(index);
		if (parent >= 0) {
			children[parent].push(index);
		}
	}
	for (const list of children) {
		list.sort((a, b) => {
			const byStart = arena.get_start(a) - arena.get_start(b);
			return byStart !== 0 ? byStart : a - b;
		});
	}

	const nodeTokens = buildNodeTokenMap(arena, tokens, nodeKinds, tokenKinds);
	const lines = [];
	const visit = (index, depth) => {
		lines.push(`${'\t'.repeat(depth)}${describeNode(index, arena, nodeTokens, nodeKinds, markdown)}`);
		for (const child of children[index]) {
			visit(child, depth + 1);
		}
	};
	visit(root, 0);
	return lines.join('\n') + '\n';
}

async function main() {
	const parser = await loadParserModule();
	let generated = 0;
	for await (const astPath of walkAstFiles(testsRoot)) {
		const directory = dirname(astPath);
		const txtPath = join(directory, 'ast.txt');
		try {
			await access(txtPath, fsConstants.F_OK);
			continue;
		} catch (error) {
			// File missing, continue as expected.
		}

		const inputPath = join(directory, 'input.md');
		let markdown;
		try {
			markdown = await readFile(inputPath, 'utf8');
		} catch (error) {
			console.warn(`Skipping ${relative(process.cwd(), directory)} (missing input.md)`);
			continue;
		}

		const output = formatAst(markdown, parser);
		await writeFile(txtPath, output, 'utf8');
		generated += 1;
		console.log(`Generated ${relative(process.cwd(), txtPath)}`);
	}

	if (generated === 0) {
		console.log('All ast.txt files already exist.');
	} else {
		console.log(`Created ${generated} ast.txt file(s).`);
	}
}

await main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
