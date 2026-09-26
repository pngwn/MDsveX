// formatting and verdicts shared by the cli scripts

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { cpus, hostname, platform, release, totalmem } from 'node:os';
import { join } from 'node:path';

import { geomean, make_rng, percentile } from './measure.mjs';
import { perf_root } from './paths.mjs';

const RESET = '\u001b[0m';
const DIM = '\u001b[2m';
const RED = '\u001b[31m';
const GREEN = '\u001b[32m';
const YELLOW = '\u001b[33m';
const BOLD = '\u001b[1m';

const colour = process.stdout.isTTY && !process.env.NO_COLOR;
export const paint = (code, s) => (colour ? `${code}${s}${RESET}` : s);
export const bold = (s) => paint(BOLD, s);
export const dim = (s) => paint(DIM, s);
export const red = (s) => paint(RED, s);
export const green = (s) => paint(GREEN, s);
export const yellow = (s) => paint(YELLOW, s);

// every file whose content can change a measurement
const HARNESS_FILES = [
	'anchor.mjs',
	'corpus.mjs',
	'lock.mjs',
	'measure.mjs',
	'paths.mjs',
	'report.mjs',
	'workloads.mjs',
	'bin/ab.mjs',
	'bin/calibrate.mjs',
];

export function harness_hash() {
	const h = createHash('sha256');
	for (const f of HARNESS_FILES) h.update(readFileSync(join(perf_root, f)));
	return h.digest('hex').slice(0, 16);
}

export function machine() {
	const cpu = cpus();
	return {
		host: hostname(),
		cpu: cpu[0]?.model ?? 'unknown',
		cores: cpu.length,
		memory_gb: Math.round(totalmem() / 2 ** 30),
		os: `${platform()} ${release()}`,
		node: process.version,
	};
}

export const calibration_path = join(perf_root, 'calibration.json');

export function read_calibration() {
	if (!existsSync(calibration_path)) return null;
	return JSON.parse(readFileSync(calibration_path, 'utf8'));
}

export function fmt_ns(ns) {
	if (!Number.isFinite(ns)) return '-';
	if (ns < 1_000) return `${ns.toFixed(0)}ns`;
	if (ns < 1_000_000) return `${(ns / 1_000).toFixed(1)}us`;
	return `${(ns / 1_000_000).toFixed(2)}ms`;
}

export function fmt_pct(ratio, digits = 1) {
	if (!Number.isFinite(ratio)) return '-';
	const pct = (ratio - 1) * 100;
	return `${pct >= 0 ? '+' : ''}${pct.toFixed(digits)}%`;
}

/** a row has moved only when its ci excludes 1.0, it clears the floor, and every pass agreed */
export function verdict(r, noise_floor) {
	const delta = Math.abs(r.speedup - 1);
	if (!r.significant || delta < noise_floor) return 'noise';
	if (r.replicated === false) return 'unstable';
	// a paired median further from the best of ratio than the effect means a disturbed run
	if (Math.abs(r.speedup - r.best_speedup) > delta) return 'unstable';
	return r.speedup > 1 ? 'faster' : 'slower';
}

function paint_verdict(v, text) {
	if (v === 'faster') return green(text);
	if (v === 'slower') return red(text);
	if (v === 'unstable') return yellow(text);
	return dim(text);
}

export function print_table(rows, noise_floor) {
	if (rows.length === 0) return;
	const w = Math.max(24, ...rows.map((r) => r.id.length));
	const head = [
		'workload'.padEnd(w),
		'base'.padStart(9),
		'cand'.padStart(9),
		'delta'.padStart(8),
		'95% ci'.padStart(17),
		'passes'.padStart(16),
		'verdict',
	].join('  ');
	console.log(bold(head));
	console.log(dim('-'.repeat(head.length)));
	for (const r of rows) {
		const v = verdict(r, noise_floor);
		const passes = (r.pass_speedups ?? [r.speedup])
			.map((s) => fmt_pct(s))
			.join(' ');
		console.log(
			[
				r.id.padEnd(w),
				fmt_ns(r.a.median_ns).padStart(9),
				fmt_ns(r.b.median_ns).padStart(9),
				paint_verdict(v, fmt_pct(r.speedup).padStart(8)),
				dim(`${fmt_pct(r.ci[0])}..${fmt_pct(r.ci[1])}`.padStart(17)),
				dim(passes.padStart(16)),
				paint_verdict(v, v),
			].join('  ')
		);
	}
}

/** null distribution of the group geomean deviation for n rows, resampled from a/a rows */
export function group_thresholds(aa_speedups, n, samples = 20_000) {
	const rng = make_rng(0x5eed + n);
	const logs = aa_speedups.map(Math.log);
	const out = new Float64Array(samples);
	for (let i = 0; i < samples; i++) {
		let sum = 0;
		for (let j = 0; j < n; j++) sum += logs[(rng() * logs.length) | 0];
		out[i] = Math.abs(Math.exp(sum / n) - 1);
	}
	out.sort();
	return {
		p50: out[Math.floor(samples * 0.5)],
		p95: out[Math.floor(samples * 0.95)],
		p99: out[Math.floor(samples * 0.99)],
	};
}

