import { doc } from 'prettier';
import type { Doc } from 'prettier';

import { expression_doc } from './heads.js';
import type { HeadContext } from './heads.js';

const { group, hardline, indent, line, literalline, softline } = doc.builders;
const { replaceEndOfLine } = doc.utils;
const { printDocToString } = doc.printer;

export interface OpenTag {
	name: string;
	attributes: Attribute[];
	self_closing: boolean;
}

type Attribute =
	/** @example {...spread} */
	| { kind: 'braced'; source: string }
	| { kind: 'bare'; name: string }
	| { kind: 'expression'; name: string; source: string }
	| { kind: 'text'; name: string; value: string; quote: string };

export interface TagOptions extends HeadContext {
	/** an attribute expression may take more than one line */
	multiline: boolean;
	bracket_same_line: boolean;
	single_attribute_per_line: boolean;
}

/** an open tag as prettier-plugin-svelte prints one */
export async function print_open_tag(
	tag: OpenTag,
	options: TagOptions | undefined
): Promise<Doc> {
	const attributes: Doc[] = [];
	for (const attribute of tag.attributes) {
		attributes.push(await print_attribute(attribute, options));
	}
	return open_doc(tag, attributes, options);
}

/** an open tag as written, for a host without embedded formatting */
export function plain_open_tag(tag: OpenTag): Doc {
	return open_doc(
		tag,
		tag.attributes.map((attribute) => print_plain(attribute)),
		undefined
	);
}

function open_doc(
	tag: OpenTag,
	attributes: Doc[],
	options: TagOptions | undefined
): Doc {
	const close = tag.self_closing ? '/>' : '>';
	if (attributes.length === 0) {
		return tag.self_closing ? ['<', tag.name, ' />'] : ['<', tag.name, '>'];
	}
	const separator =
		options?.single_attribute_per_line && attributes.length > 1
			? hardline
			: line;
	const parts: Doc[] = [];
	for (const attribute of attributes) parts.push(separator, attribute);
	if (options === undefined || !options.multiline) {
		// a tag in prose stays on its line
		return [
			'<',
			tag.name,
			...parts.map((p) => (p === line || p === hardline ? ' ' : p)),
			tag.self_closing ? ' />' : '>',
		];
	}
	const end = options.bracket_same_line
		? tag.self_closing
			? ' />'
			: '>'
		: [tag.self_closing ? line : softline, close];
	return group(['<', tag.name, indent(parts), end]);
}

async function print_attribute(
	attribute: Attribute,
	options: TagOptions | undefined
): Promise<Doc> {
	if (options === undefined) return print_plain(attribute);
	switch (attribute.kind) {
		case 'bare':
			return attribute.name;
		case 'braced': {
			const inner = attribute.source.trim();
			const prefix = /^(\.\.\.|@attach\s+)/.exec(inner)?.[0] ?? '';
			const code = await code_doc(inner.slice(prefix.length), options);
			if (code === undefined) return braced_as_written(attribute.source);
			return [
				'{',
				prefix.trim() === '@attach' ? '@attach ' : prefix,
				code,
				'}',
			];
		}
		case 'expression': {
			const code = await code_doc(attribute.source, options);
			if (code === undefined) {
				return [attribute.name, '=', braced_as_written(attribute.source)];
			}
			const short = shorthand(attribute.name, attribute.source);
			if (short !== undefined) return short;
			return [attribute.name, '={', code, '}'];
		}
		case 'text':
			return text_value(attribute, options);
	}
}

/** an attribute as written, its value in the quotes it had */
function print_plain(attribute: Attribute): Doc {
	switch (attribute.kind) {
		case 'bare':
			return attribute.name;
		case 'braced':
			return braced_as_written(attribute.source);
		case 'expression':
			return [attribute.name, '=', braced_as_written(attribute.source)];
		case 'text':
			return [
				attribute.name,
				'=',
				attribute.quote,
				lines(attribute.value),
				attribute.quote,
			];
	}
}

function braced_as_written(source: string): Doc {
	return ['{', lines(source), '}'];
}

/** text whose line ends are content, printed exactly */
function lines(text: string): Doc {
	return text.includes('\n') ? replaceEndOfLine(text, literalline) : text;
}

/** the short form of an attribute whose value is its own name */
function shorthand(name: string, source: string): Doc | undefined {
	const value = source.trim();
	if (!/^[\p{L}_$][\p{L}\p{N}_$]*$/u.test(value)) return undefined;
	if (name === value) return ['{', value, '}'];
	const colon = name.indexOf(':');
	if (
		colon !== -1 &&
		!name.startsWith('on:') &&
		name.slice(colon + 1) === value
	) {
		return name;
	}
	return undefined;
}

