#!/usr/bin/env node
// absolute cost breakdown for one arm per corpus file, use ab.mjs to decide whether a change helped
//
//   node --expose-gc packages/bench/perf/bin/profile.mjs [--family real] [--arm <root>] [--plain]
//
// mapped by default because that is what the vite plugin runs

import { resolve } from 'node:path';

import { corpus } from '../corpus.mjs';
import { acquire_bench_lock } from '../lock.mjs';
import { time_one } from '../measure.mjs';
import { local_root } from '../paths.mjs';
import { bold, dim, fmt_ns } from '../report.mjs';
import { HUGE_MODES, load_arm, make_doc_run } from '../workloads.mjs';
import { parse_args } from './ab.mjs';

const args = parse_args(process.argv.slice(2));
const root = resolve(args.opt('arm', local_root));
const families = args.opt('family', 'real').split(',');
const mapped = !args.has('plain');

const release = await acquire_bench_lock({ label: 'profile' });
const rows = [];
try {
	const arm = await load_arm(root, 'profile');
	for (const entry of corpus({ families })) {
		const src = entry.source;
		const t = (mode) => time_one(make_doc_run(arm, mode, src));
		const parse = t('parse-direct');
		const render = t(mapped ? 'render-mapped' : 'render');
		const compile = t(mapped ? 'compile-mapped' : 'compile');
		const vite_ok =
			mapped &&
			(entry.family !== 'huge' || HUGE_MODES.includes('vite-transform'));
		const vite = vite_ok ? t('vite-transform') : NaN;
		const reused = vite_ok ? t('compile-reused-mapped') : NaN;
		rows.push({
			id: entry.id,
			bytes: entry.bytes,
			nodes: entry.nodes,
			parse,
			render,
			compile,
			vite,
			reused,
		});
		process.stderr.write(dim(`  ${entry.id}\n`));
	}
} finally {
	release();
}

const pct = (part, total) =>
	Number.isFinite(part) ? `${((part / total) * 100).toFixed(0)}%` : '-';
const cols = [
	['file', 34, (r) => r.id],
	['bytes', 9, (r) => String(r.bytes)],
	['nodes', 7, (r) => String(r.nodes)],
	['compile', 9, (r) => fmt_ns(r.compile)],
	['parse', 6, (r) => pct(r.parse, r.compile)],
	['render', 6, (r) => pct(r.render, r.compile)],
	['other', 6, (r) => pct(r.compile - r.parse - r.render, r.compile)],
	['MB/s', 7, (r) => (r.bytes / (r.compile / 1e9) / 1e6).toFixed(1)],
	['ns/B', 7, (r) => (r.bytes ? (r.compile / r.bytes).toFixed(1) : '-')],
	['ns/node', 8, (r) => (r.compile / r.nodes).toFixed(0)],
];
if (mapped) {
	cols.push(['vite', 9, (r) => fmt_ns(r.vite)]);
	cols.push(['v3 share', 8, (r) => pct(r.vite - r.reused, r.vite)]);
}

const line = (cells) =>
	cells
		.map((c, i) => (i === 0 ? c.padEnd(cols[i][1]) : c.padStart(cols[i][1])))
		.join('  ');
console.log(`\n${bold(`${mapped ? 'mapped' : 'plain'} compile, ${root}`)}`);
console.log(bold(line(cols.map(([h]) => h))));
for (const r of rows) console.log(line(cols.map(([, , f]) => f(r))));

const sum = (k) =>
	rows.reduce((acc, r) => acc + (Number.isFinite(r[k]) ? r[k] : 0), 0);
const total = {
	id: 'total',
	bytes: sum('bytes'),
	nodes: sum('nodes'),
	parse: sum('parse'),
	render: sum('render'),
	compile: sum('compile'),
	vite: sum('vite'),
	reused: sum('reused'),
};
console.log(bold(line(cols.map(([, , f]) => f(total)))));
console.log(
	dim(
		'\ncompile = parse + render + other. other is what compile adds: allocation, normalisation, result objects.'
	)
);
if (mapped)
	console.log(
		dim(
			'vite is the plugin pre transform; v3 share is the part of it spent building the v3 sourcemap.'
		)
	);
