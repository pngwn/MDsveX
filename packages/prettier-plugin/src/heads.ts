import { doc } from 'prettier';
import type { Doc, Options } from 'prettier';

const { removeLines, willBreak } = doc.utils;
const { printDocToString } = doc.printer;

type TextToDoc = (text: string, options: Options) => Promise<Doc>;

export interface HeadContext {
	text_to_doc: TextToDoc;
	options: Options;
	/** the script of the document is typescript */
	ts: boolean;
}

/** what follows the keyword of a block head or const tag on one line, undefined to keep it as written */
export async function head(
	tag: string,
	source: string,
	context: HeadContext
): Promise<string | undefined> {
	try {
		switch (tag) {
			case 'if':
			case 'else if':
			case 'key':
				return await expression(source, context);
			case 'each':
				return await each(source, context);
			case 'await':
				return await await_head(source, context);
			case 'then':
			case 'catch':
				return await pattern(source, context);
			case 'snippet':
				return await snippet(source, context);
			case 'const':
				return await declaration(source, context);
		}
	} catch {
		// a part that does not parse keeps the head as written
	}
	return undefined;
}

/** @example items as item, i (item.id) */
async function each(source: string, context: HeadContext): Promise<string> {
	const top = top_level(source);
	const as = keyword(source, 'as', top);
	if (as === -1) {
		// an index without a binding
		const comma = last_top(source, ',', top);
		if (comma === -1) return expression(source, context);
		return `${await expression(source.slice(0, comma), context)}, ${index(source.slice(comma + 1))}`;
	}

	const list = await expression(source.slice(0, as), context);
	let rest = source.slice(as + 2).trim();
	let key: string | undefined;
	const open = key_open(rest);
	if (open !== -1) {
		key = await expression(rest.slice(open + 1, -1), context);
		rest = rest.slice(0, open).trim();
	}
	const comma = last_top(rest, ',', top_level(rest));
	const binding = await pattern(
		comma === -1 ? rest : rest.slice(0, comma),
		context
	);
	let out = `${list} as ${binding}`;
	if (comma !== -1) out += `, ${index(rest.slice(comma + 1))}`;
	if (key !== undefined) out += ` (${key})`;
	return out;
}

/** @example promise then value */
async function await_head(
	source: string,
	context: HeadContext
): Promise<string> {
	const top = top_level(source);
	const then = keyword(source, 'then', top);
	const caught = keyword(source, 'catch', top);
	const at =
		then === -1 ? caught : caught === -1 ? then : Math.min(then, caught);
	if (at === -1) return expression(source, context);
	const word = at === then ? 'then' : 'catch';
	const promise = await expression(source.slice(0, at), context);
	const binding = source.slice(at + word.length).trim();
	if (binding === '') return `${promise} ${word}`;
	return `${promise} ${word} ${await pattern(binding, context)}`;
}

/** @example total = a + b */
async function declaration(
	source: string,
	context: HeadContext
): Promise<string> {
	return unwrap(
		await one_line(`const ${source};`, js(context), context),
		/^const (.*);$/
	);
}

/** @example name(params) */
async function snippet(source: string, context: HeadContext): Promise<string> {
	return unwrap(
		await one_line(`function ${source} {}`, js(context), context),
		/^function (.*) \{\}$/
	);
}

export function expression(
	source: string,
	context: HeadContext
): Promise<string> {
	return one_line(
		source,
		context.ts ? '__ts_expression' : '__js_expression',
		context
	);
}

/** an expression as a doc, on one line unless it may take more */
export async function expression_doc(
	source: string,
	context: HeadContext,
	multiline: boolean
): Promise<Doc> {
	const parser = context.ts ? '__ts_expression' : '__js_expression';
	const code = await context.text_to_doc(source, { parser });
	if (multiline) return code;
	const line = removeLines(code);
	if (willBreak(line)) throw new Error('more than one line');
	return line;
}

/** @example { id, name } */
async function pattern(source: string, context: HeadContext): Promise<string> {
	return unwrap(
		await one_line(`let ${source} = 0;`, js(context), context),
		/^let (.*) = 0;$/
	);
}

function index(source: string): string {
	const name = source.trim();
	if (!/^[\p{L}_$][\p{L}\p{N}_$]*$/u.test(name))
		throw new Error('not an index name');
	return name;
}

function js(context: HeadContext): string {
	return context.ts ? 'babel-ts' : 'babel';
}

/** a block head has no line ends */
async function one_line(
	code: string,
	parser: string,
	context: HeadContext
): Promise<string> {
	// a semicolon ends the declarations the bindings are wrapped in
	const printed = await context.text_to_doc(code, { parser, semi: true });
	const { formatted } = printDocToString(removeLines(printed), {
		...context.options,
		printWidth: Infinity,
	} as Parameters<typeof printDocToString>[1]);
	if (formatted.includes('\n')) throw new Error('more than one line');
	return formatted;
}

function unwrap(code: string, wrapper: RegExp): string {
	const match = wrapper.exec(code);
	if (match === null) throw new Error('wrapper changed');
	return match[1];
}

/** whether each char sits outside brackets and strings, a bracket counts as outside */
function top_level(source: string): boolean[] {
	const top: boolean[] = new Array(source.length).fill(false);
	// the closers expected, a backtick brace closes an expression in a template string
	const stack: string[] = [];
	let quote = '';
	for (let i = 0; i < source.length; i++) {
		const c = source[i];
		if (quote !== '') {
			if (c === '\\') i++;
			else if (quote === '`' && c === '$' && source[i + 1] === '{') {
				stack.push('`}');
				quote = '';
				i++;
			} else if (c === quote) quote = '';
			continue;
		}
		const outside = stack.length === 0;
		if (c === '"' || c === "'" || c === '`') quote = c;
		else if (c === '(') stack.push(')');
		else if (c === '[') stack.push(']');
		else if (c === '{') stack.push('}');
		else if (c === ')' || c === ']' || c === '}') {
			if (stack.pop() === '`}') quote = '`';
			top[i] = stack.length === 0;
			continue;
		}
		top[i] = outside;
	}
	return top;
}

/** the first word on its own outside brackets, between spaces */
function keyword(source: string, word: string, top: boolean[]): number {
	for (let i = 1; i < source.length; i++) {
		if (!top[i] || !source.startsWith(word, i)) continue;
		const after = source[i + word.length];
		if (/\s/.test(source[i - 1]) && (after === undefined || /\s/.test(after)))
			return i;
	}
	return -1;
}

function last_top(source: string, char: string, top: boolean[]): number {
	for (let i = source.length - 1; i >= 0; i--)
		if (top[i] && source[i] === char) return i;
	return -1;
}

/** the open paren of the key that ends an each head */
function key_open(source: string): number {
	if (!source.endsWith(')')) return -1;
	const top = top_level(source);
	const open = last_top(source, '(', top);
	if (open <= 0) return -1;
	for (let i = open + 1; i < source.length - 1; i++) if (top[i]) return -1;
	return open;
}