/** a quoted or bare value, a lone expression in it unquoted */
async function text_value(
	attribute: Extract<Attribute, { kind: 'text' }>,
	options: TagOptions
): Promise<Doc> {
	const { name, value } = attribute;
	const parts = split_value(value);
	if (parts === undefined) return print_plain(attribute);
	if (parts.length === 1 && typeof parts[0] !== 'string') {
		return print_attribute(
			{ kind: 'expression', name, source: parts[0].source },
			options
		);
	}
	const quote = value.includes('"') ? "'" : '"';
	const out: Doc[] = [name, '=', quote];
	for (const part of parts) {
		if (typeof part === 'string') {
			out.push(lines(part));
			continue;
		}
		const code = await code_doc(part.source, { ...options, multiline: false });
		// a quote in the code would end the value holding it
		const flat = code === undefined ? undefined : flat_text(code, options);
		out.push(
			'{',
			flat === undefined || flat.includes(quote) ? lines(part.source) : flat,
			'}'
		);
	}
	out.push(quote);
	return out;
}

/** a doc printed on one line */
function flat_text(code: Doc, options: TagOptions): string {
	return printDocToString(code, {
		...options.options,
		printWidth: Infinity,
	} as Parameters<typeof printDocToString>[1]).formatted;
}

async function code_doc(
	source: string,
	options: TagOptions
): Promise<Doc | undefined> {
	if (source.trim() === '') return undefined;
	try {
		return await expression_doc(source, options, options.multiline);
	} catch {
		return undefined;
	}
}

/** an open tag in parts, undefined for a tag this does not read */
export function parse_open_tag(source: string): OpenTag | undefined {
	const name = /^<([^\s/>{]+)/.exec(source);
	if (name === null || !source.endsWith('>')) return undefined;
	let pos = name[0].length;
	const end = source.length - 1;
	const self_closing = source[end - 1] === '/';
	const stop = self_closing ? end - 1 : end;
	const attributes: Attribute[] = [];
	for (;;) {
		while (pos < stop && /\s/.test(source[pos])) pos++;
		if (pos >= stop) break;
		if (source[pos] === '{') {
			const close = matching_brace(source, pos);
			if (close === -1 || close >= stop) return undefined;
			attributes.push({ kind: 'braced', source: source.slice(pos + 1, close) });
			pos = close + 1;
			continue;
		}
		const name_match = /^[^\s=>"'`{}]+/.exec(source.slice(pos, stop));
		if (name_match === null) return undefined;
		const attr = name_match[0];
		pos += attr.length;
		let look = pos;
		while (look < stop && /\s/.test(source[look])) look++;
		if (source[look] !== '=') {
			attributes.push({ kind: 'bare', name: attr });
			continue;
		}
		pos = look + 1;
		while (pos < stop && /\s/.test(source[pos])) pos++;
		const c = source[pos];
		if (c === '"' || c === "'") {
			const close = source.indexOf(c, pos + 1);
			if (close === -1 || close >= stop) return undefined;
			attributes.push({
				kind: 'text',
				name: attr,
				value: source.slice(pos + 1, close),
				quote: c,
			});
			pos = close + 1;
		} else if (c === '{') {
			const close = matching_brace(source, pos);
			if (close === -1 || close >= stop) return undefined;
			attributes.push({
				kind: 'expression',
				name: attr,
				source: source.slice(pos + 1, close),
			});
			pos = close + 1;
		} else {
			const bare = /^[^\s>"'=`]+/.exec(source.slice(pos, stop));
			if (bare === null) return undefined;
			attributes.push({ kind: 'text', name: attr, value: bare[0], quote: '"' });
			pos += bare[0].length;
		}
		// attributes need space between them
		if (pos < stop && !/\s/.test(source[pos])) return undefined;
	}
	return { name: name[1], attributes, self_closing };
}

/** a value in text and expression parts, undefined when a brace does not close */
function split_value(
	value: string
): (string | { source: string })[] | undefined {
	const parts: (string | { source: string })[] = [];
	let text = '';
	for (let i = 0; i < value.length; i++) {
		if (value[i] !== '{') {
			text += value[i];
			continue;
		}
		const close = matching_brace(value, i);
		if (close === -1) return undefined;
		if (text !== '') parts.push(text);
		text = '';
		parts.push({ source: value.slice(i + 1, close) });
		i = close;
	}
	if (text !== '') parts.push(text);
	return parts;
}

/** the brace that closes the one at open, past strings and nested brackets */
function matching_brace(source: string, open: number): number {
	const stack: string[] = ['}'];
	let quote = '';
	for (let i = open + 1; i < source.length; i++) {
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
		if (c === '"' || c === "'" || c === '`') quote = c;
		else if (c === '{') stack.push('}');
		else if (c === '(') stack.push(')');
		else if (c === '[') stack.push(']');
		else if (c === '}' || c === ')' || c === ']') {
			const expected = stack.pop();
			// a stray closer means broken source
			if (expected !== c && !(expected === '`}' && c === '}')) return -1;
			if (expected === '`}') quote = '`';
			if (stack.length === 0) return i;
		}
	}
	return -1;
}
