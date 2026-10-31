// the plain text a reader of a document sees, by section, for search indexes,
// feeds and llms.txt, a walk of a parsed document that no compile makes, so
// nothing here runs unless a caller asks for the text

import { buf_code, footnote_index } from '@mdsvex/parse/buf-utils';
import type { NodeBuffer } from '@mdsvex/parse/utils';

const NONE = 0xffffffff;

// the node kinds of @mdsvex/parse, a const enum of another package is no value here
const enum NodeKind {
	root = 0,
	text = 1,
	html = 2,
	heading = 3,
	mustache = 4,
	code_fence = 5,
	line_break = 6,
	paragraph = 7,
	code_span = 8,
	thematic_break = 11,
	block_quote = 14,
	list = 15,
	list_item = 16,
	hard_break = 17,
	soft_break = 18,
	table = 22,
	table_header = 23,
	table_row = 24,
	table_cell = 25,
	html_comment = 26,
	svelte_tag = 27,
	svelte_block = 28,
	svelte_branch = 29,
	directive_inline = 30,
	directive_leaf = 31,
	directive_container = 32,
	frontmatter = 33,
	import_statement = 34,
	directive_label = 35,
	footnote_reference = 36,
	footnote_definition = 37,
	definition = 38,
}

/** what a directive of a plugin reads as in plain text, by directive name */
export type DirectiveText = (
	args: Readonly<Record<string, string>>,
	label: string
) => string | undefined;

/** the bundles of a compile as far as the text reads them */
export interface TextBundle {
	directives?: Record<string, { text?: DirectiveText }>;
}

export interface TextOptions {
	/**
	 * false leaves out code blocks, fences, math fences and pre elements, code
	 * spans stay as they are part of a sentence, true by default
	 */
	code_blocks?: boolean;
	/** the plugins whose directives say what they read as, those of the compile */
	plugins?: readonly TextBundle[];
}

/** a heading and the text after it up to the next heading */
export interface TextSection {
	/** the id of the heading, with heading_ids on or one typed on it, so a hit links to page#id */
	id?: string;
	/** the text of the heading, empty for the text before the first heading */
	heading: string;
	/** the depth of the heading, 1 to 6, 0 for the text before the first heading */
	depth: number;
	/** the blocks of the section, a blank line between two, the heading not among them */
	text: string;
}

/** the text of a document, plain json */
export interface DocumentText {
	/** the text of the first # heading outside any container, metadata is not read */
	title?: string;
	/** every block of the document, its headings too, a blank line between two */
	text: string;
	/**
	 * a section for each heading in document order, after one for the text
	 * before the first heading when there is any, footnotes end the last
	 */
	sections: TextSection[];
}

/** read as a block of its own, other lowercase elements sit in their line */
const BLOCK_TAGS = new Set([
	'address',
	'article',
	'aside',
	'blockquote',
	'caption',
	'dd',
	'details',
	'dialog',
	'div',
	'dl',
	'dt',
	'fieldset',
	'figcaption',
	'figure',
	'footer',
	'form',
	'h1',
	'h2',
	'h3',
	'h4',
	'h5',
	'h6',
	'header',
	'hgroup',
	'hr',
	'li',
	'main',
	'nav',
	'ol',
	'p',
	'section',
	'summary',
	'table',
	'td',
	'th',
	'tr',
	'ul',
]);

/** nothing in them is shown in the page */
const HIDDEN_TAGS = new Set([
	'script',
	'style',
	'template',
	'svelte:head',
	'svelte:options',
	'svelte:window',
	'svelte:document',
	'svelte:body',
]);

/** lowercase without a dot or a colon is an element, anything else is a component or a svelte element */
const ELEMENT = /^[a-z][^.:]*$/;

