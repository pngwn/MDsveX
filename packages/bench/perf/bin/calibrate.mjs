#!/usr/bin/env node
// measure the noise floor of this machine
//
//   node --expose-gc packages/bench/perf/bin/calibrate.mjs [--rounds 15] [--suite core]
//
// the ab.mjs protocol with the reference as arm a and its mirror as arm b, two builds whose true ratio is 1.00
// use the same rounds and suite as the runs the floor will judge

import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { CORPUS_HASH } from '../corpus.mjs';
import { baseline_dir, mirror_dir } from '../paths.mjs';
import {
	calibration_path,
	deviation_stats,
	fmt_pct,
	harness_hash,
	machine,
	print_table,
} from '../report.mjs';
import { parse_args, run_comparison } from './ab.mjs';

const args = parse_args(process.argv.slice(2));
const a_root = resolve(args.opt('a', baseline_dir));
const b_root = resolve(args.opt('b', mirror_dir));

if (a_root === b_root) {
	console.error(
		'calibration needs two separate checkouts of one commit: one path loaded\n' +
			'twice is one module instance, which hides the two graph effect a real\n' +
			'A/B has. run bin/setup-baseline.mjs to build both.'
	);
	process.exit(2);
}

const run = await run_comparison({
	a_root,
	b_root,
	b_label: 'mirror',
	lock_label: 'calibrate',
	...args,
	repeat: 1,
});
if (run.problems.length > 0) {
	console.error('\ncannot calibrate:');
	for (const p of run.problems) console.error(`  ${p}`);
	process.exit(2);
}

const stats = deviation_stats(run.results);
// p99 of the absolute deviation, rounded up to a tenth of a percent
const noise_floor = Math.ceil(stats.p99 * 1000) / 1000;

console.log('\nA/A deviation from 1.00 (one commit, two independent builds)');
console.log(`  workloads          ${stats.n}`);
console.log(`  median             ${fmt_pct(1 + stats.p50, 2)}`);
console.log(`  p95                ${fmt_pct(1 + stats.p95, 2)}`);
console.log(`  p99                ${fmt_pct(1 + stats.p99, 2)}`);
console.log(`  worst              ${fmt_pct(1 + stats.worst, 2)}`);
console.log(
	`  geomean            ${fmt_pct(stats.geomean, 2)}  (truth is 0.00%)`
);
console.log(
	`  CI excluded 1.0    ${stats.ci_excluded_one}/${stats.n}  (${fmt_pct(1 + stats.ci_excluded_one / stats.n, 1)} of rows; each is a false positive a CI alone would report)`
);
console.log(
	`  anchor drift       ${fmt_pct(1 + run.anchor.drift, 2)}${run.anchor.stable ? '' : '  UNSTABLE, rerun on an idle machine'}`
);

console.log('\nnoisiest workloads');
print_table(
	[...run.results]
		.sort((x, y) => Math.abs(y.speedup - 1) - Math.abs(x.speedup - 1))
		.slice(0, 12),
	noise_floor
);

console.log(
	`\nnoise floor => ${(noise_floor * 100).toFixed(1)}%  (p99 of |deviation|, rounded up)`
);

const out = {
	measured_at: new Date().toISOString(),
	machine: machine(),
	noise_floor,
	suite: args.suite,
	filter: args.filter,
	rounds: args.rounds,
	target_ms: args.target_ms,
	rewarm_ms: args.rewarm_ms,
	corpus_hash: CORPUS_HASH,
	harness_hash: harness_hash(),
	exposed_gc: typeof globalThis.gc === 'function',
	duration_s: run.duration_s,
	anchor: run.anchor,
	stats,
	per_workload: Object.fromEntries(run.results.map((r) => [r.id, r.speedup])),
};
writeFileSync(calibration_path, `${JSON.stringify(out, null, '\t')}\n`);
console.log(`wrote ${calibration_path}`);
