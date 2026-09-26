#!/usr/bin/env node
// paired a/b comparison of a candidate checkout against the reference
//
//   node --expose-gc packages/bench/perf/bin/ab.mjs [options]
//
//   --baseline <root>     reference checkout, default .perf/baseline
//   --candidate <root>    checkout under test, default this checkout
//   --suite <name>        quick, core, full or scale, default core
//   --families a,b        only these corpus families
//   --modes a,b           only these modes, incremental means both sizes
//   --rounds <n>          paired rounds per workload, default 15
//   --repeat <n>          independent passes, default 1, use 2 for a claim
//   --target-ms <n>       time per window, default 20
//   --rewarm-ms <n>       untimed run per arm after each round gc, default 20
//   --noise-floor <pct>   override the calibrated floor in percent
//   --label <text>        recorded in the report
//   --out <path>          json report path, default reports/<time>-<label>.json
//   --verbose             every row, not just the ones past the floor
//
// exits 1 if any workload is slower past the floor, 2 on a setup problem

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { anchor_drift, measure_anchor } from '../anchor.mjs';
import { CORPUS_HASH } from '../corpus.mjs';
import { acquire_bench_lock } from '../lock.mjs';
import { compare_all, even_rounds } from '../measure.mjs';
import {
	baseline_dir,
	local_root,
	perf_root,
	reference_stamp,
} from '../paths.mjs';
import {
	harness_hash,
	machine,
	print_integrity,
	print_summary,
	print_table,
	read_calibration,
	summarise,
	verdict,
} from '../report.mjs';
import {
	arms_comparable,
	bind_workloads,
	load_arm,
	plan_workloads,
} from '../workloads.mjs';

export function parse_args(argv) {
	const opt = (name, fallback = null) => {
		const i = argv.indexOf(`--${name}`);
		return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--')
			? argv[i + 1]
			: fallback;
	};
	const list = (name) =>
		opt(name)
			?.split(',')
			.map((s) => s.trim())
			.filter(Boolean) ?? null;
	return {
		opt,
		has: (name) => argv.includes(`--${name}`),
		suite: opt('suite', 'core'),
		filter: { families: list('families'), modes: list('modes') },
		rounds: even_rounds(Number(opt('rounds', '15'))),
		repeat: Math.max(1, Number(opt('repeat', '1'))),
		target_ms: Number(opt('target-ms', '20')),
		rewarm_ms: Number(opt('rewarm-ms', '20')),
	};
}

function progress(tag) {
	let last = 0;
	return (i, n, id) => {
		if (process.stderr.isTTY) {
			process.stderr.write(
				`\r  ${tag}[${String(i).padStart(3)}/${n}] ${id.slice(0, 60).padEnd(60)}`
			);
			if (i === n) process.stderr.write(`\r${' '.repeat(80)}\r`);
		} else if (i === n || Date.now() - last > 30_000) {
			last = Date.now();
			process.stderr.write(`  ${tag}${i}/${n}\n`);
		}
	};
}

/** the paired protocol shared by ab and calibrate */
export async function run_comparison({
	a_root,
	b_root,
	b_label,
	lock_label,
	suite,
	filter,
	rounds,
	repeat,
	target_ms,
	rewarm_ms,
}) {
	const release = await acquire_bench_lock({ label: lock_label });
	try {
		const a = await load_arm(a_root, 'baseline');
		const b = await load_arm(b_root, b_label);
		const problems = arms_comparable(a, b);
		if (problems.length > 0) {
			return { problems };
		}
		const plan = plan_workloads(suite, filter);
		if (plan.length === 0)
			return { problems: ['no workloads matched the filters'] };
		const workloads = bind_workloads(plan, a, b);
		// binding is lazy, so fail on a broken arm before anything is timed
		for (const w of workloads) {
			const { a: run_a, b: run_b } = w.bind();
			run_a();
			run_b();
		}

		process.stderr.write(
			`suite=${suite} workloads=${workloads.length} rounds=${rounds} repeat=${repeat} target=${target_ms}ms rewarm=${rewarm_ms}ms\n`
		);
		const anchor_start = measure_anchor();
		const t0 = Date.now();
		// a second pass is not correlated with the first the way consecutive rounds are
		const passes = [];
		for (let pass = 0; pass < repeat; pass++) {
			passes.push(
				compare_all(workloads, {
					rounds,
					target_ms,
					rewarm_ms,
					seed: 0x5eed + pass,
					on_progress: progress(
						repeat > 1 ? `pass ${pass + 1}/${repeat} ` : ''
					),
				})
			);
		}
		const anchor = anchor_drift(anchor_start, measure_anchor());

		const results = workloads.map((w, i) => {
			const per_pass = passes.map((p) => p[i]);
			const speedups = per_pass.map((p) => p.speedup);
			// the pass that moved least is the honest summary of a repeat
			const pick = per_pass.reduce((acc, p) =>
				Math.abs(p.speedup - 1) < Math.abs(acc.speedup - 1) ? p : acc
			);
			return {
				id: w.id,
				mode: w.mode,
				family: w.family,
				doc: w.doc,
				bytes: w.bytes,
				speedup: pick.speedup,
				pass_speedups: speedups,
				ci: pick.ci,
				best_speedup: pick.best_speedup,
				significant: per_pass.every((p) => p.significant),
				replicated:
					speedups.every((s) => s > 1) || speedups.every((s) => s < 1),
				a: pick.a,
				b: pick.b,
				iterations: pick.iterations,
				ratios: passes.map((p) => p[i].ratios),
			};
		});

		return {
			problems: [],
			results,
			anchor,
			duration_s: Math.round((Date.now() - t0) / 100) / 10,
		};
	} finally {
		release();
	}
}