function group_by(rows, key) {
	const groups = new Map();
	for (const r of rows) {
		const k = key(r);
		if (!groups.has(k)) groups.set(k, []);
		groups.get(k).push(r);
	}
	return [...groups].sort(([a], [b]) => a.localeCompare(b));
}

/** geomeans by mode, family and document, each marked against the p99 for its group size */
export function summarise(results, { noise_floor, calibration = null } = {}) {
	const aa = calibration ? Object.values(calibration.per_workload) : null;
	const cache = new Map();
	const threshold = (n) => {
		if (!aa) return null;
		if (!cache.has(n)) cache.set(n, group_thresholds(aa, n, 5_000).p99);
		return cache.get(n);
	};
	const sections = {};
	for (const [title, key] of [
		['mode', (r) => r.mode],
		['family', (r) => r.family],
		['document', (r) => `${r.family}/${r.doc}`],
	]) {
		sections[title] = group_by(results, key).map(([name, rows]) => {
			const g = geomean(rows.map((r) => r.speedup));
			const p99 = threshold(rows.length);
			return {
				name,
				n: rows.length,
				geomean: g,
				p99,
				past_p99: p99 !== null && Math.abs(g - 1) > p99,
				worst: rows.reduce((acc, r) => (r.speedup < acc.speedup ? r : acc)).id,
			};
		});
	}
	const overall = geomean(results.map((r) => r.speedup));
	const p99 = threshold(results.length);
	return {
		sections,
		overall: {
			n: results.length,
			geomean: overall,
			p99,
			past_p99: p99 !== null && Math.abs(overall - 1) > p99,
		},
		counts: {
			faster: results.filter((r) => verdict(r, noise_floor) === 'faster')
				.length,
			slower: results.filter((r) => verdict(r, noise_floor) === 'slower')
				.length,
			unstable: results.filter((r) => verdict(r, noise_floor) === 'unstable')
				.length,
		},
	};
}

export function print_summary(summary, { max_rows = 40 } = {}) {
	for (const [title, groups] of Object.entries(summary.sections)) {
		console.log(`\n${bold(`by ${title} (geomean)`)}`);
		const w = Math.max(10, ...groups.map((g) => g.name.length));
		for (const g of groups.slice(0, max_rows)) {
			const mark = g.p99 === null ? '' : g.past_p99 ? yellow(' past p99') : '';
			const p99 = g.p99 === null ? '' : `  p99 ${(g.p99 * 100).toFixed(2)}%`;
			console.log(
				`  ${g.name.padEnd(w)}  ${fmt_pct(g.geomean, 2).padStart(8)}  ${dim(`n=${String(g.n).padStart(3)}${p99}`)}${mark}`
			);
		}
		if (groups.length > max_rows)
			console.log(
				dim(`  ... ${groups.length - max_rows} more in the json report`)
			);
	}
	const o = summary.overall;
	console.log(`\n${bold('overall')}`);
	console.log(
		`  geomean   ${fmt_pct(o.geomean, 2)} over ${o.n} workloads${o.p99 === null ? '' : dim(`  p99 ${(o.p99 * 100).toFixed(2)}%`)}${o.past_p99 ? yellow(' past p99') : ''}`
	);
	console.log(`  faster    ${summary.counts.faster}`);
	console.log(`  slower    ${summary.counts.slower}`);
	console.log(`  unstable  ${summary.counts.unstable}`);
}

export function print_integrity(meta) {
	console.log(`\n${bold('run integrity')}`);
	const a = meta.anchor;
	const drift = `${fmt_pct(1 + a.drift)} (${fmt_ns(a.start_ns)} -> ${fmt_ns(a.end_ns)})`;
	console.log(
		`  anchor drift  ${a.stable ? green(drift) : red(`${drift} UNSTABLE`)}`
	);
	if (!a.stable) {
		console.log(
			yellow(
				'  the machine changed speed during the run; paired ratios hold, absolute timings do not.'
			)
		);
	}
	console.log(
		`  noise floor   ${(meta.noise_floor * 100).toFixed(1)}%  ${dim(meta.noise_floor_source)}`
	);
	console.log(`  corpus        ${meta.corpus_hash}`);
	console.log(`  harness       ${meta.harness_hash}`);
	console.log(
		`  baseline      ${meta.baseline.root}${meta.baseline.sha ? dim(` @ ${meta.baseline.sha.slice(0, 12)}`) : ''}`
	);
	console.log(`  candidate     ${meta.candidate.root}`);
	console.log(
		`  node          ${meta.machine.node}  gc ${meta.exposed_gc ? 'exposed' : red('NOT exposed, run with --expose-gc')}`
	);
}

export function deviation_stats(results) {
	const dev = results.map((r) => Math.abs(r.speedup - 1));
	return {
		n: results.length,
		p50: percentile(dev, 0.5),
		p95: percentile(dev, 0.95),
		p99: percentile(dev, 0.99),
		worst: Math.max(...dev),
		geomean: geomean(results.map((r) => r.speedup)),
		ci_excluded_one: results.filter((r) => r.significant).length,
	};
}
