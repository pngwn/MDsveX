// fixed workload the change under test cannot alter, timed at the start and end of a run to catch machine drift
// shaped like the parser hot loop so it tracks the same machine characteristics

const ANCHOR_TEXT = (() => {
	// joined not concatenated so the first reading does not pay to flatten a cons string
	let seed = 0x2545f491;
	const next = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff);
	const alphabet =
		'abcdefghijklmnopqrstuvwxyz ABCDEFGHIJ 0123456789\n\n#*_`[]()<>{}!|~^:-';
	const out = new Array(65_536);
	for (let i = 0; i < 65_536; i++) out[i] = alphabet[next() % alphabet.length];
	return out.join('');
})();

const CHAR_CLASS = (() => {
	const t = new Uint8Array(128);
	for (let c = 0; c < 128; c++) {
		if ((c >= 97 && c <= 122) || (c >= 65 && c <= 90)) t[c] = 1;
		else if (c >= 48 && c <= 57) t[c] = 2;
		else if (c === 32 || c === 9) t[c] = 3;
		else if (c === 10) t[c] = 4;
		else t[c] = 5;
	}
	return t;
})();

const TRANSITIONS = (() => {
	const t = new Uint16Array(8 * 8);
	for (let s = 0; s < 8; s++)
		for (let c = 0; c < 8; c++) t[s * 8 + c] = (s * 3 + c * 5) % 8;
	return t;
})();

const OUT = new Uint32Array(ANCHOR_TEXT.length * 3);

function anchor_workload() {
	const text = ANCHOR_TEXT;
	const len = text.length;
	let state = 0;
	let n = 0;
	let checksum = 0;
	for (let i = 0; i < len; i++) {
		const code = text.charCodeAt(i);
		const cls = code < 128 ? CHAR_CLASS[code] : 5;
		const next = TRANSITIONS[state * 8 + cls];
		if (next !== state) {
			const o = n * 3;
			OUT[o] = state;
			OUT[o + 1] = i;
			OUT[o + 2] = i + 1;
			n++;
			state = next;
		}
		checksum = (checksum + cls * next) | 0;
	}
	return checksum + n;
}

// warmed for wall clock time so both readings reach the same tier
const WARMUP_MS = 60;

function warm() {
	const deadline = process.hrtime.bigint() + BigInt(WARMUP_MS * 1e6);
	let sink = 0;
	do {
		sink += anchor_workload();
	} while (process.hrtime.bigint() < deadline);
	return sink;
}

/** nanoseconds per anchor call, repeated until two readings agree within 3% */
export function measure_anchor(iterations = 24) {
	const best_of_8 = () => {
		let best = Infinity;
		for (let r = 0; r < 8; r++) {
			const t0 = process.hrtime.bigint();
			for (let i = 0; i < iterations; i++) anchor_workload();
			const ns = Number(process.hrtime.bigint() - t0) / iterations;
			if (ns < best) best = ns;
		}
		return best;
	};
	warm();
	let previous = best_of_8();
	for (let attempt = 0; attempt < 10; attempt++) {
		warm();
		const current = best_of_8();
		const agree =
			Math.abs(current - previous) / Math.min(current, previous) <= 0.03;
		previous = current;
		if (agree) break;
	}
	return previous;
}

/** positive drift means the machine got slower during the run */
export function anchor_drift(start_ns, end_ns) {
	const drift = (end_ns - start_ns) / start_ns;
	return {
		start_ns: Math.round(start_ns),
		end_ns: Math.round(end_ns),
		drift,
		stable: Math.abs(drift) < 0.03,
	};
}