const REFERENCE =
	/&(?:#(\d{1,7})|#[xX]([0-9a-fA-F]{1,6})|([a-zA-Z][a-zA-Z0-9]*));/g;

/** the named references prose uses, any other stays as written, no full table is bundled */
const NAMED: Record<string, number> = {
	amp: 38,
	lt: 60,
	gt: 62,
	quot: 34,
	apos: 39,
	nbsp: 0xa0,
	copy: 0xa9,
	reg: 0xae,
	trade: 0x2122,
	deg: 0xb0,
	plusmn: 0xb1,
	times: 0xd7,
	divide: 0xf7,
	middot: 0xb7,
	sect: 0xa7,
	para: 0xb6,
	cent: 0xa2,
	pound: 0xa3,
	yen: 0xa5,
	euro: 0x20ac,
	frac12: 0xbd,
	frac14: 0xbc,
	frac34: 0xbe,
	laquo: 0xab,
	raquo: 0xbb,
	lsquo: 0x2018,
	rsquo: 0x2019,
	ldquo: 0x201c,
	rdquo: 0x201d,
	ndash: 0x2013,
	mdash: 0x2014,
	hellip: 0x2026,
	bull: 0x2022,
	larr: 0x2190,
	uarr: 0x2191,
	rarr: 0x2192,
	darr: 0x2193,
	harr: 0x2194,
};

function reference(
	written: string,
	decimal: string | undefined,
	hex: string | undefined,
	name: string | undefined
): string {
	if (name !== undefined) {
		const code = NAMED[name];
		return code === undefined ? written : String.fromCharCode(code);
	}
	const code =
		decimal !== undefined ? parseInt(decimal, 10) : parseInt(hex!, 16);
	// as html reads them, a code that is no character is the replacement character
	if (code === 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff))
		return '�';
	return String.fromCodePoint(code);
}

/** the character references of text written in the document as their characters */
export function decode_references(text: string): string {
	return text.indexOf('&') === -1 ? text : text.replace(REFERENCE, reference);
}

const BLANKS = /[ \t\n\r\f\v]+/g;
const TRAILING = /[ \t\r\f\v]+$/gm;
const TAG = /<\/?[A-Za-z][^>]*>/g;

/** one line of text with runs of white space as one space, a no-break space stays */
function squeeze(text: string): string {
	return text.replace(BLANKS, ' ').trim();
}

/** code as written, without trailing spaces or blank lines around it */
function code_text(code: string): string {
	return code.replace(TRAILING, '').replace(/^\n+|\n+$/g, '');
}

class Reader {
	private readonly buf: NodeBuffer;
	private readonly src: string;
	private readonly code: boolean;
	private readonly hooks: Map<string, DirectiveText> | null;
	/** the inline text since the last block boundary, hard breaks end its lines */
	private run = '';
	private lines: string[] | null = null;
	/** every block, headings too */
	readonly all: string[] = [];
	readonly sections: TextSection[] = [];
	private blocks: string[] = [];
	/** true while the footnotes are read, a heading in one starts no section */
	private notes = false;
	/** above 0 while a heading or a label is read, a block in one is a word apart */
	private inline = 0;
	title: string | undefined = undefined;

	constructor(
		buf: NodeBuffer,
		src: string,
		code: boolean,
		hooks: Map<string, DirectiveText> | null
	) {
		this.buf = buf;
		this.src = src;
		this.code = code;
		this.hooks = hooks;
		this.sections.push({ heading: '', depth: 0, text: '' });
	}

	/** the text of a node, a string a builder or a plugin stored, else its source */
	private own(i: number): string {
		const s = this.buf._strings[i];
		if (s !== undefined) return s;
		const vs = this.buf.value_start_at(i);
		const ve = this.buf.value_end_at(i);
		if (vs === NONE || ve === NONE || ve <= vs) return '';
		return this.src.slice(vs, ve);
	}

	/** what the run holds as one string, its lines trimmed, the run emptied */
	private take(): string {
		const run = this.run;
		this.run = '';
		const lines = this.lines;
		if (lines === null) return squeeze(run);
		this.lines = null;
		lines.push(run);
		let out = '';
		for (const line of lines) {
			const text = squeeze(line);
			if (text === '') continue;
			out = out === '' ? text : out + '\n' + text;
		}
		return out;
	}

	private push(text: string): void {
		if (text === '') return;
		if (this.inline !== 0) {
			this.run += ' ' + text + ' ';
			return;
		}
		this.blocks.push(text);
		this.all.push(text);
	}

	/** the end of a block, nothing runs from one block into the next */
	private flush(): void {
		if (this.run === '' && this.lines === null) return;
		if (this.inline !== 0) {
			this.run += ' ';
			return;
		}
		this.push(this.take());
	}

	private break_line(): void {
		(this.lines ??= []).push(this.run);
		this.run = '';
	}

	/** the text of the inline children of i, the run as it was around it */
	private inline_of(i: number): string {
		const run = this.run;
		const lines = this.lines;
		this.run = '';
		this.lines = null;
		this.inline++;
		this.children(i);
		this.inline--;
		const text = this.take();
		this.run = run;
		this.lines = lines;
		return text;
	}

