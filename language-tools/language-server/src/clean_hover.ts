/**
 * Clean up svelte2tsx internal types in hover tooltips.
 *
 * 1. Strips `(alias) type X = SvelteComponent<...> & { $$bindings?: ... }\n`
 * 2. Transforms `const X: __sveltets_2_IsomorphicComponent<{props}, ...>` → `const X<{props}>`
 */
export function clean_svelte_hover(markdown: string): string {
	markdown = strip_svelte_component_type(markdown);
	markdown = clean_isomorphic_component(markdown);
	return markdown;
}

/** Remove `(alias) type X = SvelteComponent<...> & { ... }\n` lines. */
function strip_svelte_component_type(md: string): string {
	const marker = "type ";
	let search_from = 0;
	while (true) {
		const type_idx = md.indexOf(marker, search_from);
		if (type_idx === -1) return md;

		// Check: does this type declaration use SvelteComponent?
		const eq_idx = md.indexOf("= SvelteComponent<", type_idx);
		if (eq_idx === -1 || eq_idx - type_idx > 80) {
			search_from = type_idx + 1;
			continue;
		}

		// Find the start of this declaration line (scan back to "(alias) " or newline)
		let line_start = type_idx;
		while (line_start > 0 && md[line_start - 1] !== "\n") line_start--;

		// Find the end: track braces past the `& { $$bindings... }` block
		let i = eq_idx + "= SvelteComponent<".length;
		let angle_depth = 1;
		// First pass: find closing > of SvelteComponent<...>
		while (i < md.length && angle_depth > 0) {
			if (md[i] === "<") angle_depth++;
			else if (md[i] === ">" && md[i - 1] !== "=") angle_depth--;
			i++;
		}
		// Check for `& { ... }` after the closing >
		const after_angle = md.slice(i, i + 10).trimStart();
		if (after_angle.startsWith("& {")) {
			i = md.indexOf("& {", i) + 2;
			let brace_depth = 0;
			while (i < md.length) {
				if (md[i] === "{") brace_depth++;
				else if (md[i] === "}") {
					brace_depth--;
					if (brace_depth === 0) { i++; break; }
				}
				i++;
			}
		}
		// Skip trailing newline
		if (i < md.length && md[i] === "\n") i++;

		md = md.slice(0, line_start) + md.slice(i);
		search_from = line_start;
	}
}

/** Transform `: __sveltets_2_IsomorphicComponent<{props}, ...>` → `<{props}>`. */
function clean_isomorphic_component(md: string): string {
	const marker = ": __sveltets_2_IsomorphicComponent<";
	const idx = md.indexOf(marker);
	if (idx === -1) return md;

	const args_start = idx + marker.length;

	// Find end of first generic arg (props) — first comma at brace depth 0
	let depth = 0;
	let first_arg_end = -1;
	for (let i = args_start; i < md.length; i++) {
		const ch = md[i];
		if (ch === "{") depth++;
		else if (ch === "}") depth--;
		else if (ch === "," && depth === 0) { first_arg_end = i; break; }
	}
	if (first_arg_end === -1) return md;

	// Find closing > (skip => arrow functions)
	let angle_depth = 1;
	let full_end = -1;
	for (let i = args_start; i < md.length; i++) {
		if (md[i] === "<") angle_depth++;
		else if (md[i] === ">") {
			if (i > 0 && md[i - 1] === "=") continue;
			angle_depth--;
			if (angle_depth === 0) { full_end = i + 1; break; }
		}
	}
	if (full_end === -1) return md;

	const first_arg = md.slice(args_start, first_arg_end).trim();
	return md.slice(0, idx) + "<" + first_arg + ">" + md.slice(full_end);
}
