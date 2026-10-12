import { random } from './stream_shape';

/**
 * one construct of a generated document, a block or an inline
 * the kids of a block are its blocks, items, branches, rows or inline content
 */
export interface Piece {
	kind: string;
	/** which spelling of the kind, 0 is the plainest */
	form: number;
	kids: Piece[];
	/** the words it writes, each one unique in its document */
	words: string[];
	/** what is written between it and the piece before */
	join: string;
}

export type Container =
	| 'root'
	| 'block_quote'
	| 'list_item'
	| 'html_element'
	| 'svelte_branch'
	| 'directive_container';

export const CONTAINERS: Container[] = [
	'block_quote',
	'list_item',
	'html_element',
	'svelte_branch',
	'directive_container',
];

/** block kinds that hold blocks, with the container their kids are in */
const HOLDS: Record<string, Container> = {
	block_quote: 'block_quote',
	list_item: 'list_item',
	html_element: 'html_element',
	svelte_branch: 'svelte_branch',
	directive_container: 'directive_container',
};

const INLINE_HOLDERS = new Set([
	'emphasis',
	'strong',
	'strikethrough',
	'superscript',
	'subscript',
	'link',
	'ref_link',
	'directive_inline',
	'html_inline',
]);

const INLINE_BLOCKS = new Set([
	'paragraph',
	'heading',
	'table_cell',
	'directive_leaf',
	'html_line',
]);

function piece(kind: string, form = 0, kids: Piece[] = []): Piece {
	return { kind, form, kids, words: [], join: ' ' };
}

interface InlineContext {
	depth: number;
	/** a line end may sit between two pieces */
	lines: boolean;
	/** links, images and autolinks, not in a link or a directive label */
	links: boolean;
	/** a bare pipe, not in a table cell */
	pipes: boolean;
}

const MARKERS = ['-', '*', '+', '1.', '7.'];
const HTML_BLOCKS = ['<div>', '<section class="note">', '<Box>', '<details>'];
const BREAKS = ['---', '***', '___'];
const ESCAPES = ['\\*', '\\_', '\\{', '\\[', '\\<', '\\`', '&amp;', '\\~'];

export class Grammar {
	private rand: () => number;
	private count = 0;
	private defined: string[] = [];

	constructor(seed: number) {
		this.rand = random(seed);
	}

	private int(below: number): number {
		return Math.floor(this.rand() * below);
	}

	private chance(of: number): boolean {
		return this.rand() < of;
	}

	private word(): string {
		return `q${String(this.count++).padStart(3, '0')}`;
	}

	private with_words(p: Piece, count: number): Piece {
		for (let i = 0; i < count; i++) p.words.push(this.word());
		return p;
	}

	private inline_one(ctx: InlineContext): Piece {
		const deep = { ...ctx, depth: ctx.depth + 1 };
		const roll = ctx.depth >= 2 ? 0 : this.int(40);
		const holder = (kind: string, form = 0, words = 0): Piece =>
			this.with_words(piece(kind, form, this.inline(deep)), words);
		switch (roll) {
			case 10:
			case 11:
				return holder('emphasis');
			case 12:
			case 13:
				return holder('strong');
			case 14:
				return holder('strikethrough');
			case 15:
				return this.with_words(piece('superscript'), 1);
			case 16:
				return this.with_words(piece('subscript'), 1);
			case 17:
			case 18:
			case 19: {
				const form = this.int(ctx.lines ? 6 : 5);
				return this.with_words(piece('code_span', form), 2);
			}
			case 20:
			case 21:
				if (!ctx.links) break;
				return this.with_words(
					piece('link', this.int(2), this.inline({ ...deep, links: false })),
					2
				);
			case 22:
				if (!ctx.links || this.defined.length === 0) break;
				return piece(
					'ref_link',
					1 + this.int(this.defined.length),
					this.inline({ ...deep, links: false })
				);
			case 23:
				if (!ctx.links) break;
				return this.with_words(piece('autolink'), 1);
			case 24:
				if (!ctx.links) break;
				return this.with_words(piece('image', this.int(2)), 3);
			case 25:
			case 26: {
				const form = this.int(3);
				const kids = form === 2 ? [] : this.inline({ ...deep, links: false });
				return this.with_words(piece('directive_inline', form, kids), 1);
			}
			case 27:
			case 28: {
				const form = this.int(3);
				return holder('html_inline', form, 2);
			}
			case 29:
				return this.with_words(piece('html_void', this.int(3)), 1);
			case 30:
			case 31:
				return this.with_words(piece('mustache', this.int(3)), 2);
			case 32:
			case 33:
				return this.with_words(piece('escape', this.int(ESCAPES.length)), 1);
			case 34:
				if (!ctx.pipes) break;
				return this.with_words(piece('intraword', this.int(2)), 3);
			case 35:
				return this.with_words(piece('comment_inline'), 1);
			case 36:
				if (!ctx.pipes) break;
				return this.with_words(piece('pipe'), 1);
			case 37:
				return this.with_words(piece('punctuated', this.int(4)), 1);
		}
		return this.with_words(piece('word'), 1);
	}