	/** a block of code, or text a hook gave, blank lines in it part blocks */
	private push_blocks(text: string): void {
		for (const part of text.split(/\n[ \t]*\n/)) {
			const block = code_text(part);
			if (block !== '') this.push(block);
		}
	}

	private children(i: number): void {
		const buf = this.buf;
		for (
			let child = buf.first_child_at(i);
			child !== NONE && buf.parent_at(child) === i;
			child = buf.next_at(child)
		)
			this.node(child);
	}

	/** a block of its own, what it holds reads as blocks too */
	private block(i: number): void {
		this.flush();
		this.children(i);
		this.flush();
	}

	/** true when i sits among blocks rather than in a line of text */
	private at_block(i: number): boolean {
		switch (this.buf.kind_at(this.buf.parent_at(i)) as number) {
			case NodeKind.root:
			case NodeKind.block_quote:
			case NodeKind.list_item:
			case NodeKind.footnote_definition:
			case NodeKind.directive_container:
			case NodeKind.svelte_branch:
				return true;
			default:
				return false;
		}
	}

	node(i: number): void {
		const buf = this.buf;
		switch (buf.kind_at(i) as number) {
			case NodeKind.text: {
				const text = this.own(i);
				// what a plugin wrote is characters, a reference in it too
				this.run += buf.synthetic_at(i) ? text : decode_references(text);
				break;
			}
			case NodeKind.soft_break:
				this.run += ' ';
				break;
			case NodeKind.hard_break:
				this.break_line();
				break;
			case NodeKind.code_span:
				// inline math is a code span, its tex is what it says
				this.run += buf_code(buf, i, this.src);
				break;
			case NodeKind.code_fence:
				if (!this.code) break;
				this.flush();
				this.push_blocks(buf_code(buf, i, this.src));
				break;
			case NodeKind.heading:
				this.heading(i);
				break;
			case NodeKind.paragraph:
			case NodeKind.list_item:
			case NodeKind.block_quote:
			case NodeKind.list:
			case NodeKind.table:
			case NodeKind.table_header:
			case NodeKind.table_row:
			case NodeKind.root:
				this.block(i);
				break;
			case NodeKind.table_cell:
				// the cells of a row read as one line
				this.run += ' ';
				this.children(i);
				this.run += ' ';
				break;
			case NodeKind.directive_label:
				// a line of text, as a heading is
				this.flush();
				this.push(this.inline_of(i));
				break;
			case NodeKind.thematic_break:
				this.flush();
				break;
			case NodeKind.html:
				this.html(i);
				break;
			case NodeKind.svelte_block:
				this.svelte_block(i);
				break;
			case NodeKind.directive_inline:
			case NodeKind.directive_leaf:
			case NodeKind.directive_container:
				this.directive(i);
				break;
			case NodeKind.mustache:
				// only known at runtime, it parts the words around it as block tags part branches
				this.run += ' ';
				break;
			// comments and definitions show nothing, footnotes are read at the end
			case NodeKind.svelte_tag:
			case NodeKind.html_comment:
			case NodeKind.frontmatter:
			case NodeKind.import_statement:
			case NodeKind.definition:
			case NodeKind.footnote_reference:
			case NodeKind.footnote_definition:
			case NodeKind.line_break:
				break;
			// emphasis, links, the alt of an image and whatever a plugin made
			default:
				this.children(i);
		}
	}

	private heading(i: number): void {
		this.flush();
		const text = this.inline_of(i);
		if (this.notes) {
			this.push(text);
			return;
		}
		const buf = this.buf;
		const depth = buf.extra_at(i);
		if (this.title === undefined && depth === 1 && text !== '') {
			if (buf.parent_at(i) === 0) this.title = text;
		}
		this.end_section();
		const id = buf.metadata_at(i)?.id;
		this.sections.push(
			typeof id === 'string' && id !== ''
				? { id, heading: text, depth, text: '' }
				: { heading: text, depth, text: '' }
		);
		this.blocks = [];
		if (text !== '') this.all.push(text);
	}

	private end_section(): void {
		this.sections[this.sections.length - 1].text = this.blocks.join('\n\n');
	}

