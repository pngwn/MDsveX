// live expressions in code, the {...} groups of an [!eval] range or an eval
// fence, compile imports this, so it stays free of twinkleplop

const LF = 10;
const SPACE = 32;
const TAB = 9;
const CR = 13;
const DOUBLE_QUOTE = 34;
const SINGLE_QUOTE = 39;
const BACKTICK = 96;
const BACKSLASH = 92;
const DOLLAR = 36;
const HASH = 35;
const COLON = 58;
const SLASH = 47;
const AT = 64;
const BANG = 33;
const BRACKET_OPEN = 91;
const BRACKET_CLOSE = 93;
const BRACE_OPEN = 123;
const BRACE_CLOSE = 125;

/** a group that can not be live, the message says where in the code */
export class LiveCodeError extends Error {
	constructor(
		message: string,
		/** the code the group is in */
		readonly code: string,
		/** the offset of the group in code */
		readonly offset: number
	) {
		super(message);
	}
}

function where(source: string, at: number): string {
	let line = 1;
	let line_start = 0;
	for (
		let i = source.indexOf('\n');
		i !== -1 && i < at;
		i = source.indexOf('\n', i + 1)
	) {
		line++;
		line_start = i + 1;
	}
	return `line ${line}, column ${at - line_start + 1} of the code`;
}

function fail(source: string, at: number, message: string): never {
	throw new LiveCodeError(`${message} (${where(source, at)})`, source, at);
}

function line_end(source: string, from: number): number {
	const nl = source.indexOf('\n', from);
	return nl === -1 ? source.length : nl;
}

/** the index after the quote closing the string opened at i */
function skip_quoted(source: string, i: number, limit: number): number {
	const quote = source.charCodeAt(i);
	for (let j = i + 1; j < limit; j++) {
		const ch = source.charCodeAt(j);
		if (ch === BACKSLASH) j++;
		else if (ch === quote) return j + 1;
	}
	return fail(
		source,
		i,
		'a string in a live expression must close on its line'
	);
}

/** the index after the backtick closing the template literal opened at i */
function skip_template(source: string, i: number, limit: number): number {
	for (let j = i + 1; j < limit; j++) {
		const ch = source.charCodeAt(j);
		if (ch === BACKSLASH) j++;
		else if (ch === BACKTICK) return j + 1;
		else if (ch === DOLLAR && source.charCodeAt(j + 1) === BRACE_OPEN)
			j = skip_braces(source, j + 1, limit) - 1;
	}
	return fail(
		source,
		i,
		'a template literal in a live expression must close on its line'
	);
}

/** the index after the brace closing the one at i, strings and template literals skipped */
function skip_braces(source: string, i: number, limit: number): number {
	let depth = 0;
	for (let j = i; j < limit; j++) {
		const ch = source.charCodeAt(j);
		if (ch === DOUBLE_QUOTE || ch === SINGLE_QUOTE)
			j = skip_quoted(source, j, limit) - 1;
		else if (ch === BACKTICK) j = skip_template(source, j, limit) - 1;
		else if (ch === BRACE_OPEN) depth++;
		else if (ch === BRACE_CLOSE && --depth === 0) return j + 1;
	}
	return fail(source, i, 'a live expression must close on its line');
}

function is_blank(source: string, start: number, end: number): boolean {
	for (let i = start; i < end; i++) {
		const ch = source.charCodeAt(i);
		if (ch !== SPACE && ch !== TAB && ch !== CR) return false;
	}
	return true;
}

/** throws unless the group at start is an expression tag or {@html} */
function check_tag(source: string, start: number): void {
	const first = source.charCodeAt(start + 1);
	if (first === HASH || first === COLON || first === SLASH)
		fail(
			source,
			start,
			`${source.slice(start, start + 2)}...} is a block tag, code can only hold {expression} and {@html expression}`
		);
	if (first !== AT) return;
	const after = source.charCodeAt(start + 6);
	if (
		source.startsWith('html', start + 2) &&
		(after === SPACE || after === TAB)
	)
		return;
	fail(
		source,
		start,
		'code can only hold {expression} and {@html expression}, not other {@...} tags'
	);
}

/**
 * the index after the ] closing a [!verb ...] marker at i, -1 when none
 * starts there, quotes and backslashes as twinkleplop reads them
 */
function marker_end(source: string, i: number): number {
	if (source.charCodeAt(i + 1) !== BANG) return -1;
	const verb = source.charCodeAt(i + 2) | 32;
	if (verb < 97 || verb > 122) return -1;
	let quoted = false;
	for (let j = i + 3; j < source.length; j++) {
		const ch = source.charCodeAt(j);
		if (ch === LF) return -1;
		if (ch === BACKSLASH) j++;
		else if (ch === DOUBLE_QUOTE) quoted = !quoted;
		else if (ch === BRACKET_CLOSE && !quoted) return j + 1;
	}
	return -1;
}

/**
 * pushes the start and end of every top level {...} group from start to end
 * of source, marker text is passed over as it never shows, a group may run past
 * end but not past its line, a blank group stays text, throws a
 * LiveCodeError for a group that can not be live
 */
export function live_groups(
	source: string,
	start: number,
	end: number,
	out: number[]
): void {
	let i = start;
	while (i < end) {
		const ch = source.charCodeAt(i);
		if (ch === BRACE_OPEN) {
			const close = skip_braces(source, i, line_end(source, i));
			if (!is_blank(source, i + 1, close - 1)) {
				check_tag(source, i);
				out.push(i, close);
			}
			i = close;
		} else if (ch === BRACE_CLOSE) {
			fail(source, i, 'a } in a live range closes no {');
		} else if (ch === BRACKET_OPEN) {
			const after = marker_end(source, i);
			i = after === -1 ? i + 1 : after;
		} else i++;
	}
}

/**
 * the groups of every line of source outside the hidden ranges, start and
 * end pairs in order, as the eval fence flag makes them live
 */
export function fence_groups(
	source: string,
	hidden: ArrayLike<number>
): number[] {
	const out: number[] = [];
	let from = 0;
	for (let h = 0; h < hidden.length; h += 2) {
		live_groups(source, from, hidden[h], out);
		from = hidden[h + 1];
	}
	live_groups(source, from, source.length, out);
	return out;
}

const TEMPLATE_TEST = /[`\\]|\$\{/;
const TEMPLATE_MATCH = /[`\\]|\$\{/g;

function template_replace(s: string): string {
	return s === '${' ? '\\${' : '\\' + s;
}

/** text as the static part of a template literal */
export function template_text(text: string): string {
	if (!TEMPLATE_TEST.test(text)) return text;
	return text.replace(TEMPLATE_MATCH, template_replace);
}

/** the expression of a live group, {@html x} gives x */
export function group_expression(group: string): string {
	const inner = group.slice(1, group.length - 1);
	return group.charCodeAt(1) === AT ? inner.slice(5) : inner;
}

/** true when a fence meta holds the eval flag */
export function has_eval_flag(parts: string[]): boolean {
	for (let i = 0; i < parts.length; i++) if (parts[i] === 'eval') return true;
	return false;
}
