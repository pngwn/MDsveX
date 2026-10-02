/**
 * where the top level keys of frontmatter sit in the yaml source, so each
 * maps to the key of the metadata export
 */

export interface KeyRange {
	/** the key text without quotes */
	start: number;
	end: number;
}

// a plain key runs to the first colon followed by a space or the line end
const PLAIN_KEY = /^([^\s#'"\-?:[\]{},&*!|>%@`][^\n]*?)[ \t]*:(?=[ \t]|$)/;

/**
 * the first range of each top level key of yaml, offset by base, a key the
 * parser reads some other way, such as a complex key, is left out
 */
export function yaml_keys(yaml: string, base: number): Map<string, KeyRange> {
	const keys = new Map<string, KeyRange>();
	let line_start = 0;
	while (line_start <= yaml.length) {
		let line_end = yaml.indexOf('\n', line_start);
		if (line_end < 0) line_end = yaml.length;
		const line = yaml.slice(line_start, line_end).replace(/\r$/, '');
		const found = top_key(line);
		if (found !== null && !keys.has(found.name)) {
			keys.set(found.name, {
				start: base + line_start + found.start,
				end: base + line_start + found.end,
			});
		}
		line_start = line_end + 1;
	}
	return keys;
}

function top_key(
	line: string
): { name: string; start: number; end: number } | null {
	const q = line[0];
	if (q === '"' || q === "'") {
		let i = 1;
		let name = '';
		for (; i < line.length; i++) {
			const c = line[i];
			if (q === '"' && c === '\\') {
				i++;
				continue;
			}
			if (c === q) {
				if (q === "'" && line[i + 1] === "'") {
					i++;
					continue;
				}
				break;
			}
		}
		if (i >= line.length) return null;
		const inner = line.slice(1, i);
		if (!/^[ \t]*:(?:[ \t]|$)/.test(line.slice(i + 1))) return null;
		if (q === "'") name = inner.replace(/''/g, "'");
		else {
			try {
				name = JSON.parse('"' + inner + '"');
			} catch {
				name = inner;
			}
		}
		return { name, start: 1, end: i };
	}
	const m = PLAIN_KEY.exec(line);
	if (m === null) return null;
	return { name: m[1], start: 0, end: m[1].length };
}

const TEMPLATE_KEY = /^(["']?)template\1[ \t]*:[ \t]*/;

/**
 * the value of a top level template key on the line holding offset, the
 * range a completion replaces, null when offset is not in one
 */
export function template_value_at(
	source: string,
	offset: number,
	frontmatter: KeyRange
): KeyRange | null {
	if (offset < frontmatter.start || offset > frontmatter.end) return null;
	const line_start = source.lastIndexOf('\n', offset - 1) + 1;
	let line_end = source.indexOf('\n', offset);
	if (line_end < 0 || line_end > frontmatter.end) line_end = frontmatter.end;
	const line = source.slice(line_start, line_end).replace(/\r$/, '');
	const key = TEMPLATE_KEY.exec(line);
	if (key === null) return null;
	const start = line_start + key[0].length;
	if (offset < start) return null;
	// a comment ends the value, trailing space is not part of it
	const rest = line.slice(key[0].length).replace(/[ \t]+#.*$/, '');
	const end = Math.max(start + rest.trimEnd().length, offset);
	return { start, end };
}
