/**
 * Throughput benchmark — reports MB/s for parse and e2e (parse+render).
 *
 * Run: pnpm bench:throughput
 */
import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';

import { parse_markdown_svelte, PFMParser } from '@mdsvex/parse';
import { TreeBuilder } from '@mdsvex/parse/tree-builder';
import { CursorHTMLRenderer } from '@mdsvex/render/html-cursor';
import { marked } from 'marked';
import { createMarkdownExit } from 'markdown-exit';

// ── Fixtures ────────────────────────────────────────────────

function load(name: string): string {
	return readFileSync(new URL(`./${name}`, import.meta.url), 'utf-8');
}

const fixtures: [string, string][] = [
	['short', load('fixture-short.md')],
	['html', load('fixture-html.md')],
	['tables', load('fixture-tables.md')],
	['code', load('fixture-code.md')],
	['prose', load('fixture.md')],
];

// ── Runners ─────────────────────────────────────────────────

function pfm_parse(source: string): void {
	parse_markdown_svelte(source);
}

function pfm_e2e(source: string): void {
	const tree = new TreeBuilder((source.length >> 3) || 128);
	const parser = new PFMParser(tree);
	parser.parse(source);
	const renderer = new CursorHTMLRenderer({ cache: false });
	renderer.update(tree.get_buffer(), source);
}

const mdexit = createMarkdownExit();

function mdexit_parse(source: string): void {
	mdexit.parse(source);
}

function mdexit_e2e(source: string): void {
	mdexit.render(source);
}

function marked_parse(source: string): void {
	marked.lexer(source);
}

function marked_e2e(source: string): void {
	marked.parse(source);
}

// ── Measurement ─────────────────────────────────────────────

function measure(fn: (s: string) => void, source: string, min_time_ms = 2000): number {
	// Warmup
	for (let i = 0; i < 50; i++) fn(source);

	let iterations = 0;
	const start = performance.now();
	while (performance.now() - start < min_time_ms) {
		fn(source);
		iterations++;
	}
	const elapsed = performance.now() - start;
	const ops = iterations / (elapsed / 1000);
	return (ops * source.length) / (1024 * 1024); // MB/s
}

// ── Report ──────────────────────────────────────────────────

type Row = { fixture: string; bytes: number; metric: string; pfm: number; mdexit: number; marked: number };

const rows: Row[] = [];

for (const [name, source] of fixtures) {
	rows.push({
		fixture: name,
		bytes: source.length,
		metric: 'parse',
		pfm: measure(pfm_parse, source),
		mdexit: measure(mdexit_parse, source),
		marked: measure(marked_parse, source),
	});
	rows.push({
		fixture: name,
		bytes: source.length,
		metric: 'e2e',
		pfm: measure(pfm_e2e, source),
		mdexit: measure(mdexit_e2e, source),
		marked: measure(marked_e2e, source),
	});
}

function fmt(n: number): string {
	return n >= 100 ? n.toFixed(0).padStart(7) : n.toFixed(1).padStart(7);
}

function winner(pfm: number, mdexit: number, marked: number): string {
	const max = Math.max(pfm, mdexit, marked);
	if (max === pfm) return 'pfm';
	if (max === mdexit) return 'mdexit';
	return 'marked';
}

console.log('');
console.log('  Throughput (MB/s) — higher is better');
console.log('  ─────────────────────────────────────────────────────────────────');
console.log('  Fixture       Bytes  Metric │     PFM   mdexit   marked  Winner');
console.log('  ─────────────────────────────────────────────────────────────────');

for (const r of rows) {
	const w = winner(r.pfm, r.mdexit, r.marked);
	console.log(
		`  ${r.fixture.padEnd(12)} ${String(r.bytes).padStart(6)}  ${r.metric.padEnd(5)}  │` +
		`${fmt(r.pfm)}${fmt(r.mdexit)}${fmt(r.marked)}  ${w}`,
	);
}

console.log('  ─────────────────────────────────────────────────────────────────');

// Aggregate: total bytes processed per second across all fixtures
const parse_totals = { pfm: 0, mdexit: 0, marked: 0 };
const e2e_totals = { pfm: 0, mdexit: 0, marked: 0 };
for (const r of rows) {
	const t = r.metric === 'parse' ? parse_totals : e2e_totals;
	t.pfm += r.pfm;
	t.mdexit += r.mdexit;
	t.marked += r.marked;
}
const n = fixtures.length;
console.log(
	`  ${'(avg)'.padEnd(12)} ${''.padStart(6)}  ${'parse'.padEnd(5)}  │` +
	`${fmt(parse_totals.pfm / n)}${fmt(parse_totals.mdexit / n)}${fmt(parse_totals.marked / n)}  ${winner(parse_totals.pfm, parse_totals.mdexit, parse_totals.marked)}`,
);
console.log(
	`  ${'(avg)'.padEnd(12)} ${''.padStart(6)}  ${'e2e'.padEnd(5)}  │` +
	`${fmt(e2e_totals.pfm / n)}${fmt(e2e_totals.mdexit / n)}${fmt(e2e_totals.marked / n)}  ${winner(e2e_totals.pfm, e2e_totals.mdexit, e2e_totals.marked)}`,
);
console.log('');
