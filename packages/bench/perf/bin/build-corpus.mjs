#!/usr/bin/env node
// regenerate the committed corpus and its manifest, --check exits 1 when it is stale
//
//   node packages/bench/perf/bin/build-corpus.mjs [--check]
//
// the parser never reports errors, so validity is a lint for commonmark constructs pfm removed or reads differently

import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

import { corpus_dir, FAMILIES, hash_text } from '../corpus.mjs';
import { local_root } from '../paths.mjs';
import { load_arm } from '../workloads.mjs';

const check_only = process.argv.includes('--check');

const REAL_SOURCES = [
	'README.md',
	'PFM.md',
	'PLAN.md',
	'packages/mdsvex/README.md',
	'packages/migrate/README.md',
	'packages/template/README.md',
	'packages/svast/README.md',
	'packages/parse/PLUGINS.md',
	'packages/parse/WIRE_FORMAT.md',
	'packages/bench/README.md',
	'packages/bench/parser-performance.md',
	'packages/bench/NEXT_CORE_PERFORMANCE.md',
	'language-tools/ARCHITECTURE.md',
	'plugins/REMARK_PLUGINS.md',
	'packages/site/src/routes/_docs.svtext',
	'packages/site/src/components/_cheatsheet.svtext',
	'packages/site/src/components/Cheatsheet.svx',
	'packages/bench/benchmarks/fixture.md',
	'packages/bench/benchmarks/fixture-short.md',
	'packages/bench/benchmarks/fixture-code.md',
	'packages/bench/benchmarks/fixture-html.md',
	'packages/bench/benchmarks/fixture-tables.md',
];

const FIXTURE_DIR = 'packages/parse/test/fixtures/pfm';

const MICRO = {
	'empty.md': '',
	'heading.md': '# Getting started with mdsvex\n',
	'paragraph.md':
		'Some _emphasis_, *strong* text, `inline code`, a [link](https://mdsvex.com), ~~struck~~ and x^2^.\n',
	'component.md':
		'<Button kind="primary" on:click={save}>Save _now_</Button>\n',
	'svelte-block.md': '{#if user}\n\nWelcome back, {user.name}.\n\n{/if}\n',
	'code-fence.md': '```js\nconst answer = 42;\nconsole.log(answer);\n```\n',
	'list.md': '- first item\n- second item with `code`\n- third item\n',
	'table.md': '| name | value |\n| --- | --- |\n| one | 1 |\n| two | 2 |\n',
	'directive.md':
		':::note[Heads up](kind=info)\nPress :kbd[Ctrl] then :kbd[S] to _save_.\n:::\n',
	'import.md':
		'import Chart from "./Chart.svelte"\n\n<Chart data={points} />\n',
};

const SIZED = { '1k': 1024, '10k': 10 * 1024, '100k': 100 * 1024 };
const HUGE_BYTES = 4 * 1024 * 1024;
const SEP = '\n';

