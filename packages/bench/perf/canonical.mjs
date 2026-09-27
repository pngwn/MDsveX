// canonical text forms of every observable output, one line per unit so a divergence shows at its first line

const NONE = 0xffffffff;

const link = (v) => (v === NONE ? '-' : String(v));

function stable_json(value) {
	return JSON.stringify(value, (_key, v) => {
		if (v instanceof Map) return { __map: [...v.entries()] };
		if (v instanceof Set) return { __set: [...v.values()] };
		if (ArrayBuffer.isView(v)) return { __typed: Array.from(v) };
		if (v && typeof v === 'object' && !Array.isArray(v)) {
			return Object.fromEntries(
				Object.keys(v)
					.sort()
					.map((k) => [k, v[k]])
			);
		}
		return v;
	});
}

/**
 * the same lines for a buffer that keeps each node in a stride of words (_n),
 * so arms on either layout compare. word offsets follow NodeField in
 * packages/parse/src/utils.ts, kind and extra share the first word
 */
function canonical_words(nodes) {
	const n = nodes._n;
	const lines = [];
	const meta = [];
	for (let i = 0; i < nodes.size; i++) {
		const b = i * 12;
		const slot = n[b + 11];
		if (slot !== 0) meta.push(i);
		lines.push(
			[
				i,
				n[b] & 0xff,
				n[b + 1],
				n[b + 2],
				`x${n[b] >>> 8}`,
				`v${n[b + 3]}:${n[b + 4]}`,
				`p${link(n[b + 5])}`,
				`n${link(n[b + 6])}`,
				`b${link(n[b + 7])}`,
				`c${link(n[b + 8])}:${link(n[b + 9])}`,
				`q${n[b + 10]}`,
				`m${stable_json(nodes.metadata_at(i) ?? null)}`,
				`s${stable_json(nodes._strings[i] ?? null)}`,
			].join(' ')
		);
	}
	for (const i of meta)
		lines.push(`meta ${i} ${stable_json(nodes.metadata_at(i))}`);
	lines.push(`size ${nodes.size}`);
	return lines;
}

/** the metadata map is also read directly so an entry whose presence bit was lost still shows up */
export function canonical_nodes(nodes) {
	if (nodes._n !== undefined) return canonical_words(nodes);
	const lines = [];
	for (let i = 0; i < nodes.size; i++) {
		lines.push(
			[
				i,
				nodes._kinds[i],
				nodes._starts[i],
				nodes._ends[i],
				`x${nodes._extras[i]}`,
				`v${nodes._value_starts[i]}:${nodes._value_ends[i]}`,
				`p${link(nodes._parents[i])}`,
				`n${link(nodes._next_siblings[i])}`,
				`b${link(nodes._prev_siblings[i])}`,
				`c${link(nodes._children_starts[i])}:${link(nodes._children_ends[i])}`,
				`q${nodes._pending_nodes[i]}`,
				`m${stable_json(nodes.metadata_at(i) ?? null)}`,
				`s${stable_json(nodes._strings[i] ?? null)}`,
			].join(' ')
		);
	}
	const keys = [...nodes.metadata.keys()].sort((a, b) => a - b);
	for (const k of keys)
		lines.push(`meta ${k} ${stable_json(nodes.metadata.get(k))}`);
	lines.push(`size ${nodes.size}`);
	return lines;
}

export function canonical_errors(errors) {
	const lines = [`errors ${errors.size}`];
	for (let i = 0; i < errors.size; i++) lines.push(`error ${errors.at(i)}`);
	return lines;
}

export function canonical_mappings(mappings) {
	return mappings.map((m) => stable_json(m));
}

/** lines that keep their offsets, for html diffs */
export function canonical_text(text) {
	const lines = [];
	let from = 0;
	while (from < text.length) {
		const nl = text.indexOf('\n', from);
		const to = nl === -1 ? text.length : nl + 1;
		lines.push(JSON.stringify(text.slice(from, to)));
		from = to;
	}
	lines.push(`length ${text.length}`);
	return lines;
}

/** index of the first differing line, or -1 when equal */
export function first_difference(a, b) {
	const n = Math.min(a.length, b.length);
	for (let i = 0; i < n; i++) if (a[i] !== b[i]) return i;
	return a.length === b.length ? -1 : n;
}
