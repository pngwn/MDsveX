// 01's v7 reading of a source (lib/experiments/01-wordmark/score.ts on
// p/mdsvex-1.0-design), kept as v7 drew it for the Title: one phrase per node
// on a stave per depth, and every character of the underlay with the voice of
// the node that owns it. The one engine (../score) reads for v12's drawing;
// the home page's Title follows v7, so it keeps v7's reading with it
import { pfm_tree, type PfmNode } from '../pfm';

export type Voice = 'block' | 'inline' | 'svelte' | 'directive' | 'text';

export interface Phrase {
	key: string;
	type: string;
	/** the short name, `head.`, and the full word, `heading` */
	short: string;
	full: string;
	voice: Voice;
	start: number;
	end: number;
	depth: number;
}

export interface Cell {
	char: string;
	index: number;
	/** the voice of the deepest node holding the character */
	voice: Voice;
	/** markup the node owns, as opposed to content that reaches the output */
	syntax: boolean;
	/** the position of a content character in the rendered text, or -1 */
	out: number;
}

export interface Reading {
	source: string;
	phrases: Phrase[];
	cells: Cell[];
	depth: number;
}

const VOICE: Record<string, Voice> = {
	heading: 'block',
	paragraph: 'block',
	list: 'block',
	list_item: 'block',
	block_quote: 'block',
	code_block: 'block',
	table: 'block',
	footnote_definition: 'block',
	emphasis: 'inline',
	strong_emphasis: 'inline',
	link: 'inline',
	code_span: 'inline',
	strikethrough: 'inline',
	superscript: 'inline',
	subscript: 'inline',
	mustache: 'svelte',
	html: 'svelte',
	svelte_block: 'svelte',
	text: 'text',
	frontmatter: 'text',
};

const NAMES: Record<string, [string, string]> = {
	heading: ['head.', 'heading'],
	paragraph: ['para.', 'paragraph'],
	text: ['text', 'text'],
	mustache: ['expr.', 'expression'],
	emphasis: ['emph.', 'emphasis'],
	strong_emphasis: ['str.', 'strong'],
	link: ['link', 'link'],
	code_span: ['code', 'code'],
	list: ['list', 'list'],
	list_item: ['item', 'item'],
	block_quote: ['quote', 'quote'],
	code_block: ['fence', 'fence'],
	table: ['table', 'table'],
	frontmatter: ['front.', 'frontmatter'],
};

export const voice_of = (type: string): Voice => VOICE[type] ?? (type.startsWith('directive') ? 'directive' : 'block');

function names(node: PfmNode): [string, string] {
	if (node.type === 'html') return /^[A-Z]/.test(String(node.tag)) ? ['comp.', 'component'] : ['tag', 'tag'];
	if (node.type.startsWith('directive')) return ['dir.', 'directive'];
	return NAMES[node.type] ?? [node.type, node.type];
}

/** a string literal renders without its quotes, so they are markup too */
const quoted = (node: PfmNode) => node.type === 'mustache' && /^(["'`]).*\1$/s.test(String(node.value ?? ''));

export function read(source: string): Reading {
	const root = pfm_tree(source);
	const phrases: Phrase[] = [];
	const owner: PfmNode[] = Array.from(source, () => root);
	let depth = 0;

	const walk = (node: PfmNode, d: number) => {
		const [short, full] = names(node);
		phrases.push({ key: `${node.type}:${node.start}`, type: node.type, short, full, voice: voice_of(node.type), start: node.start, end: node.end, depth: d });
		depth = Math.max(depth, d + 1);
		for (let i = node.start; i < node.end; i++) owner[i] = node;
		for (const child of node.children ?? []) walk(child, d + 1);
	};
	for (const child of root.children ?? []) walk(child, 0);

	let out = 0;
	const cells = Array.from(source, (char, index): Cell => {
		const node = owner[index];
		const [from, to] = node.value_range ?? [node.start, node.end];
		const owns_markup = node !== root && node.type !== 'paragraph';
		const syntax =
			owns_markup && (index < from || index >= to || (quoted(node) && (index === from || index === to - 1)));
		return { char, index, voice: node === root ? 'text' : voice_of(node.type), syntax, out: syntax ? -1 : out++ };
	});

	return { source, phrases, cells, depth };
}

export interface Lit {
	start: number;
	end: number;
	voice: Voice;
}

export const covers = (lit: Lit | null, start: number, end = start + 1) =>
	!!lit && Math.max(start, lit.start) < Math.min(end, lit.end);