function read_noise_floor(args) {
	const override = args.opt('noise-floor');
	if (override !== null) {
		return { value: Number(override) / 100, source: '--noise-floor override' };
	}
	const cal = read_calibration();
	if (cal) {
		return {
			value: cal.noise_floor,
			source: `calibration.json, ${cal.measured_at} on ${cal.machine.cpu} (${cal.machine.host})`,
		};
	}
	return {
		value: 0.03,
		source:
			'DEFAULT: no calibration.json in this checkout, run bin/calibrate.mjs',
	};
}

// REFERENCE.json only describes .perf/baseline, so a --baseline run must not carry its sha
function reference_for(root) {
	if (resolve(root) !== resolve(baseline_dir) || !existsSync(reference_stamp))
		return {};
	const { sha, ref, subject, built_at } = JSON.parse(
		readFileSync(reference_stamp, 'utf8')
	);
	return { sha, ref, subject, built_at };
}

async function main() {
	const args = parse_args(process.argv.slice(2));
	const a_root = resolve(args.opt('baseline', baseline_dir));
	const b_root = resolve(args.opt('candidate', local_root));
	const label = args.opt('label', 'candidate');

	const run = await run_comparison({
		a_root,
		b_root,
		b_label: label,
		lock_label: `ab:${label}`,
		...args,
	});
	if (run.problems.length > 0) {
		console.error('\ncannot compare:');
		for (const p of run.problems) console.error(`  ${p}`);
		process.exitCode = 2;
		return;
	}

	const calibration = read_calibration();
	const { value: noise_floor, source: noise_floor_source } =
		read_noise_floor(args);
	const summary = summarise(run.results, { noise_floor, calibration });
	const meta = {
		label,
		suite: args.suite,
		filter: args.filter,
		rounds: args.rounds,
		repeat: args.repeat,
		target_ms: args.target_ms,
		rewarm_ms: args.rewarm_ms,
		corpus_hash: CORPUS_HASH,
		harness_hash: harness_hash(),
		noise_floor,
		noise_floor_source,
		calibration_corpus_hash: calibration?.corpus_hash ?? null,
		anchor: run.anchor,
		machine: machine(),
		exposed_gc: typeof globalThis.gc === 'function',
		duration_s: run.duration_s,
		baseline: { root: a_root, ...reference_for(a_root) },
		candidate: { root: b_root },
	};

	const moved = run.results.filter((r) => verdict(r, noise_floor) !== 'noise');
	if (args.has('verbose')) {
		console.log('');
		print_table(run.results, noise_floor);
	} else if (moved.length > 0) {
		console.log('\npast the noise floor:');
		print_table(moved, noise_floor);
	} else {
		console.log('\nno workload moved past the noise floor.');
	}
	print_summary(summary);
	print_integrity(meta);
	if (calibration && calibration.corpus_hash !== CORPUS_HASH) {
		console.log(
			'  calibration was measured on a different corpus; recalibrate before trusting the floor.'
		);
	}

	const out = resolve(
		args.opt(
			'out',
			join(
				perf_root,
				'reports',
				`${new Date().toISOString().replace(/[:.]/g, '-')}-${label}.json`
			)
		)
	);
	mkdirSync(dirname(out), { recursive: true });
	writeFileSync(
		out,
		`${JSON.stringify({ meta, summary, results: run.results }, null, '\t')}\n`
	);
	console.log(`\nreport: ${out}`);

	if (summary.counts.slower > 0) process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) await main();
