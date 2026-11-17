// prettier changes quotes too, so segments move by a diff of the non space characters

import * as prettier from "prettier";
import * as svelte_plugin from "prettier-plugin-svelte";

const OPTIONS = {
	parser: "svelte",
	plugins: [svelte_plugin],
	printWidth: 40,
	useTabs: false,
	tabWidth: 2,
	singleQuote: true,
};

// past this the outputs barely match and the trace keeps growing
const MAX_EDITS = 2000;

/**
 * @param {string} code
 * @param {[number, number, number, number][]} segments source start, end, output start, end
 */
export async function format_output(code, segments) {
	let out;
	try {
		out = (await prettier.format(code, OPTIONS)).trimEnd();
	} catch {
		return { code, segments };
	}
	const to = offset_map(code, out);
	if (to === null) return { code, segments };
	const moved = [];
	for (const [start, end, out_start, out_end] of segments) {
		const range = to(out_start, out_end);
		if (range) moved.push([start, end, range[0], range[1]]);
	}
	return { code: out, segments: moved };
}

/** maps a range of a to the range its characters cover in b */
function offset_map(a, b) {
	const [a_at, a_chars] = solid(a);
	const [b_at, b_chars] = solid(b);
	const pairs = matched(a_chars, b_chars);
	if (pairs === null) return null;
	// the offset in b of each solid character of a, -1 when unmatched
	const went = new Int32Array(a_at.length).fill(-1);
	for (const [i, j] of pairs) went[i] = b_at[j];
	return (start, end) => {
		let first = -1;
		let last = -1;
		for (let i = lower_bound(a_at, start); i < a_at.length && a_at[i] < end; i++) {
			if (went[i] === -1) continue;
			if (first === -1) first = went[i];
			last = went[i];
		}
		return first === -1 ? null : [first, last + 1];
	};
}

/** offsets and characters of s that are not whitespace */
function solid(s) {
	const at = [];
	const chars = [];
	for (let i = 0; i < s.length; i++) {
		if (/\s/.test(s[i])) continue;
		at.push(i);
		chars.push(s[i]);
	}
	return [at, chars];
}

function lower_bound(sorted, value) {
	let lo = 0;
	let hi = sorted.length;
	while (lo < hi) {
		const mid = (lo + hi) >> 1;
		if (sorted[mid] < value) lo = mid + 1;
		else hi = mid;
	}
	return lo;
}

/** myers diff of a and b as matched index pairs, null past MAX_EDITS */
function matched(a, b) {
	const n = a.length;
	const m = b.length;
	const max = Math.min(n + m, MAX_EDITS);
	const off = max + 1;
	const v = new Int32Array(2 * max + 3);
	// trace[d] is v before step d, the diagonals within d of zero
	const trace = [];
	for (let d = 0; d <= max; d++) {
		trace.push(v.slice(off - d, off + d + 1));
		for (let k = -d; k <= d; k += 2) {
			let x = k === -d || (k !== d && v[off + k - 1] < v[off + k + 1]) ? v[off + k + 1] : v[off + k - 1] + 1;
			let y = x - k;
			while (x < n && y < m && a[x] === b[y]) {
				x++;
				y++;
			}
			v[off + k] = x;
			if (x >= n && y >= m) return back(trace, d, n, m, k);
		}
	}
	return null;
}

function back(trace, last, x, y, k) {
	const pairs = [];
	for (let d = last; d > 0; d--) {
		const v = trace[d];
		const at = (kk) => v[kk + d];
		const prev_k = k === -d || (k !== d && at(k - 1) < at(k + 1)) ? k + 1 : k - 1;
		const prev_x = at(prev_k);
		const prev_y = prev_x - prev_k;
		while (x > prev_x && y > prev_y) pairs.push([--x, --y]);
		x = prev_x;
		y = prev_y;
		k = prev_k;
	}
	while (x > 0 && y > 0) pairs.push([--x, --y]);
	return pairs;
}
