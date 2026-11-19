/**
 * remark reads commonmark, in which a svelte expression is text and a tag
 * such as <svelte:head> or <Button on:click|once={go}> is no html, so svelte
 * syntax is swapped for inert tokens before the parse and put back after it
 */

export interface Guard {
	/** the source with svelte syntax swapped for tokens */
	text: string;
	/** puts the svelte syntax back into what was serialised */
	restore(out: string): string;
}

const TAG = /^<(\/?)(svelte:[a-z]+|[A-Za-z][A-Za-z0-9-]*(?:\.[A-Za-z_$][\w$]*)*)(?=[\s/>])/;
const COMMONMARK_NAME = /^[A-Za-z][A-Za-z0-9-]*$/;
const FENCE = /^[ \t]*(`{3,}|~{3,})/;
const BLANK_LINE = /\n[ \t]*\n/;

/** true when the line after the linefeed at i is blank */
function blank_after(source: string, i: number): boolean {
	for (let j = i + 1; j < source.length; j++) {
		const ch = source[j];
		if (ch === "\n") return true;
		if (ch !== " " && ch !== "\t") return false;
	}
	return false;
}

/** the end of the brace group that opens at start, -1 when it never closes in its paragraph */
function brace_end(source: string, start: number): number {
	let depth = 0;
	for (let i = start; i < source.length; i++) {
		const ch = source[i];
		if (ch === "{") depth++;
		else if (ch === "}") {
			if (--depth === 0) return i + 1;
		} else if (ch === '"' || ch === "'") {
			const end = quote_end(source, i);
			if (end !== -1) i = end - 1;
		} else if (ch === "`") {
			const end = template_end(source, i);
			if (end === -1) return -1;
			i = end - 1;
		} else if (ch === "\n" && blank_after(source, i)) {
			return -1;
		}
	}
	return -1;
}

/** the end of a quoted string on one line, -1 for a lone quote */
function quote_end(source: string, start: number): number {
	const quote = source[start];
	for (let i = start + 1; i < source.length; i++) {
		const ch = source[i];
		if (ch === "\\") i++;
		else if (ch === quote) return i + 1;
		else if (ch === "\n") return -1;
	}
	return -1;
}

function template_end(source: string, start: number): number {
	for (let i = start + 1; i < source.length; i++) {
		const ch = source[i];
		if (ch === "\\") i++;
		else if (ch === "`") return i + 1;
		else if (ch === "$" && source[i + 1] === "{") {
			const end = brace_end(source, i + 1);
			if (end === -1) return -1;
			i = end - 1;
		}
	}
	return -1;
}

/** the index after the > that closes the tag whose attributes start at start, -1 when it never closes */
function tag_end(source: string, start: number): number {
	for (let i = start; i < source.length; i++) {
		const ch = source[i];
		if (ch === ">") return i + 1;
		if (ch === '"' || ch === "'") {
			const end = source.indexOf(ch, i + 1);
			if (end === -1) return -1;
			i = end;
		} else if (ch === "{") {
			const end = brace_end(source, i);
			if (end === -1) return -1;
			i = end - 1;
		} else if (ch === "<") {
			return -1;
		} else if (ch === "\n" && blank_after(source, i)) {
			return -1;
		}
	}
	return -1;
}

/** true when only spaces and tabs share the line with the range from start to end */
function alone_on_line(source: string, start: number, end: number): boolean {
	const line_start = source.lastIndexOf("\n", start - 1) + 1;
	let line_end = source.indexOf("\n", end);
	if (line_end === -1) line_end = source.length;
	return (
		source.slice(line_start, start).trim() === "" &&
		source.slice(end, line_end).trim() === ""
	);
}

export function protect(source: string): Guard {
	let prefix = "mdsvexmigrateq";
	while (source.toLowerCase().includes(prefix)) prefix += "q";

	const kept: string[] = [];
	const token = (original: string, kind: "e" | "b" | "a" | "t"): string => {
		kept.push(original);
		return prefix + (kept.length - 1) + kind;
	};

	let text = "";
	let i = 0;
	const copy = (end: number): void => {
		text += source.slice(i, end);
		i = end;
	};

	while (i < source.length) {
		const ch = source[i];

		if (i === 0 || source[i - 1] === "\n") {
			const fence = FENCE.exec(source.slice(i, i + 64));
			if (fence !== null) {
				// a fence is copied up to the line that closes it
				const marker = fence[1];
				const close = new RegExp(
					"\\n[ \\t]*" + (marker[0] === "`" ? "`" : "~") + "{" + marker.length + ",}[ \\t]*(?=\\n|$)",
				);
				const rest = source.slice(i + fence[0].length);
				const found = close.exec(rest);
				copy(found === null ? source.length : i + fence[0].length + found.index + found[0].length);
				continue;
			}
		}

		if (ch === "\\") {
			copy(Math.min(i + 2, source.length));
			continue;
		}

		if (ch === "`") {
			let run = i;
			while (source[run] === "`") run++;
			const ticks = source.slice(i, run);
			// a code span ends at the next run of the same length in its paragraph
			let from = run;
			let end = -1;
			for (;;) {
				const next = source.indexOf(ticks, from);
				if (next === -1) break;
				let stop = next + ticks.length;
				if (source[next - 1] !== "`" && source[stop] !== "`") {
					end = stop;
					break;
				}
				while (source[stop] === "`") stop++;
				from = stop;
			}
			copy(end !== -1 && !BLANK_LINE.test(source.slice(run, end)) ? end : run);
			continue;
		}

		if (ch === "<") {
			if (source.startsWith("<!--", i)) {
				const end = source.indexOf("-->", i + 4);
				copy(end === -1 ? source.length : end + 3);
				continue;
			}
			const tag = TAG.exec(source.slice(i, i + 256));
			if (tag !== null) {
				const [open, slash, name] = tag;
				if (slash === "" && (name === "script" || name === "style")) {
					// commonmark keeps these raw up to their close tag
					const close = source.indexOf("</" + name, i);
					const end = close === -1 ? -1 : source.indexOf(">", close);
					copy(end === -1 ? source.length : end + 1);
					continue;
				}
				const end = tag_end(source, i + open.length);
				if (end !== -1) {
					const self_closing = source[end - 2] === "/";
					const attrs = source.slice(i + open.length, end - (self_closing ? 2 : 1));
					text += "<" + slash + (COMMONMARK_NAME.test(name) ? name : token(name, "t"));
					if (attrs.trim() !== "") text += " " + token(attrs, "a");
					text += self_closing ? "/>" : ">";
					i = end;
					continue;
				}
			}
			copy(i + 1);
			continue;
		}

		if (ch === "{") {
			const end = brace_end(source, i);
			if (end !== -1) {
				const group = source.slice(i, end);
				// a block tag on a line of its own is a block, a comment is the html block that ends a paragraph
				text +=
					/^\{[#:/@]/.test(group) && alone_on_line(source, i, end)
						? "<!--" + token(group, "b") + "-->"
						: token(group, "e");
				i = end;
				continue;
			}
		}

		copy(i + 1);
	}

	const pattern = new RegExp("(<!--)?( )?" + prefix + "(\\d+)([ebat])(-->)?", "gi");

	return {
		text,
		restore(out) {
			return out.replace(pattern, (_, open = "", space = "", index, kind, close = "") => {
				const original = kept[Number(index)];
				kind = kind.toLowerCase();
				if (kind === "b") return (open === "" ? space : "") + original + (open === "" ? close : "");
				// the space before an attribute token stands in for the first character of the attributes
				if (kind === "a") return open + original + close;
				return open + space + original + close;
			});
		},
	};
}