	private inline(ctx: InlineContext): Piece[] {
		const count = 1 + this.int(ctx.depth === 0 ? 4 : 2);
		const out: Piece[] = [];
		for (let i = 0; i < count; i++) {
			const next = this.inline_one(ctx);
			if (i > 0 && ctx.lines) {
				const roll = this.int(10);
				if (roll < 2) next.join = '\n';
				else if (roll === 2) next.join = '\\\n';
			}
			out.push(next);
		}
		return out;
	}

	private text(lines: boolean, pipes = true): Piece[] {
		return this.inline({ depth: 0, lines, links: true, pipes });
	}

	private label(): Piece[] {
		return this.inline({ depth: 1, lines: false, links: false, pipes: true });
	}

	private block(depth: number, root_only: boolean): Piece {
		const roll = this.int(depth < 2 ? 40 : 26);
		switch (roll) {
			case 8:
			case 9:
				return piece('heading', 1 + this.int(3), this.text(false));
			case 10:
			case 11:
				return this.with_words(piece('code_fence', this.int(6)), 3);
			case 12:
				return piece('thematic_break', this.int(BREAKS.length));
			case 13:
			case 14: {
				const cols = 1 + this.int(3);
				const rows: Piece[] = [];
				const count = 1 + this.int(3);
				for (let r = 0; r < count; r++) {
					const cells: Piece[] = [];
					for (let c = 0; c < cols; c++) {
						cells.push(piece('table_cell', 0, this.text(false, false)));
					}
					rows.push(piece('table_row', 0, cells));
				}
				return piece('table', this.int(2), rows);
			}
			case 15:
				return piece('html_line', this.int(2), this.text(false));
			case 16:
				return this.with_words(piece('comment', this.int(2)), 2);
			case 17:
				return piece('raw_element', this.int(2));
			case 18:
			case 19: {
				const form = this.int(4);
				const kids = form === 0 || form === 3 ? [] : this.label();
				return this.with_words(piece('directive_leaf', form, kids), 1);
			}
			case 20:
				this.defined.push(`r${this.defined.length + 1}`);
				return piece('definition', this.defined.length);
			case 21:
				return this.with_words(piece('svelte_tag'), 1);
			case 22:
				return this.with_words(piece('component'), 1);
			case 23:
				if (!root_only) break;
				return this.with_words(piece('import'), 1);
			case 26:
			case 27:
			case 28:
				return piece('block_quote', 0, this.blocks(depth + 1));
			case 29:
			case 30:
			case 31:
			case 32: {
				const items: Piece[] = [];
				const count = 1 + this.int(3);
				const form = this.int(MARKERS.length);
				const loose = this.chance(0.3);
				for (let i = 0; i < count; i++) {
					const item = piece('list_item', 0, this.blocks(depth + 1));
					item.join = loose ? '\n\n' : '\n';
					items.push(item);
				}
				return piece('list', form, items);
			}
			case 33:
			case 34:
				return piece(
					'html_element',
					this.int(HTML_BLOCKS.length),
					this.blocks(depth + 1)
				);
			case 35:
			case 36: {
				const form = this.int(3);
				const branches = [piece('svelte_branch', 0, this.blocks(depth + 1))];
				if (form === 1) {
					branches.push(piece('svelte_branch', 1, this.blocks(depth + 1)));
				}
				return this.with_words(piece('svelte_block', form, branches), 1);
			}
			case 37:
			case 38:
			case 39: {
				const form = this.int(3);
				const p = piece('directive_container', form, this.blocks(depth + 1));
				return form === 2 ? this.with_words(p, 1) : p;
			}
		}
		return piece('paragraph', 0, this.text(true));
	}

