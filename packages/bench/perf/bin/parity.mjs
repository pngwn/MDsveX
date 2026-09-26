#!/usr/bin/env node
// output parity gate every optimisation must pass, exits 1 on any divergence
//
//   node packages/bench/perf/bin/parity.mjs [--baseline <root>] [--candidate <root>]
//                                           [--families a,b] [--modes a,b] [--max-report 3]
//
// the reused session compiles the whole corpus through one session per arm so state leaking between documents shows up
// takes the machine lock because it is cpu heavy enough to distort an a/b running alongside it

import { resolve } from 'node:path';

import {
	canonical_errors,
	canonical_mappings,
	canonical_nodes,
	canonical_text,
	first_difference,
} from '../canonical.mjs';
import { corpus, CORPUS_HASH, FAMILIES } from '../corpus.mjs';
import { acquire_bench_lock } from '../lock.mjs';
import { baseline_dir, local_root } from '../paths.mjs';
import { bold, dim, green, red, yellow } from '../report.mjs';
import {
	CHUNK_SIZES,
	HUGE_MODES,
	load_arm,
	MODES,
	expand_modes,
} from '../workloads.mjs';
import { parse_args } from './ab.mjs';

const args = parse_args(process.argv.slice(2));
const baseline_root = resolve(args.opt('baseline', baseline_dir));
const candidate_root = resolve(args.opt('candidate', local_root));
const max_report = Number(args.opt('max-report', '3'));
const families = args.filter.families ?? FAMILIES;
const modes = args.filter.modes
	? expand_modes(args.filter.modes)
	: MODES.filter((m) => m !== 'setup');

const VITE_ID = '/corpus/doc.svx';

// spreading into push overflows the stack on the huge document
function append(lines, more) {
	for (const line of more) lines.push(line);
	return lines;
}

function nodes_lines(nodes, errors, source) {
	const lines = canonical_nodes(nodes);
	if (errors) append(lines, canonical_errors(errors));
	if (source !== undefined)
		lines.push(`source ${JSON.stringify(source.length)}`);
	return lines;
}

function feed(arm, src, size) {
	const tree = new arm.TreeBuilder(src.length >> 3 || 128);
	const parser = new arm.PFMParser(tree);
	parser.init();
	for (let i = 0; i < src.length; i += size)
		parser.feed(src.slice(i, i + size));
	const { errors } = parser.finish();
	return nodes_lines(tree.get_buffer(), errors);
}

function direct(arm, src) {
	const tree = new arm.TreeBuilder(src.length >> 3 || 128);
	const { errors } = new arm.PFMParser(tree).parse(src);
	return nodes_lines(tree.get_buffer(), errors);
}

function compiled(result, mapped) {
	const lines = canonical_text(result.code);
	if (mapped) append(lines, canonical_mappings(result.mappings));
	return lines;
}

/** canonical output lines for one mode */
function output(arm, mode, src, session) {
	switch (mode) {
		case 'parse': {
			const { nodes, errors, source } = arm.parse_markdown_svelte(src);
			return nodes_lines(nodes, errors, source);
		}
		case 'parse-direct':
			return direct(arm, src);
		case 'render': {
			const { nodes, source } = arm.parse_markdown_svelte(src);
			const r = new arm.CursorHTMLRenderer({ cache: false });
			r.update(nodes, source);
			return canonical_text(r.html);
		}
		case 'render-mapped': {
			const { nodes, source } = arm.parse_markdown_svelte(src);
			const r = new arm.CursorHTMLRenderer({ cache: false });
			const { mappings } = r.update_mapped(nodes, source);
			return append(canonical_text(r.html), canonical_mappings(mappings));
		}
		case 'compile':
			return compiled(arm.compile(src), false);
		case 'compile-mapped':
			return compiled(arm.compile(src, { sourcemap: true }), true);
		case 'compile-reused':
			return compiled(session.compile(src), false);
		case 'compile-reused-mapped':
			return compiled(session.compile(src, { sourcemap: true }), true);
		case 'sourcemap-v3': {
			const { code, mappings } = arm.compile(src, { sourcemap: true });
			return [JSON.stringify(arm.mappings_to_v3(mappings, src, code, VITE_ID))];
		}
		case 'vite-transform': {
			const [pre] = arm.mdsvex();
			return canonical_text(pre.transform(src, VITE_ID).code);
		}
		default:
			if (mode.startsWith('incremental-'))
				return feed(arm, src, Number(mode.slice(12)));
			throw new Error(`unknown mode "${mode}"`);
	}
}

