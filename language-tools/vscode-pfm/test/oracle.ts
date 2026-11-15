/**
 * the parser as an oracle for the grammar, every generated word gets the
 * families of the nodes around it from @mdsvex/parse and the families of its
 * scopes from the grammar, and the two must agree
 */
import { parse_markdown_svelte } from '../../../packages/parse/src/main';
import type { NodeBuffer } from '../../../packages/parse/src/utils';

import { type Token, tokenize } from './grammar';

/** a construct both sides can name */
export type Family =
	| 'italic'
	| 'bold'
	| 'strike'
	| 'sup'
	| 'sub'
	| 'heading'
	| 'fence'
	| 'link'
	| 'image'
	| 'raw'
	| 'math'
	| 'comment'
	| 'frontmatter'
	| 'directive'
	| 'table'
	| 'expr'
	| 'tag'
	| 'import';

/** the families the parser puts a source offset in */
export function ast_families(
	nodes: NodeBuffer,
	source: string,
	at: number
): Set<Family> {
	const out = new Set<Family>();
	const walk = (index: number): void => {
		const node = nodes.get_node(index);
		if (index !== 0 && !(node.start <= at && at < node.end)) return;
		const [vs, ve] = node.value;
		// the label of a container is on the line that opens it
		const inside_kids = node.children.some((kid) => {
			const k = nodes.get_node(kid);
			return k.kind !== 'directive_label' && k.start <= at && at < k.end;
		});
		switch (node.kind) {
			case 'emphasis':
				out.add('italic');
				break;
			case 'strong_emphasis':
				out.add('bold');
				break;
			case 'strikethrough':
				out.add('strike');
				break;
			case 'superscript':
				out.add('sup');
				break;
			case 'subscript':
				out.add('sub');
				break;
			case 'heading':
				out.add('heading');
				break;
			case 'code_fence':
				out.add('fence');
				break;
			case 'link':
				out.add('link');
				break;
			case 'image':
				out.add('image');
				break;
			case 'code_span':
				out.add(node.metadata.math ? 'math' : 'raw');
				break;
			case 'html_comment':
				out.add('comment');
				break;
			case 'frontmatter':
				out.add('frontmatter');
				break;
			case 'directive_inline':
			case 'directive_leaf':
				out.add('directive');
				break;
			case 'directive_container':
				// only the line that opens it
				if (!inside_kids && !source.slice(node.start, at).includes('\n'))
					out.add('directive');
				break;
			case 'table':
				out.add('table');
				break;
			case 'mustache':
			case 'svelte_tag':
				out.add('expr');
				break;
			case 'svelte_block':
			case 'svelte_branch':
				if (!inside_kids) out.add('expr');
				break;
			case 'html':
				if (
					node.metadata.self_closing ||
					at < vs ||
					at >= ve ||
					(vs === ve && !inside_kids)
				)
					out.add('tag');
				break;
			case 'import_statement':
				out.add('import');
				break;
		}
		for (const kid of node.children) walk(kid);
	};
	walk(0);
	return out;
}

/** the families the grammar puts a token in */
export function tm_families(scopes: string[]): Set<Family> {
	const out = new Set<Family>();
	for (const scope of scopes) {
		if (scope.startsWith('markup.italic')) out.add('italic');
		else if (scope.startsWith('markup.bold')) out.add('bold');
		else if (scope.startsWith('markup.strikethrough')) out.add('strike');
		else if (scope.startsWith('markup.superscript')) out.add('sup');
		else if (scope.startsWith('markup.subscript')) out.add('sub');
		else if (scope.startsWith('markup.heading')) out.add('heading');
		else if (scope.startsWith('markup.fenced_code')) out.add('fence');
		else if (
			scope.startsWith('meta.link.inline') ||
			scope.startsWith('meta.link.autolink') ||
			scope === 'meta.link.reference.pfm'
		)
			out.add('link');
		else if (scope.startsWith('meta.image')) out.add('image');
		else if (scope.startsWith('markup.math')) out.add('math');
		else if (
			scope.startsWith('markup.raw.inline') ||
			scope.startsWith('markup.inline.raw')
		)
			out.add('raw');
		else if (scope.startsWith('comment.block.html')) out.add('comment');
		else if (scope.startsWith('meta.frontmatter')) out.add('frontmatter');
		else if (scope === 'meta.directive.pfm') out.add('directive');
		else if (scope.startsWith('markup.table')) out.add('table');
		else if (scope.startsWith('meta.svelte')) out.add('expr');
		else if (
			scope.startsWith('meta.tag') ||
			// the tag names and attributes of script and style blocks
			scope === 'entity.name.tag.html' ||
			scope === 'entity.other.attribute-name.html'
		)
			out.add('tag');
		else if (scope.startsWith('meta.import')) out.add('import');
	}
	// math is a code span with dollars on both sides
	if (out.has('math')) out.delete('raw');
	// a fence of the document language reads its code as a document
	if (scopes.includes('meta.embedded.block.pfm')) return new Set(['fence']);
	return out;
}

export interface Mismatch {
	word: string;
	/** missing and extra families, the key a failure is grouped by */
	key: string;
	line: string;
}

const WORD = /q\d{3,}/g;
/** every word of a document a person wrote */
const ANY_WORD = /[A-Za-z][A-Za-z0-9]*/g;

function token_at(tokens: Token[], at: number): Token | undefined {
	for (const token of tokens)
		if (token.start <= at && at < token.end) return token;
	return undefined;
}

/** every word whose families differ between the parser and the grammar */
export async function mismatches(
	source: string,
	every_word = false
): Promise<Mismatch[]> {
	const { nodes } = parse_markdown_svelte(source);
	const tokens = await tokenize(source);
	const out: Mismatch[] = [];
	for (const match of source.matchAll(every_word ? ANY_WORD : WORD)) {
		const at = match.index;
		const want = ast_families(nodes, source, at);
		const token = token_at(tokens, at);
		const got = tm_families(token?.scopes ?? []);
		const missing = [...want].filter((f) => !got.has(f)).sort();
		const extra = [...got].filter((f) => !want.has(f)).sort();
		if (missing.length === 0 && extra.length === 0) continue;
		const from = source.lastIndexOf('\n', at - 1) + 1;
		const to = source.indexOf('\n', at);
		out.push({
			word: match[0],
			key:
				(missing.length ? `-${missing.join(',-')}` : '') +
				(missing.length && extra.length ? ' ' : '') +
				(extra.length ? `+${extra.join(',+')}` : ''),
			line: source.slice(from, to === -1 ? source.length : to),
		});
	}
	return out;
}