	private blocks(depth: number, root_only = false): Piece[] {
		const count = 1 + this.int(depth === 0 ? 4 : 2);
		const out: Piece[] = [];
		for (let i = 0; i < count; i++) {
			const next = this.block(depth, root_only);
			const roll = this.int(10);
			next.join = roll < 7 ? '\n\n' : roll === 7 ? '\n\n\n' : '\n';
			out.push(next);
		}
		return out;
	}

	/** blocks that every container can hold */
	document(): Piece[] {
		return this.blocks(0);
	}

	/** a whole file, which may open with frontmatter and hold imports */
	file(): Piece[] {
		const out = this.blocks(0, true);
		if (this.chance(0.15)) {
			const front = this.with_words(piece('frontmatter'), 1);
			out[0].join = this.chance(0.5) ? '\n' : '\n\n';
			out.unshift(front);
		}
		return out;
	}

	/** the content of one table cell or one line of a paragraph */
	cell(): Piece[] {
		return this.text(false, false);
	}

	/** how a file ends */
	ending(): string {
		return ['\n', '', '\n\n'][this.int(3)];
	}
}

function code_span(p: Piece): string {
	const [a, b] = p.words;
	switch (p.form) {
		case 1:
			return `\` ${a} \``;
		case 2:
			return `\`\`${a} \` ${b}\`\``;
		case 3:
			return `\`*${a}* <b> {${b}} \\\``;
		case 4:
			return `\` ${a}\``;
		case 5:
			return `\`${a}\n${b}\``;
	}
	return `\`${a}\``;
}

function inline_one(p: Piece): string {
	const [a, b, c] = p.words;
	const inner = (): string => inline_text(p.kids);
	switch (p.kind) {
		case 'emphasis':
			return `_${inner()}_`;
		case 'strong':
			return `*${inner()}*`;
		case 'strikethrough':
			return `~~${inner()}~~`;
		case 'superscript':
			return `^${a}^`;
		case 'subscript':
			return `~${a}~`;
		case 'code_span':
			return code_span(p);
		case 'link':
			return p.form === 1
				? `[${inner()}](/${a} "${b}")`
				: `[${inner()}](/${a})`;
		case 'ref_link':
			return `[${inner()}][r${p.form}]`;
		case 'autolink':
			return `<https://${a}.example>`;
		case 'image':
			return p.form === 1 ? `![${a}](/${b} "${c}")` : `![${a}](/${b})`;
		case 'directive_inline':
			if (p.form === 2) return `:tag[](k=${a})`;
			return p.form === 1 ? `:tag[${inner()}](k=${a})` : `:tag[${inner()}]`;
		case 'html_inline':
			if (p.form === 1) return `<span class="${a}">${inner()}</span>`;
			if (p.form === 2) return `<Badge value={${a}}>${inner()}</Badge>`;
			return `<b>${inner()}</b>`;
		case 'html_void':
			return ['<br />', `<Badge value="${a}" />`, `<img alt="${a}">`][p.form];
		case 'mustache':
			return [`{${a}}`, `{${a} + ${b}}`, `{@html ${a}}`][p.form];
		case 'escape':
			return `${ESCAPES[p.form]}${a}`;
		case 'intraword':
			return p.form === 1 ? `${a}|*${b}*|${c}` : `${a}|_${b}_|${c}`;
		case 'comment_inline':
			return `<!-- ${a} -->`;
		case 'pipe':
			return `| ${a}`;
		case 'punctuated':
			return [`${a}.`, `(${a})`, `"${a}",`, `${a}:`][p.form];
	}
	return a;
}

