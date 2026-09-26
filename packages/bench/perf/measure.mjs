// see README.md for why each step exists

const NS_PER_MS = 1e6;

// minimum calls per window so one gc pause cannot be half a measurement, calls over LONG_CALL_MS already dwarf a pause
const MIN_ITERATIONS = 4;
const LONG_CALL_MS = 50;

// results land here so the optimiser cannot drop a call whose value is unused
export const sink = { value: null };

export function median(xs) {
	if (xs.length === 0) return NaN;
	const s = [...xs].sort((a, b) => a - b);
	const mid = s.length >> 1;
	return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function percentile(xs, p) {
	if (xs.length === 0) return NaN;
	const s = [...xs].sort((a, b) => a - b);
	const idx = Math.min(
		s.length - 1,
		Math.max(0, Math.round(p * (s.length - 1)))
	);
	return s[idx];
}

export function geomean(values) {
	const usable = values.filter((v) => Number.isFinite(v) && v > 0);
	if (usable.length === 0) return NaN;
	return Math.exp(
		usable.reduce((acc, v) => acc + Math.log(v), 0) / usable.length
	);
}

// deterministic so a report is reproducible from its samples
export function make_rng(seed) {
	let s = seed >>> 0 || 1;
	return () => {
		s ^= s << 13;
		s >>>= 0;
		s ^= s >> 17;
		s ^= s << 5;
		s >>>= 0;
		return s / 0x100000000;
	};
}

export function bootstrap_ci(
	values,
	{ samples = 2000, alpha = 0.05, seed = 0x5eed } = {}
) {
	if (values.length < 3) return [NaN, NaN];
	const rng = make_rng(seed);
	const n = values.length;
	const medians = new Float64Array(samples);
	const buf = new Float64Array(n);
	for (let s = 0; s < samples; s++) {
		for (let i = 0; i < n; i++) buf[i] = values[(rng() * n) | 0];
		buf.sort();
		const mid = n >> 1;
		medians[s] = n % 2 ? buf[mid] : (buf[mid - 1] + buf[mid]) / 2;
	}
	medians.sort();
	return [
		medians[Math.floor((alpha / 2) * samples)],
		medians[Math.min(samples - 1, Math.ceil((1 - alpha / 2) * samples))],
	];
}

function time_ns(fn, iterations) {
	let last;
	const t0 = process.hrtime.bigint();
	for (let i = 0; i < iterations; i++) last = fn();
	const ns = Number(process.hrtime.bigint() - t0);
	sink.value = last;
	return ns;
}

function calibrate(fn, target_ms) {
	let iterations = 1;
	for (let attempt = 0; attempt < 32; attempt++) {
		const ns = time_ns(fn, iterations);
		if (ns > 2 * NS_PER_MS) {
			const scaled = Math.max(
				1,
				Math.round((iterations * target_ms * NS_PER_MS) / ns)
			);
			const per_op_ns = ns / iterations;
			const floor = per_op_ns > LONG_CALL_MS * NS_PER_MS ? 1 : MIN_ITERATIONS;
			return {
				iterations: Math.min(Math.max(scaled, floor), 20_000_000),
				per_op_ns,
			};
		}
		iterations *= 4;
	}
	return { iterations: Math.max(iterations, MIN_ITERATIONS), per_op_ns: 0 };
}

function gc_full() {
	if (typeof globalThis.gc === 'function') globalThis.gc();
}

// a scavenge does not touch optimised code, so it keeps the rewarm
function gc_minor() {
	if (typeof globalThis.gc === 'function') globalThis.gc({ type: 'minor' });
}

function warm_for(fn, ms) {
	const deadline = process.hrtime.bigint() + BigInt(Math.round(ms * NS_PER_MS));
	let n = 0;
	let last;
	do {
		last = fn();
		n++;
	} while (process.hrtime.bigint() < deadline && n < 5_000_000);
	sink.value = last;
	return (ms * NS_PER_MS) / n;
}

// skipped once one call is longer than the budget, that call amortises the transient itself
function rewarm(fn, per_op_ns, rewarm_ms) {
	if (rewarm_ms <= 0 || per_op_ns >= rewarm_ms * NS_PER_MS) return;
	warm_for(fn, rewarm_ms);
}

export function even_rounds(rounds) {
	return rounds + (rounds % 2);
}

/** `a` is the reference and `b` the candidate, a speedup above 1 means the candidate is faster */
export function compare_one(a, b, options = {}) {
	const {
		target_ms = 20,
		warmup_ms = 120,
		rewarm_ms = 20,
		seed = 0x5eed,
	} = options;
	const rounds = even_rounds(options.rounds ?? 15);

	const warm_a = warm_for(a, warmup_ms);
	const warm_b = warm_for(b, warmup_ms);

	// each arm is cold again after the other warms up, so it rewarms before its iterations are sized
	rewarm(a, warm_a, rewarm_ms);
	const ca = calibrate(a, target_ms);
	rewarm(b, warm_b, rewarm_ms);
	const cb = calibrate(b, target_ms);
	// one shared count, from the slower arm, so the loop shape is identical
	const iterations = Math.max(1, Math.min(ca.iterations, cb.iterations));

	const round_a = [];
	const round_b = [];
	for (let r = 0; r < rounds; r++) {
		gc_full();
		const a_first = r % 2 === 0;
		// the arm timed first rewarms last so it is the most recently run
		if (a_first) {
			rewarm(b, cb.per_op_ns, rewarm_ms);
			rewarm(a, ca.per_op_ns, rewarm_ms);
		} else {
			rewarm(a, ca.per_op_ns, rewarm_ms);
			rewarm(b, cb.per_op_ns, rewarm_ms);
		}
		gc_minor();
		let ta;
		let tb;
		if (a_first) {
			ta = time_ns(a, iterations);
			tb = time_ns(b, iterations);
			tb += time_ns(b, iterations);
			ta += time_ns(a, iterations);
		} else {
			tb = time_ns(b, iterations);
			ta = time_ns(a, iterations);
			ta += time_ns(a, iterations);
			tb += time_ns(b, iterations);
		}
		round_a.push(ta / (2 * iterations));
		round_b.push(tb / (2 * iterations));
	}

	const a_ns = [];
	const b_ns = [];
	const ratios = [];
	for (let r = 0; r < rounds; r += 2) {
		const ta = (round_a[r] + round_a[r + 1]) / 2;
		const tb = (round_b[r] + round_b[r + 1]) / 2;
		a_ns.push(ta);
		b_ns.push(tb);
		ratios.push(ta / tb);
	}

	const speedup = median(ratios);
	const ci = bootstrap_ci(ratios, { seed });
	return {
		iterations,
		rounds,
		a: { median_ns: median(a_ns), min_ns: Math.min(...a_ns) },
		b: { median_ns: median(b_ns), min_ns: Math.min(...b_ns) },
		ratios,
		speedup,
		// the least disturbed reading from each arm, far from speedup means a noisy run
		best_speedup: Math.min(...a_ns) / Math.min(...b_ns),
		ci,
		significant: Number.isFinite(ci[0]) && (ci[0] > 1 || ci[1] < 1),
	};
}

/** ns per call for one arm on its own, for absolute profiles */
export function time_one(
	fn,
	{ target_ms = 50, warmup_ms = 120, samples = 5 } = {}
) {
	warm_for(fn, warmup_ms);
	const { iterations } = calibrate(fn, target_ms);
	const per = [];
	for (let i = 0; i < samples; i++) {
		gc_full();
		warm_for(fn, 10);
		gc_minor();
		per.push(time_ns(fn, iterations) / iterations);
	}
	return median(per);
}

export function compare_all(workloads, options = {}) {
	const { on_progress = null } = options;
	const results = [];
	for (let i = 0; i < workloads.length; i++) {
		const w = workloads[i];
		const { a, b } = w.bind();
		const r = compare_one(a, b, options);
		results.push({ id: w.id, ...r });
		on_progress?.(i + 1, workloads.length, w.id);
	}
	return results;
}