	private html(i: number): void {
		const buf = this.buf;
		const tag = buf.metadata_at(i)?.tag;
		if (typeof tag !== 'string' || HIDDEN_TAGS.has(tag)) return;
		if (tag === 'br') return this.break_line();
		if (tag === 'pre' || tag === 'textarea') {
			// raw text, the tags in it are not read
			if (tag === 'pre' && !this.code) return;
			this.flush();
			const raw = decode_references(this.own(i).replace(TAG, ''));
			if (tag === 'pre') this.push_blocks(raw);
			else this.push(squeeze(raw));
			return;
		}
		const block = ELEMENT.test(tag) ? BLOCK_TAGS.has(tag) : this.at_block(i);
		if (block) this.block(i);
		else this.children(i);
	}

	/** the text of every branch, which one shows is only known at runtime */
	private svelte_block(i: number): void {
		const buf = this.buf;
		const block = this.at_block(i);
		for (
			let branch = buf.first_child_at(i);
			branch !== NONE && buf.parent_at(branch) === i;
			branch = buf.next_at(branch)
		) {
			if (block) this.block(branch);
			else {
				this.run += ' ';
				this.children(branch);
				this.run += ' ';
			}
		}
	}

	private directive(i: number): void {
		const buf = this.buf;
		const kind = buf.kind_at(i) as number;
		const meta = buf.metadata_at(i);
		const hook =
			this.hooks === null || typeof meta?.name !== 'string'
				? undefined
				: this.hooks.get(meta.name);
		if (kind === NodeKind.directive_inline) {
			if (hook === undefined) return this.children(i);
			const label = this.inline_of(i);
			const text = hook(meta!.args ?? {}, label);
			this.run += text === undefined ? label : text;
			return;
		}
		this.flush();
		// a container holds its label as a node, a leaf as its children
		let label = NONE;
		if (kind === NodeKind.directive_container) {
			const first = buf.first_child_at(i);
			if (
				first !== NONE &&
				buf.parent_at(first) === i &&
				(buf.kind_at(first) as number) === NodeKind.directive_label
			)
				label = first;
		}
		const text =
			hook === undefined
				? undefined
				: hook(
						meta!.args ?? {},
						kind === NodeKind.directive_leaf
							? this.inline_of(i)
							: label === NONE
								? ''
								: this.inline_of(label)
					);
		if (kind === NodeKind.directive_leaf) {
			if (text === undefined) this.children(i);
			else this.push_blocks(text);
			this.flush();
			return;
		}
		for (
			let child = buf.first_child_at(i);
			child !== NONE && buf.parent_at(child) === i;
			child = buf.next_at(child)
		) {
			if (child === label && text !== undefined) this.push_blocks(text);
			else this.node(child);
		}
		this.flush();
	}

	/** the footnotes a reference reaches, in the order the page lists them */
	footnotes(): void {
		this.flush();
		const index = footnote_index(this.buf, true);
		if (index === null) return;
		this.notes = true;
		for (const definition of index.definitions) {
			if (definition !== NONE) this.block(definition);
		}
		this.notes = false;
	}

	finish(): DocumentText {
		this.flush();
		this.end_section();
		const sections = this.sections;
		// the text before the first heading is a section only when there is some
		if (sections[0].text === '') sections.shift();
		const text = this.all.join('\n\n');
		const title = this.title;
		return title === undefined ? { text, sections } : { title, text, sections };
	}
}

/** the text hooks of the directives of plugins, the last plugin to name one wins */
function hooks_of(
	plugins: readonly TextBundle[] | undefined
): Map<string, DirectiveText> | null {
	if (plugins === undefined) return null;
	let hooks: Map<string, DirectiveText> | null = null;
	for (const plugin of plugins) {
		const directives = plugin.directives;
		if (directives === undefined) continue;
		for (const name in directives) {
			const text = directives[name].text;
			if (text === undefined) continue;
			if (typeof text !== 'function')
				throw new TypeError(
					`[mdsvex] the text of the directive ${name} must be a function`
				);
			(hooks ??= new Map()).set(name, text);
		}
	}
	return hooks;
}

/**
 * the text of a parsed document, nodes from any builder, source is what its
 * offsets index, empty when the builder holds every string, as over the wire
 */
export function document_text(
	nodes: NodeBuffer,
	source: string,
	options?: TextOptions
): DocumentText {
	const code = options?.code_blocks;
	if (code !== undefined && typeof code !== 'boolean')
		throw new TypeError('[mdsvex] code_blocks must be true or false');
	const reader = new Reader(
		nodes,
		source,
		code !== false,
		hooks_of(options?.plugins)
	);
	reader.node(0);
	reader.footnotes();
	return reader.finish();
}