export function inline_text(pieces: Piece[]): string {
	let out = '';
	for (let i = 0; i < pieces.length; i++) {
		if (i > 0) out += pieces[i].join;
		out += inline_one(pieces[i]);
	}
	return out;
}

function quoted(rows: string[]): string[] {
	return rows.map((row) => (row === '' ? '>' : `> ${row}`));
}

function indented(marker: string, rows: string[]): string[] {
	const pad = ' '.repeat(marker.length + 1);
	return rows.map((row, i) =>
		i === 0 ? `${marker} ${row}` : row === '' ? '' : pad + row
	);
}

function fence(p: Piece): string[] {
	const [a, b, c] = p.words;
	const mark = p.form % 2 === 0 ? '```' : '````';
	const info = p.form < 2 ? '' : 'js';
	// lines that would be blocks outside a fence
	const body = p.form < 4 ? [a, b] : [`# ${a}`, '', `> ${b}`, `- ${c} *x*`];
	return [mark + info, ...body, mark];
}

function block_rows(p: Piece): string[] {
	const [a, b] = p.words;
	switch (p.kind) {
		case 'paragraph':
			return inline_text(p.kids).split('\n');
		case 'heading':
			return [`${'#'.repeat(p.form)} ${inline_text(p.kids)}`];
		case 'code_fence':
			return fence(p);
		case 'thematic_break':
			return [BREAKS[p.form]];
		case 'table': {
			const rows = p.kids.map(
				(row) => `| ${row.kids.map((c) => inline_text(c.kids)).join(' | ')} |`
			);
			const cols = p.kids[0].kids.length;
			const rule = p.form === 1 ? '|:-:'.repeat(cols) : '|---'.repeat(cols);
			return [rows[0], `${rule}|`, ...rows.slice(1)];
		}
		case 'html_line': {
			const tag = p.form === 1 ? 'p' : 'div';
			return [`<${tag}>${inline_text(p.kids)}</${tag}>`];
		}
		case 'comment':
			return p.form === 1 ? [`<!-- ${a}`, `${b} -->`] : [`<!-- ${a} ${b} -->`];
		case 'raw_element':
			return p.form === 1
				? ['<style>', 'p { color: red; }', '</style>']
				: ['<script>', 'let v = 1 < 2;', '</script>'];
		case 'directive_leaf': {
			const text = inline_text(p.kids);
			return [
				[
					`::leaf`,
					`::leaf[${text}]`,
					`::leaf[${text}](k=${a})`,
					`::leaf(k=${a})`,
				][p.form],
			];
		}
		case 'definition':
			return [
				p.form % 2 === 0 ? `[r${p.form}]: /ref` : `[r${p.form}]: /ref "t"`,
			];
		case 'svelte_tag':
			return [`{@html ${a}}`];
		case 'component':
			return [`<Chart data={${a}} />`];
		case 'import':
			return [`import Thing from './${a}.svelte';`];
		case 'frontmatter':
			return ['---', `title: ${a}`, '---'];
		case 'block_quote':
			return quoted(rows_of(p.kids));
		case 'list': {
			const out: string[] = [];
			p.kids.forEach((item, i) => {
				if (i > 0 && item.join === '\n\n') out.push('');
				out.push(...indented(MARKERS[p.form], rows_of(item.kids)));
			});
			return out;
		}
		case 'html_element': {
			const open = HTML_BLOCKS[p.form];
			const name = /^<(\w+)/.exec(open)![1];
			return [open, ...rows_of(p.kids), `</${name}>`];
		}
		case 'svelte_block': {
			if (p.form === 2) {
				return [`{#each ${a} as x}`, ...rows_of(p.kids[0].kids), '{/each}'];
			}
			const out = [`{#if ${a}}`, ...rows_of(p.kids[0].kids)];
			if (p.kids.length > 1) out.push('{:else}', ...rows_of(p.kids[1].kids));
			out.push('{/if}');
			return out;
		}
		case 'directive_container': {
			const open = [':::box', ':::box[title]', `:::box(k=${a})`][p.form];
			return [open, ...rows_of(p.kids), ':::'];
		}
	}
	throw new Error(`no rows for ${p.kind}`);
}

