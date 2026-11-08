// a plugin's options, read from the interface its factory takes, as written in
// its source with the doc comment of each. The plugins already document every
// option there for editors, so the finder searches the same words a reader's
// editor shows them, and a new option shows up with no list to edit
import type { Option } from './types';

/** the text between a brace and the one that closes it */
function block(source: string, open: number): string {
	let depth = 0;
	for (let i = open; i < source.length; i++) {
		if (source[i] === '{') depth++;
		else if (source[i] === '}' && --depth === 0) return source.slice(open + 1, i);
	}
	return '';
}

/** a doc comment as prose, its tags taken apart */
function doc_of(comment: string): { text: string; default?: string; example?: string } {
	const lines = comment
		.replace(/^\/\*\*|\*\/$/g, '')
		.split('\n')
		.map((line) => line.replace(/^\s*\* ?/, ''));
	const text: string[] = [];
	let tag: 'default' | 'example' | null = null;
	const tags: { default?: string[]; example?: string[] } = {};
	for (const line of lines) {
		const at = /^@(default|example)\s*(.*)$/.exec(line.trim());
		if (at) {
			tag = at[1] as 'default' | 'example';
			tags[tag] = at[2] ? [at[2]] : [];
		} else if (tag) tags[tag]!.push(line);
		else text.push(line.trim());
	}
	return {
		text: text.join(' ').replace(/\s+/g, ' ').trim(),
		default: tags.default?.join(' ').trim() || undefined,
		example: tags.example?.join('\n').trim() || undefined,
	};
}

/** the members of `export interface <name>`, each with its type and doc */
export function options_of(source: string, name: string): Option[] {
	const head = new RegExp(`export interface ${name}\\b[^{]*\\{`).exec(source);
	if (!head) return [];
	const body = block(source, head.index + head[0].length - 1);
	const out: Option[] = [];
	// a member is its doc comment, if any, then `name?: type;`, the type running to the semicolon at depth 0
	let i = 0;
	let comment = '';
	while (i < body.length) {
		const rest = body.slice(i);
		const space = /^\s+/.exec(rest);
		if (space) {
			i += space[0].length;
			continue;
		}
		if (rest.startsWith('/**')) {
			const end = rest.indexOf('*/') + 2;
			comment = rest.slice(0, end);
			i += end;
			continue;
		}
		if (rest.startsWith('//')) {
			i += rest.indexOf('\n') + 1 || rest.length;
			continue;
		}
		const member = /^(\w+)(\??):\s*/.exec(rest);
		if (!member) break;
		let j = member[0].length;
		let depth = 0;
		for (; j < rest.length; j++) {
			const c = rest[j];
			if ('({[<'.includes(c)) depth++;
			else if (')}]>'.includes(c) && rest[j - 1] !== '=') depth--;
			else if (c === ';' && depth === 0) break;
		}
		const type = rest.slice(member[0].length, j).replace(/\s+/g, ' ').trim();
		const doc = comment ? doc_of(comment) : { text: '' };
		out.push({ name: member[1], optional: member[2] === '?', type, ...doc });
		comment = '';
		i += j + 1;
	}
	return out;
}

/** the factory a plugin exports, and the name of the options interface it takes */
export function factory_of(source: string): { name: string; options: string | null } | null {
	const fn = /export (?:declare )?function (\w+)\(\s*(?:\w+\??\s*:\s*(\w+))?[^)]*\)\s*:\s*Bundle\b/.exec(source);
	return fn ? { name: fn[1], options: fn[2] ?? null } : null;
}
