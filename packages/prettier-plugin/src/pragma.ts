import { parse } from './ast.js';

// the comments prettier reads in markdown, at the top or after the frontmatter
const PRAGMA = /^\s*<!--\s*@(?:format|prettier)\s*-->/;
const IGNORE_PRAGMA = /^\s*<!--\s*@(?:noformat|noprettier)\s*-->/;

export function has_pragma(text: string): boolean {
	return PRAGMA.test(content(text));
}

export function has_ignore_pragma(text: string): boolean {
	return IGNORE_PRAGMA.test(content(text));
}

export function insert_pragma(text: string): string {
	const split = frontmatter_end(text);
	const frontmatter = text.slice(0, split);
	const rest = text.slice(split).trimStart();
	const pragma = '<!-- @format -->';
	const body = rest === '' ? pragma + '\n' : pragma + '\n\n' + rest;
	return frontmatter === '' ? body : frontmatter.trimEnd() + '\n\n' + body;
}

function content(text: string): string {
	return text.slice(frontmatter_end(text));
}

function frontmatter_end(text: string): number {
	if (!text.startsWith('---')) return 0;
	const first = parse(text).children[0];
	return first?.type === 'frontmatter' ? first.end : 0;
}