// node lines start with their index and kind, then the source start offset
function context(src, line) {
	const m = /^\d+ \d+ (\d+) /.exec(line ?? '');
	if (!m) return null;
	const pos = Number(m[1]);
	const from = src.lastIndexOf('\n', pos - 1) + 1;
	const to = src.indexOf('\n', pos);
	return `source line ${src.slice(0, pos).split('\n').length}: ${JSON.stringify(src.slice(from, to === -1 ? src.length : to).slice(0, 120))}`;
}

// a window around the first differing character so a one byte change in a long html line is visible
function windows(a, b) {
	if (a === undefined || b === undefined) {
		const clip = (s) => (s === undefined ? '<end>' : s.slice(0, 200));
		return { a: clip(a), b: clip(b), col: 0 };
	}
	let col = 0;
	while (col < a.length && col < b.length && a[col] === b[col]) col++;
	const from = Math.max(0, col - 80);
	const cut = (s) =>
		`${from > 0 ? '...' : ''}${s.slice(from, col + 80)}${s.length > col + 80 ? '...' : ''}`;
	return { a: cut(a), b: cut(b), col };
}

const release = await acquire_bench_lock({ label: 'parity' });
const base = await load_arm(baseline_root, 'baseline');
const cand = await load_arm(candidate_root, 'candidate');
const sessions = {
	base: new base.CompilerSession(),
	cand: new cand.CompilerSession(),
};
const mapped_sessions = {
	base: new base.CompilerSession(),
	cand: new cand.CompilerSession(),
};

const failures = [];
const known = [];
let checks = 0;

for (const entry of corpus({ families })) {
	const src = entry.source;
	for (const mode of modes) {
		if (entry.family === 'huge' && !HUGE_MODES.includes(mode)) continue;
		const pick = mode === 'compile-reused-mapped' ? mapped_sessions : sessions;
		const a = output(base, mode, src, pick.base);
		const b = output(cand, mode, src, pick.cand);
		checks++;
		const at = first_difference(a, b);
		if (at !== -1) {
			failures.push({
				id: `${entry.id}:${mode}`,
				at,
				a: a[at],
				b: b[at],
				ctx: context(src, a[at] ?? b[at]),
			});
		}
		if (mode.startsWith('incremental-')) {
			checks++;
			const batch = direct(cand, src);
			const self = first_difference(batch, b);
			if (self !== -1) {
				const base_self = first_difference(direct(base, src), a);
				const record = {
					id: `${entry.id}:${mode} vs batch`,
					labels: ['batch', 'incremental'],
					at: self,
					a: batch[self],
					b: b[self],
					ctx: context(src, batch[self] ?? b[self]),
				};
				// a mismatch the reference already has is a known parser bug, not a regression
				if (base_self !== -1 && at === -1) known.push(record);
				else failures.push(record);
			}
		}
	}
}

release();

const by_check = new Map();
for (const f of failures) {
	const mode = f.id.slice(f.id.indexOf(':') + 1);
	if (!by_check.has(mode)) by_check.set(mode, []);
	by_check.get(mode).push(f);
}

const print = (f) => {
	const w = windows(f.a, f.b);
	console.log(
		`  ${bold(f.id)}  first difference at line ${f.at}, column ${w.col}`
	);
	const [la, lb] = f.labels ?? ['baseline', 'candidate'];
	console.log(`    ${la.padEnd(13)}${w.a}`);
	console.log(`    ${lb.padEnd(13)}${w.b}`);
	if (f.ctx) console.log(dim(`    ${f.ctx}`));
};

for (const [mode, list] of by_check) {
	console.log(`\n${red(`${mode}: ${list.length} divergent`)}`);
	for (const f of list.slice(0, max_report)) print(f);
	if (list.length > max_report)
		console.log(dim(`  ... and ${list.length - max_report} more`));
}
if (known.length > 0) {
	console.log(
		`\n${yellow(`${known.length} incremental parses differ from batch on both arms (pre existing):`)}`
	);
	for (const f of known.slice(0, max_report)) print(f);
	if (known.length > max_report)
		console.log(dim(`  ... and ${known.length - max_report} more`));
}

console.log(`\ncorpus ${CORPUS_HASH}, ${checks} checks`);
console.log(`  baseline   ${base.root}`);
console.log(`  candidate  ${cand.root}`);
if (failures.length > 0) {
	console.log(red(`\n${failures.length} divergent checks`));
	process.exitCode = 1;
} else {
	console.log(green('\nparity: all outputs identical'));
}