/** the lines of a run of blocks */
export function rows_of(blocks: Piece[]): string[] {
	const out: string[] = [];
	blocks.forEach((block, i) => {
		if (i > 0) {
			for (let n = 1; n < block.join.length; n++) out.push('');
		}
		out.push(...block_rows(block));
	});
	return out;
}

/** the lines of a document as the one child of a container */
export function contained(container: Container, rows: string[]): string[] {
	switch (container) {
		case 'block_quote':
			return quoted(rows);
		case 'list_item':
			return indented('-', rows);
		case 'html_element':
			return ['<div>', ...rows, '</div>'];
		case 'svelte_branch':
			return ['{#if x}', ...rows, '{/if}'];
		case 'directive_container':
			return [':::box', ...rows, ':::'];
	}
	return rows;
}

/**
 * the document with a blank line where two blocks would read as one without it
 * two quotes are one quote, a 7. after a paragraph is its text as only 1. ends one,
 * and an element that opens under a line of only a tag is inline in that line's paragraph,
 * as a component is under any block that ends in a line of text
 */
export function spaced(blocks: Piece[]): Piece[] {
	return blocks.map((p, i) => {
		const joins =
			p.join === '\n' &&
			i > 0 &&
			((p.kind === 'list' && MARKERS[p.form] === '7.') ||
				(p.kind === 'block_quote' && blocks[i - 1].kind === 'block_quote') ||
				(p.kind === 'html_element' &&
					(blocks[i - 1].kind === 'svelte_tag' ||
						blocks[i - 1].kind === 'component' ||
						// <Box> is no block level tag, it ends no paragraph, list item or table
						HTML_BLOCKS[p.form] === '<Box>')));
		return { ...p, kids: spaced(p.kids), join: joins ? '\n\n' : p.join };
	});
}

function copy(p: Piece): Piece {
	return { ...p, kids: p.kids.map(copy), words: p.words.slice() };
}

export interface Seen {
	piece: Piece;
	/** the containers around it, the outermost first */
	inside: Container[];
	/** the kinds of the pieces around it, the outermost first */
	under: string[];
	/** the pieces written before and after it in the same parent */
	before: Piece | null;
	after: Piece | null;
}

/** every piece of a document with what is around it */
export function pieces_of(
	blocks: Piece[],
	inside: Container[] = [],
	under: string[] = [],
	out: Seen[] = []
): Seen[] {
	blocks.forEach((p, i) => {
		out.push({
			piece: p,
			inside,
			under,
			before: blocks[i - 1] ?? null,
			after: blocks[i + 1] ?? null,
		});
		const held = HOLDS[p.kind];
		pieces_of(
			p.kids,
			held === undefined ? inside : [...inside, held],
			[...under, p.kind],
			out
		);
	});
	return out;
}

export type Level = 'block' | 'inline' | 'fixed';

function level_of(kind: string): Level {
	if (INLINE_HOLDERS.has(kind) || INLINE_BLOCKS.has(kind)) return 'inline';
	return HOLDS[kind] === undefined ? 'fixed' : 'block';
}

// the form is a name or a depth, not a spelling
const KEEPS_FORM = new Set(['heading', 'definition', 'ref_link']);

function first_word(p: Piece): string {
	for (const kid of p.kids) {
		const found = first_word(kid);
		if (found !== 'x') return found;
	}
	return p.words[0] ?? 'x';
}