const FENCE = /^ {0,3}(`{3,}|~{3,})/;
const LIST_MARKER = /^\s{0,3}([-+*]|\d{1,9}[.)])(\s|$)/;
const DEFINITION = /^ {0,3}\[([^\]]+)\]:\s*\S/;
// raw elements keep their content verbatim through blank lines
const RAW_OPEN = /^ {0,3}<(script|style|pre|textarea)(?=[\s>]|$)/i;

function strip_code_spans(line) {
	return line.replace(/(`+)[^`]*?\1/g, (m) => ' '.repeat(m.length));
}

function lint_pfm(text) {
	const issues = [];
	const issue = (line, what) => {
		if (issues.length < 5) issues.push(`line ${line + 1}: ${what}`);
	};
	const lines = text.split('\n');
	const defs = new Set();
	const used_before_def = new Map();
	let fence = null;
	let raw = null;
	let prev = '';
	let prev_blank = true;
	let in_list = false;
	let in_html = false;

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		if (raw === null) {
			const r = RAW_OPEN.exec(line);
			if (r) raw = new RegExp(`</${r[1]}>`, 'i');
		}
		if (raw !== null) {
			if (raw.test(line)) raw = null;
			prev = line;
			prev_blank = false;
			continue;
		}
		const fm = FENCE.exec(line);
		if (fence) {
			if (
				fm &&
				fm[1][0] === fence[0] &&
				fm[1].length >= fence.length &&
				line.trim() === fm[1]
			) {
				fence = null;
			}
			prev = line;
			prev_blank = false;
			continue;
		}
		if (fm) {
			fence = fm[1];
			prev = line;
			prev_blank = false;
			continue;
		}
		const blank = line.trim() === '';
		const indent = /^[ \t]*/.exec(line)[0];

		if (/^ {0,3}<(?!\/?[a-z][\w-]*:)/i.test(line) && !blank) in_html = true;
		if (blank) in_html = false;

		if (LIST_MARKER.test(line)) in_list = true;
		else if (!blank && indent.length === 0) in_list = false;

		const prev_is_text =
			!prev_blank &&
			!/^ {0,3}(#|>|\||<|[-+*] |\d+[.)] |[-*_]{3,}\s*$)/.test(prev);
		if (/^ {0,3}(=+|-+)\s*$/.test(line) && prev_is_text) {
			issue(i, 'setext heading underline');
		}
		if (
			!blank &&
			prev_blank &&
			!in_list &&
			!in_html &&
			!/^\s*[<{]/.test(line) &&
			(indent.includes('\t') || indent.length >= 4)
		) {
			issue(i, 'indented code block');
		}
		if (!blank && /^ {0,3}>/.test(prev) && !/^ {0,3}>/.test(line)) {
			issue(i, 'lazy blockquote continuation');
		}
		if (/\S {2,}$/.test(line)) issue(i, 'trailing space hard break');

		const d = DEFINITION.exec(line);
		if (d) {
			defs.add(d[1].toLowerCase());
		} else {
			const scan = strip_code_spans(line);
			for (const m of scan.matchAll(/\[([^\]\n]+)\]\[([^\]\n]*)\]/g)) {
				const label = (m[2] || m[1]).toLowerCase();
				if (!defs.has(label) && !used_before_def.has(label)) {
					used_before_def.set(label, i);
				}
			}
			for (const m of scan.matchAll(/(^|[^\]\w:!])\[([^\]\n]+)\](?![[(:])/g)) {
				if (defs.has(m[2].toLowerCase()))
					issue(i, `shorthand reference [${m[2]}]`);
			}
		}
		prev = line;
		prev_blank = blank;
	}
	if (fence) issue(lines.length - 1, 'unclosed code fence');
	for (const [label, line] of used_before_def) {
		if (defs.has(label)) issue(line, `forward reference [${label}]`);
	}
	return issues;
}

// a piece must render the same alone as inside the concatenation, or it leaks state into its neighbours
const html_cache = new Map();
function html(text) {
	if (!html_cache.has(text)) html_cache.set(text, arm.compile(text).code);
	return html_cache.get(text);
}

function join_docs(parts) {
	return parts.map((p) => (p.endsWith('\n') ? p : `${p}\n`)).join(SEP);
}

function composes(parts) {
	return arm.compile(join_docs(parts)).code === parts.map(html).join('');
}

// the loop guard logs and bails out, a parser bug timings should not depend on
function trips_loop_guard(text) {
	const original = console.error;
	let tripped = false;
	console.error = (...args) => {
		if (String(args[0]).includes('Infinite loop')) tripped = true;
		else original(...args);
	};
	try {
		arm.parse_markdown_svelte(text);
		arm.compile(text, { sourcemap: true });
	} finally {
		console.error = original;
	}
	return tripped;
}

function problems(text) {
	const issues = lint_pfm(text);
	if (trips_loop_guard(text)) issues.unshift('parser reports an infinite loop');
	return issues;
}

const arm = await load_arm(local_root, 'local');
const files = new Map();
const excluded = [];
const add = (family, file, text, sources) =>
	files.set(`${family}/${file}`, { family, file, text, sources });

for (const [file, text] of Object.entries(MICRO)) {
	const issues = lint_pfm(text);
	if (issues.length > 0)
		throw new Error(
			`micro seed ${file} is not valid PFM: ${issues.join('; ')}`
		);
	add('micro', file, text, ['seed']);
}

function tracked(path) {
	try {
		execFileSync('git', ['ls-files', '--error-unmatch', path], {
			cwd: local_root,
			stdio: 'ignore',
		});
		return true;
	} catch {
		return false;
	}
}

const real = [];
for (const path of REAL_SOURCES) {
	if (!tracked(path)) {
		excluded.push({
			source: path,
			family: 'real',
			reason: 'not tracked by git, cannot be reproduced from a commit',
		});
		continue;
	}
	const text = readFileSync(join(local_root, path), 'utf8');
	const issues = problems(text);
	if (issues.length > 0) {
		excluded.push({ source: path, family: 'real', reason: issues.join('; ') });
		continue;
	}
	const file = path
		.replace(/^packages\//, '')
		.replace(/\.(md|svx|svtext)$/, '')
		.replace(/[/.]/g, '-')
		.toLowerCase();
	real.push({ path, file: `${file}.md`, text });
	add('real', `${file}.md`, text, [path]);
}

const numeric = (a, b) => a.localeCompare(b, 'en', { numeric: true });
for (const category of readdirSync(join(local_root, FIXTURE_DIR)).sort()) {
	const dir = join(local_root, FIXTURE_DIR, category);
	const kept = [];
	for (const name of readdirSync(dir)
		.filter((f) => f.endsWith('.md'))
		.sort(numeric)) {
		const text = readFileSync(join(dir, name), 'utf8');
		const source = `${FIXTURE_DIR}/${category}/${name}`;
		const issues = problems(text);
		if (issues.length > 0) {
			excluded.push({ source, family: 'fixtures', reason: issues.join('; ') });
			continue;
		}
		const candidate = [...kept.map((k) => k.text), text];
		if (lint_pfm(join_docs(candidate)).length > 0 || !composes(candidate)) {
			excluded.push({
				source,
				family: 'fixtures',
				reason: 'changes the parse of neighbouring fixtures when concatenated',
			});
			continue;
		}
		kept.push({ source, text });
	}
	if (kept.length === 0) continue;
	add(
		'fixtures',
		`${category}.md`,
		join_docs(kept.map((k) => k.text)),
		kept.map((k) => k.source)
	);
}

// only documents that survive being repeated can be cycled
const cyclable = real
	.filter((d) => {
		const ok = composes([d.text, d.text]);
		if (!ok)
			excluded.push({
				source: d.path,
				family: 'sized',
				reason: 'not repeatable, only valid at the start of a document',
			});
		return ok;
	})
	.sort((a, b) => a.file.localeCompare(b.file));

function cycle_to(target, docs) {
	const parts = [];
	const sources = [];
	let bytes = 0;
	let progress = true;
	while (bytes < target * 0.9 && progress) {
		progress = false;
		for (const d of docs) {
			const size = Buffer.byteLength(d.text) + 1;
			if (bytes + size > target * 1.1) continue;
			parts.push(d.text);
			sources.push(d.path);
			bytes += size;
			progress = true;
			if (bytes >= target * 0.9) break;
		}
	}
	return { text: join_docs(parts), parts, sources };
}

function add_cycled(family, file, target) {
	const { text, parts, sources } = cycle_to(target, cyclable);
	if (!composes(parts)) {
		throw new Error(
			`${family}/${file} does not parse as the sum of its documents`
		);
	}
	add(family, file, text, [...new Set(sources)]);
}

for (const [tier, target] of Object.entries(SIZED))
	add_cycled('sized', `${tier}.md`, target);
add_cycled('huge', '4m.md', HUGE_BYTES);

for (const f of files.values()) {
	const issues = problems(f.text);
	if (issues.length > 0)
		throw new Error(
			`${f.family}/${f.file} is not valid PFM after assembly: ${issues.join('; ')}`
		);
}

const entries = [...files.values()]
	.sort(
		(a, b) =>
			FAMILIES.indexOf(a.family) - FAMILIES.indexOf(b.family) ||
			a.file.localeCompare(b.file)
	)
	.map((f) => ({
		family: f.family,
		file: f.file,
		bytes: Buffer.byteLength(f.text),
		chars: f.text.length,
		lines: f.text.split('\n').length,
		nodes: arm.parse_markdown_svelte(f.text).nodes.size,
		hash: hash_text(f.text),
		sources: f.sources,
	}));
const corpus_hash = hash_text(
	entries.map((e) => `${e.family}/${e.file}:${e.hash}`).join('\n')
);
const manifest = { corpus_hash, entries, excluded };

if (check_only) {
	const path = join(corpus_dir, 'manifest.json');
	const current = existsSync(path)
		? JSON.parse(readFileSync(path, 'utf8'))
		: null;
	if (current?.corpus_hash !== corpus_hash) {
		console.error(
			`corpus is stale: committed ${current?.corpus_hash ?? 'none'}, rebuilt ${corpus_hash}`
		);
		process.exit(1);
	}
	console.log(`corpus up to date (${corpus_hash})`);
	process.exit(0);
}

for (const family of FAMILIES) {
	rmSync(join(corpus_dir, family), { recursive: true, force: true });
	mkdirSync(join(corpus_dir, family), { recursive: true });
}
for (const f of files.values())
	writeFileSync(join(corpus_dir, f.family, f.file), f.text);
writeFileSync(
	join(corpus_dir, 'manifest.json'),
	`${JSON.stringify(manifest, null, '\t')}\n`
);

const by_family = {};
for (const e of entries) {
	by_family[e.family] ??= { files: 0, bytes: 0 };
	by_family[e.family].files++;
	by_family[e.family].bytes += e.bytes;
}
console.log(`corpus ${corpus_hash}`);
for (const [family, s] of Object.entries(by_family)) {
	console.log(
		`  ${family.padEnd(9)} ${String(s.files).padStart(3)} files  ${String(s.bytes).padStart(9)} bytes`
	);
}
console.log(`  excluded  ${excluded.length} sources (see manifest.json)`);
