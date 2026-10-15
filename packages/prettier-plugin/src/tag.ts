import { doc } from 'prettier';
import type { Doc } from 'prettier';

import { expression } from './heads';
import type { HeadContext } from './heads';

const { hardline, literalline } = doc.builders;

type Part =
	| { kind: 'text'; text: string; quoted: boolean }
	| { kind: 'expression'; source: string; quote: string };

/**
 * an open tag with each expression in its braces formatted on one line and
 * the spaces between its attributes folded to one, its line breaks, quotes
 * and the order of its attributes stay as written
 */
export async function print_open_tag(
	tag: string,
	context: HeadContext
): Promise<Doc | undefined> {
	const parts = split(tag);
	if (parts === undefined) return undefined;

	const out: Doc[] = [];
	// nothing but indent is on the line so far
	let line_start = false;
	for (let i = 0; i < parts.length; i++) {
		const part = parts[i];
		if (part.kind === 'expression') {
			out.push('{', await braced(part.source, part.quote, context), '}');
			line_start = false;
			continue;
		}
		if (part.quoted) {
			out.push(lines(part.text, literalline));
			line_start = false;
			continue;
		}
		const last = i === parts.length - 1;
		const text = squash(part.text, line_start, last);
		out.push(lines(text, hardline));
		const nl = text.lastIndexOf('\n');
		line_start = nl !== -1 && text.slice(nl + 1).trim() === '';
	}
	return out;
}

/** what goes in braces, kept as written when it does not format on one line */
async function braced(
	source: string,
	quote: string,
	context: HeadContext
): Promise<string> {
	const trimmed = source.trim();
	if (trimmed === '' || source.includes('\n')) return source;
	// a spread, `{...props}`, and an attachment, `{@attach fn}`
	const prefix = /^(\.\.\.|@attach\s+)/.exec(trimmed)?.[0] ?? '';
	try {
		const code = await expression(trimmed.slice(prefix.length), context);
		// a quote in an expression would end the attribute value holding it
		if (quote !== '' && code.includes(quote)) return source;
		return prefix.trim() === '@attach' ? '@attach ' + code : prefix + code;
	} catch {
		return source;
	}
}

/**
 * the spaces between attributes fold to one, the spaces that start a line
 * stay as its indent and none are kept before the closing >
 */
function squash(text: string, line_start: boolean, last: boolean): string {
	let out = text.replace(/[ \t]+(?=\n)/g, '');
	out = out.replace(
		/(^|\n)([ \t]*)([^\n]*)/g,
		(_, nl: string, indent: string, rest: string) => {
			const kept =
				nl === '' && !line_start ? indent.replace(/^[ \t]+$/, ' ') : indent;
			return nl + kept + rest.replace(/[ \t]{2,}|\t/g, ' ');
		}
	);
	if (last) out = out.replace(/[ \t]+>$/, '>').replace(/[ \t]+\/>$/, ' />');
	return out;
}

function lines(text: string, line_end: Doc): Doc {
	const split = text.split('\n');
	const out: Doc[] = [];
	split.forEach((line, i) => {
		if (i > 0) out.push(line_end);
		out.push(line);
	});
	return out;
}

/** the tag in parts, undefined when a brace is not closed */
function split(tag: string): Part[] | undefined {
	const parts: Part[] = [];
	let text = '';
	let quote = '';
	const flush = () => {
		if (text !== '') parts.push({ kind: 'text', text, quoted: quote !== '' });
		text = '';
	};
	for (let i = 0; i < tag.length; i++) {
		const c = tag[i];
		if (c === '{') {
			const close = matching_brace(tag, i);
			if (close === -1) return undefined;
			flush();
			parts.push({
				kind: 'expression',
				source: tag.slice(i + 1, close),
				quote,
			});
			i = close;
		} else if (quote === '' && (c === '"' || c === "'")) {
			text += c;
			flush();
			quote = c;
		} else if (c === quote) {
			flush();
			quote = '';
			text = c;
		} else {
			text += c;
		}
	}
	flush();
	return parts;
}

/** the } that closes the { at open, past strings and nested brackets */
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
			// a stray closer, the source is broken, keep it as written
			if (expected !== c && !(expected === '`}' && c === '}')) return -1;
			if (expected === '`}') quote = '`';
			if (stack.length === 0) return i;
		}
	}
	return -1;
}