/** every document one step smaller, for shrinking a failure */
export function smaller(blocks: Piece[], level: Level = 'block'): Piece[][] {
	const out: Piece[][] = [];
	const walk = (
		list: Piece[],
		level: Level,
		put: (next: Piece[]) => void
	): void => {
		for (let i = 0; i < list.length; i++) {
			const p = list[i];
			const swap = (...next: Piece[]): void => {
				const joined = next.map((n, at) =>
					at === 0 ? { ...n, join: p.join } : n
				);
				put([...list.slice(0, i), ...joined, ...list.slice(i + 1)]);
			};
			const set = (next: Piece): void => {
				put([...list.slice(0, i), next, ...list.slice(i + 1)]);
			};
			const paragraph = (kids: Piece[]): void => {
				if (kids.length > 0) swap(piece('paragraph', 0, kids));
			};
			if (list.length > 1 && p.kind !== 'table_cell') swap();
			if (level === 'inline') {
				if (INLINE_HOLDERS.has(p.kind) && p.kids.length > 0) swap(...p.kids);
				if (p.kind !== 'word') {
					swap({ ...piece('word'), words: [first_word(p)] });
				}
				if (i > 0 && p.join !== ' ') set({ ...p, join: ' ' });
			} else if (level === 'block') {
				if (p.kind === 'list' || p.kind === 'svelte_block') {
					for (const kid of p.kids) swap(...kid.kids);
				} else if (HOLDS[p.kind] !== undefined) swap(...p.kids);
				else if (p.kind === 'table') {
					paragraph(p.kids[0].kids[0].kids);
					for (let col = 0; p.kids[0].kids.length > 1 && col < 3; col++) {
						const rows = p.kids.map((row) => ({
							...row,
							kids: row.kids.filter((_, at) => at !== col),
						}));
						if (rows[0].kids.length > 0) set({ ...p, kids: rows });
					}
				} else if (p.kind !== 'paragraph') paragraph(p.kids);
				if (i > 0 && p.join !== '\n\n') {
					set({ ...p, join: '\n\n' });
				}
			} else if (p.kind === 'list_item' && p.join !== '\n') {
				set({ ...p, join: '\n' });
			}
			if (p.form > 0 && !KEEPS_FORM.has(p.kind)) {
				set({ ...p, form: 0 });
			}
			if (p.kids.length > 0) {
				walk(p.kids, level_of(p.kind), (kids) => set({ ...p, kids }));
			}
		}
	};
	walk(blocks, level, (next) => out.push(next.map(copy)));
	return out;
}

/** the kinds of a document nested as written, the key a failure is grouped by */
export function outline(blocks: Piece[]): string {
	return blocks
		.map((p, i) => {
			const breaks =
				i > 0 && (p.join === '\n' || p.join === '\\\n')
					? JSON.stringify(p.join).slice(1, -1)
					: '';
			const kids = p.kids.length > 0 ? `(${outline(p.kids)})` : '';
			return breaks + p.kind + kids;
		})
		.join(' ');
}

const NOISE = '*_~^`[](){}<>|\\:#-!&"$ \n\0';

/** a source with one to four small edits, which leaves constructs open and markers stray */
export function edited(source: string, seed: number): string {
	const rand = random(seed ^ 0x9e3779b9);
	const edits = 1 + Math.floor(rand() * 4);
	for (let i = 0; i < edits; i++) {
		const at = Math.floor(rand() * (source.length + 1));
		const roll = Math.floor(rand() * 8);
		if (roll < 3) source = source.slice(0, at) + source.slice(at + 1);
		else if (roll < 6) {
			const char = NOISE[Math.floor(rand() * NOISE.length)];
			source = source.slice(0, at) + char + source.slice(at);
		} else if (roll === 6) source = source.slice(0, at);
		else {
			const from = source.lastIndexOf('\n', at - 1) + 1;
			const to = source.indexOf('\n', at);
			source = source.slice(0, from) + (to === -1 ? '' : source.slice(to + 1));
		}
	}
	return source;
}

/** the smallest source found that still fails, by taking out lines and then characters */
export function shrink_text(
	source: string,
	fails: (source: string) => boolean
): string {
	for (const by of ['\n', '']) {
		for (let again = true; again; ) {
			again = false;
			const parts = source.split(by);
			for (let i = parts.length - 1; i >= 0 && parts.length > 1; i--) {
				const next = [...parts.slice(0, i), ...parts.slice(i + 1)].join(by);
				if (!fails(next)) continue;
				parts.splice(i, 1);
				source = next;
				again = true;
			}
		}
	}
	return source;
}
