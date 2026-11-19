#!/usr/bin/env node
// noise thresholds for a group geomean, resampled from the a/a calibration
//
//   node packages/bench/perf/bin/group-floor.mjs [extra sizes...]
//
// a predeclared group past its p99 is a real effect even when no row clears the per workload floor

import { geomean } from '../measure.mjs';
import { group_thresholds, read_calibration } from '../report.mjs';

const cal = read_calibration();
if (!cal) {
	console.error(
		'no calibration.json in this checkout; run bin/calibrate.mjs first'
	);
	process.exit(2);
}

const per = Object.entries(cal.per_workload);
const all = per.map(([, s]) => s);
const pct = (v) => `${(v * 100).toFixed(2)}%`;

console.log(
	`A/A calibration: ${all.length} workloads, ${cal.rounds} rounds, ${cal.measured_at}`
);
console.log(
	`machine: ${cal.machine.cpu} (${cal.machine.host}), node ${cal.machine.node}`
);
console.log(`per workload floor: ${pct(cal.noise_floor)}\n`);

const by_mode = new Map();
for (const [id, s] of per) {
	const mode = id.slice(id.lastIndexOf(':') + 1);
	if (!by_mode.has(mode)) by_mode.set(mode, []);
	by_mode.get(mode).push(s);
}
console.log('observed A/A geomean by mode (truth is 0.00%):');
for (const [mode, s] of [...by_mode].sort(([a], [b]) => a.localeCompare(b))) {
	console.log(
		`  ${mode.padEnd(22)} ${pct(geomean(s) - 1).padStart(8)}  n=${s.length}`
	);
}

const sizes = [
	...new Set([
		10,
		20,
		37,
		54,
		100,
		all.length,
		...process.argv
			.slice(2)
			.filter((a) => /^\d+$/.test(a))
			.map(Number),
	]),
].sort((a, b) => a - b);

console.log('\nnull distribution of |group geomean - 1|:');
console.log(
	`  ${'n'.padStart(5)}  ${'p50'.padStart(8)}  ${'p95'.padStart(8)}  ${'p99'.padStart(8)}`
);
for (const n of sizes) {
	const t = group_thresholds(all, n);
	const label = n === all.length ? `${n}*` : String(n);
	console.log(
		`  ${label.padStart(5)}  ${pct(t.p50).padStart(8)}  ${pct(t.p95).padStart(8)}  ${pct(t.p99).padStart(8)}`
	);
}
console.log('  * the full calibrated suite');
