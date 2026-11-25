// prototype, dom nodes written from the tree with no html string between
// a root block with a kind not covered here goes to CursorHTMLRenderer
// the line feeds the html has between structural tags are left out

import { PFMParser } from '@mdsvex/parse';
import { TreeBuilder } from '@mdsvex/parse/tree-builder';
import { CursorHTMLRenderer } from '@mdsvex/render';
import { match } from './mdsvex-blocks.js';

export const api = 'delta';

// NodeKind in @mdsvex/parse, a const enum with no value at runtime
const K_TEXT = 1;
const K_HEADING = 3;
const K_CODE_FENCE = 5;
const K_LINE_BREAK = 6;
const K_PARAGRAPH = 7;
const K_CODE_SPAN = 8;
const K_EMPHASIS = 9;
const K_STRONG = 10;
const K_THEMATIC_BREAK = 11;
const K_LINK = 12;
const K_BLOCK_QUOTE = 14;
const K_LIST = 15;
const K_LIST_ITEM = 16;
const K_HARD_BREAK = 17;
const K_SOFT_BREAK = 18;
const K_STRIKETHROUGH = 19;
const K_SUPERSCRIPT = 20;
const K_SUBSCRIPT = 21;
const K_TABLE = 22;
const K_TABLE_HEADER = 23;
const K_TABLE_ROW = 24;
const K_TABLE_CELL = 25;

// node words, NodeField in @mdsvex/parse
const S = 12;
const END = 2;
const VALUE_START = 3;
const VALUE_END = 4;
const NEXT = 6;
const FIRST = 8;
const PENDING = 10;
const META = 11;
const NONE = 0xffffffff;

const INLINE = [];
INLINE[K_EMPHASIS] = 'em';
INLINE[K_STRONG] = 'strong';
INLINE[K_STRIKETHROUGH] = 'del';
INLINE[K_SUPERSCRIPT] = 'sup';
INLINE[K_SUBSCRIPT] = 'sub';
INLINE[K_BLOCK_QUOTE] = 'blockquote';
INLINE[K_TABLE_CELL] = 'td';

const META_KEYS = [];
META_KEYS[K_LINK] = ['href', 'title'];
META_KEYS[K_CODE_FENCE] = ['info', 'info_start', 'info_end'];
META_KEYS[K_LIST] = ['ordered', 'start', 'tight'];
META_KEYS[K_TABLE] = ['alignments', 'col_count'];

/** thrown for what this does not cover, the block goes to the html renderer */
class Uncovered extends Error {}

// the html renderer keeps a reference written in text and escapes braces
const UNSAFE_TEXT = /[&{}]/;
const UNSAFE_ATTR = /[&"{}<>]/;

const STRUCTURAL = new Set([
	'UL',
	'OL',
	'BLOCKQUOTE',
	'TABLE',
	'THEAD',
	'TBODY',
	'TR',
]);

/** takes out the line feeds between the tags of lists, tables and quotes */
function tidy(node) {
	let child = node.firstChild;
	while (child !== null) {
		const next = child.nextSibling;
		if (child.nodeType === 1) tidy(child);
		else if (
			child.nodeType === 3 &&
			STRUCTURAL.has(node.nodeName) &&
			child.data.trim() === ''
		)
			child.remove();
		child = next;
	}
}

export function create(root) {
	const tree = new TreeBuilder(128);
	const parser = new PFMParser(tree);
	parser.init();
	const buf = tree.get_buffer();
	let n = buf._n;
	let source = '';
	const doc = root.ownerDocument;

	/** by node index */
	let recs = [];
	/** by root block, nodes is null for one made here */
	const blocks = [];
	const stats = { html_blocks: 0, reasons: {}, remade: {} };

	const html = new CursorHTMLRenderer();
	const template = doc.createElement('template');
	let html_fresh = false;

	// the footnotes section is no node of the tree, the html renderer writes it
	// once a block has met a reference or a definition
	let noted = false;
	const notes = { idx: -1, html: '', nodes: [], done: false };

	/** why nodes were made again, and how many children of the parent went */
	function count(reason, kids) {
		const at = (stats.remade[reason] ??= [0, 0]);
		at[0]++;
		at[1] += kids;
	}

	function uncovered(reason) {
		if (reason === 'kind 36' || reason === 'kind 37') noted = true;
		stats.reasons[reason] = (stats.reasons[reason] ?? 0) + 1;
		throw new Uncovered(reason);
	}

	function meta_of(idx, kind) {
		const slot = n[idx * S + META];
		if (slot === 0) return undefined;
		const meta = buf._meta[slot - 1];
		if (meta === undefined) return undefined;
		const known = META_KEYS[kind];
		for (const key in meta) {
			if (meta[key] === undefined) continue;
			if (known === undefined || !known.includes(key)) uncovered(`meta ${key}`);
		}
		return meta;
	}

	/**
	 * kind and extra, and whether a paragraph is pending, which decides if it
	 * shows, a mark that is committed shows as it did while pending
	 */
	function sig_of(b) {
		const word = n[b];
		return (word & 0xff) === K_PARAGRAPH
			? word + n[b + PENDING] * 0x2000000
			: word;
	}

	/** what a parent checks before it trusts the record of a child */
	function first_sig(idx) {
		const first = n[idx * S + FIRST];
		if (first === NONE) return -1;
		const b = first * S;
		const kind = n[b] & 0xff;
		return (
			first * 1024 + kind * 4 + (kind === K_PARAGRAPH ? n[b + PENDING] : 0)
		);
	}

	function set_attr(el, name, value) {
		if (value == null || value === '') {
			if (el.hasAttribute(name)) el.removeAttribute(name);
			return;
		}
		value = String(value);
		if (UNSAFE_ATTR.test(value)) uncovered('attribute value');
		if (el.getAttribute(name) !== value) el.setAttribute(name, value);
	}

	/** makes the dom of a node and its record, the children come with sync */
	function make(idx, host, col, parent_kind) {
		const b = idx * S;
		const kind = n[b] & 0xff;
		const rec = {
			sig: sig_of(b),
			first: -1,
			dom: null,
			also: null,
			host,
			kids: null,
			done: false,
			at: 0,
			len: 0,
			kind,
			body: null,
		};
		let el;
		switch (kind) {
			case K_TEXT:
				rec.dom = doc.createTextNode('');
				break;
			case K_SOFT_BREAK:
				rec.dom = doc.createTextNode('\n');
				rec.done = true;
				break;
			case K_HARD_BREAK:
				rec.dom = doc.createElement('br');
				rec.also = doc.createTextNode('\n');
				rec.done = true;
				break;
			case K_THEMATIC_BREAK:
				rec.dom = doc.createElement('hr');
				break;
			case K_PARAGRAPH:
				meta_of(idx, kind);
				rec.kids = [];
				// a tight item shows the children of its paragraph, not the paragraph
				if (n[b + PENDING] === 1 && parent_kind === K_LIST_ITEM) break;
				rec.dom = rec.host = doc.createElement('p');
				break;
			case K_HEADING: {
				meta_of(idx, kind);
				const depth = (n[b] >>> 8) & 0xffff;
				if (depth < 1 || depth > 6) uncovered('heading depth');
				rec.dom = rec.host = doc.createElement('h' + depth);
				rec.kids = [];
				break;
			}
			case K_CODE_SPAN:
				meta_of(idx, kind);
				if (n[b + FIRST] !== NONE) uncovered('held nodes');
				rec.dom = doc.createElement('code');
				rec.body = rec.dom.appendChild(doc.createTextNode(''));
				break;
			case K_CODE_FENCE:
				if (n[b + FIRST] !== NONE) uncovered('held nodes');
				rec.dom = doc.createElement('pre');
				el = rec.dom.appendChild(doc.createElement('code'));
				rec.host = el;
				rec.body = el.appendChild(doc.createTextNode(''));
				break;
			case K_LINK:
				rec.dom = rec.host = doc.createElement('a');
				rec.kids = [];
				break;
			case K_LIST: {
				const meta = meta_of(idx, kind);
				rec.dom = rec.host = doc.createElement(meta?.ordered ? 'ol' : 'ul');
				rec.kids = [];
				break;
			}
			case K_LIST_ITEM:
				if (n[b + META] !== 0) uncovered('item meta');
				rec.dom = rec.host = doc.createElement('li');
				rec.kids = [];
				break;
			case K_TABLE: {
				const meta = meta_of(idx, kind);
				rec.dom = rec.host = doc.createElement('table');
				rec.kids = [];
				rec.align = meta?.alignments ?? [];
				break;
			}
			case K_TABLE_HEADER:
				rec.dom = doc.createElement('thead');
				rec.host = rec.dom.appendChild(doc.createElement('tr'));
				rec.kids = [];
				break;
			case K_TABLE_ROW:
				rec.dom = rec.host = doc.createElement('tr');
				rec.kids = [];
				break;
			case K_TABLE_CELL: {
				if (n[b + META] !== 0) uncovered('cell meta');
				el = doc.createElement(parent_kind === K_TABLE_HEADER ? 'th' : 'td');
				if (col !== undefined && col !== 'none') el.setAttribute('align', col);
				rec.dom = rec.host = el;
				rec.kids = [];
				break;
			}
			default: {
				const tag = INLINE[kind];
				if (tag === undefined) uncovered(`kind ${kind}`);
				meta_of(idx, kind);
				rec.dom = rec.host = doc.createElement(tag);
				rec.kids = [];
			}
		}
		recs[idx] = rec;
		if (rec.dom !== null) {
			host.appendChild(rec.dom);
			if (rec.also !== null) host.appendChild(rec.also);
		}
		return rec;
	}

	function remove(idx) {
		const rec = recs[idx];
		if (rec === undefined) return;
		recs[idx] = undefined;
		if (rec.dom !== null) {
			rec.dom.remove();
			if (rec.also !== null) rec.also.remove();
		} else if (rec.kids !== null) {
			for (const kid of rec.kids) remove(kid);
		}
	}

	/** the text of a leaf, the part that is new is appended */
	function sync_text(rec, node, b, code) {
		const start = n[b + VALUE_START];
		const end = n[b + VALUE_END];
		const len = end > start ? end - start : 0;
		if (rec.at === start && len >= rec.len) {
			if (len === rec.len) return;
			const more = source.slice(start + rec.len, end);
			if (!code && UNSAFE_TEXT.test(more)) uncovered('text');
			node.appendData(more);
		} else {
			const text = len === 0 ? '' : source.slice(start, end);
			if (!code && UNSAFE_TEXT.test(text)) uncovered('text');
			node.data = text;
		}
		rec.at = start;
		rec.len = len;
	}

	/** brings the dom of a node up to the tree */
	function sync(idx, rec) {
		const b = idx * S;
		const kind = rec.kind;
		switch (kind) {
			case K_TEXT:
				sync_text(rec, rec.dom, b, false);
				break;
			case K_CODE_SPAN: {
				const start = n[b + VALUE_START];
				const end = n[b + VALUE_END];
				// a span that escapes a pipe in a table cell holds its text
				let text =
					buf._strings[idx] ?? (end > start ? source.slice(start, end) : '');
				if (text.includes('\n')) text = text.replace(/\n/g, ' ');
				if (rec.body.data !== text) rec.body.data = text;
				break;
			}
			case K_CODE_FENCE: {
				const meta = meta_of(idx, kind);
				let info = meta?.info;
				if (!info && meta?.info_start != null && meta?.info_end != null)
					info = source.slice(meta.info_start, meta.info_end);
				if (info) {
					const space = info.search(/[ \t]/);
					set_attr(
						rec.host,
						'class',
						'language-' + (space === -1 ? info : info.slice(0, space))
					);
				}
				// a fence in a quote or an item holds its code without their marks
				const held = buf._strings[idx];
				if (held !== undefined) {
					if (rec.body.data !== held) rec.body.data = held;
				} else sync_text(rec, rec.body, b, true);
				break;
			}
			case K_LINK: {
				const meta = meta_of(idx, kind);
				set_attr(rec.dom, 'href', meta?.href);
				set_attr(rec.dom, 'title', meta?.title);
				sync_kids(idx, rec);
				break;
			}
			case K_LIST: {
				const meta = meta_of(idx, kind);
				const ordered = !!meta?.ordered;
				if (ordered !== (rec.dom.nodeName === 'OL')) uncovered('list type');
				const start = meta?.start;
				set_attr(
					rec.dom,
					'start',
					ordered && start != null && start !== 1 ? start : null
				);
				sync_kids(idx, rec);
				break;
			}
			case K_TABLE: {
				const meta = meta_of(idx, kind);
				const align = meta?.alignments ?? [];
				if (align.join() !== rec.align.join()) {
					// every cell made so far has the old alignment
					for (const kid of rec.kids) remove(kid);
					rec.kids.length = 0;
					if (rec.body !== null) rec.body.remove();
					rec.body = null;
					rec.align = align;
				}
				sync_kids(idx, rec);
				break;
			}
			case K_LIST_ITEM:
				// the checkbox of a task item comes after the item opens
				if (n[b + META] !== 0) uncovered('item meta');
				sync_kids(idx, rec);
				break;
			default:
				if (rec.kids !== null) sync_kids(idx, rec);
		}
		if (n[b + END] !== NONE) rec.done = true;
	}

	function sync_kids(idx, rec) {
		const kids = rec.kids;
		const kind = rec.kind;
		const table = kind === K_TABLE;
		const cells = kind === K_TABLE_HEADER || kind === K_TABLE_ROW;
		const align = cells ? recs[n[idx * S + 5]].align : null;
		let k = 0;
		let col = 0;
		let child = n[idx * S + FIRST];
		while (child !== NONE) {
			const b = child * S;
			const child_kind = n[b] & 0xff;
			const shows =
				child_kind !== K_LINE_BREAK &&
				(!table ||
					child_kind === K_TABLE_HEADER ||
					child_kind === K_TABLE_ROW) &&
				(!cells || child_kind === K_TABLE_CELL);
			if (shows) {
				const sig = sig_of(b);
				const first = first_sig(child);
				if (k < kids.length && kids[k] !== child) {
					// a tight list revokes the paragraphs of its items as it closes,
					// their children are then children of the item, and show as before
					const gone = recs[kids[k]];
					if (
						gone !== undefined &&
						gone.dom === null &&
						gone.kids.length !== 0 &&
						gone.kids[0] === child
					) {
						recs[kids[k]] = undefined;
						kids.splice(k, 1, ...gone.kids);
					}
				}
				let kid =
					k < kids.length && kids[k] === child ? recs[child] : undefined;
				if (kid === undefined) {
					if (k < kids.length)
						count('another node in its place', kids.length - k);
				} else if (kid.sig !== sig) {
					count(`kind ${kid.sig & 0xff} to ${sig & 0xff}`, kids.length - k);
					kid = undefined;
				} else if (kid.done && kid.first !== first) {
					// its children changed after it closed, it is looked into again
					count(`first child of a closed ${sig & 0xff}`, 1);
					kid.done = false;
				}
				if (kid === undefined) {
					for (let i = k; i < kids.length; i++) remove(kids[i]);
					kids.length = k;
					if (table && rec.body !== null && rec.body.firstChild === null) {
						rec.body.remove();
						rec.body = null;
					}
					let host = rec.host;
					if (table && child_kind === K_TABLE_ROW) {
						if (rec.body === null)
							rec.body = rec.dom.appendChild(doc.createElement('tbody'));
						host = rec.body;
					}
					kid = make(child, host, cells ? align[col] : undefined, kind);
					kid.first = first;
					kids.push(child);
					sync(child, kid);
				} else if (!kid.done) {
					kid.first = first;
					sync(child, kid);
				}
				k++;
				if (cells) col++;
			}
			child = n[b + NEXT];
		}
		if (k < kids.length) {
			count('gone from the end', kids.length - k);
			for (let i = k; i < kids.length; i++) remove(kids[i]);
			kids.length = k;
		}
	}

	function block_html(at) {
		if (!html_fresh) {
			html.update(buf, source);
			html_fresh = true;
		}
		return html.blocks[at]?.html ?? '';
	}

	function drop_from(at) {
		while (blocks.length > at) {
			const entry = blocks.pop();
			if (entry.nodes !== null) for (const node of entry.nodes) node.remove();
			else remove(entry.idx);
		}
	}

	/** a block the html renderer writes, its nodes matched as mdsvex-html does */
	function patch_html(entry, at) {
		const text = block_html(at);
		if (entry.html === text) return;
		entry.html = text;
		template.innerHTML = text;
		tidy(template.content);
		const next = [...template.content.childNodes];
		const old = entry.nodes;
		const paired = Math.min(old.length, next.length);
		for (let j = 0; j < paired; j++) next[j] = match(old[j], next[j]);
		for (let j = paired; j < old.length; j++) old[j].remove();
		entry.nodes = next;
		// every block after this one was dropped or is not made yet
		if (paired !== next.length) root.appendChild(template.content);
	}

	function update() {
		n = buf._n;
		html_fresh = false;
		let at = 0;
		let child = n[FIRST];
		while (child !== NONE) {
			const b = child * S;
			if ((n[b] & 0xff) !== K_LINE_BREAK) {
				let entry = blocks[at];
				if (entry !== undefined && entry.idx !== child) {
					count(
						`root ${recs[entry.idx]?.kind ?? 'html'} gave way to ${n[b] & 0xff}`,
						blocks.length - at
					);
					drop_from(at);
					entry = undefined;
				}
				if (entry === undefined) {
					entry = { idx: child, html: '', nodes: null, done: false };
					blocks.push(entry);
				}
				if (!entry.done) {
					if (entry.nodes === null) {
						try {
							const sig = sig_of(b);
							const first = first_sig(child);
							let rec = recs[child];
							if (rec !== undefined && rec.sig !== sig) {
								count(`block ${rec.sig & 0xff} to ${sig & 0xff}`, 1);
								remove(child);
								rec = undefined;
							}
							if (rec === undefined) {
								// what follows was made after it, it goes back after it
								drop_from(at + 1);
								rec = make(child, root, undefined, 0);
							}
							rec.first = first;
							sync(child, rec);
						} catch (error) {
							if (!(error instanceof Uncovered)) throw error;
							drop_from(at + 1);
							remove(child);
							entry.nodes = [];
							stats.html_blocks++;
						}
					}
					if (entry.nodes !== null) patch_html(entry, at);
					if (n[b + END] !== NONE) entry.done = true;
				}
				at++;
			}
			child = n[b + NEXT];
		}
		if (at < blocks.length)
			count('root blocks gone from the end', blocks.length - at);
		drop_from(at);
		if (noted) {
			block_html(0);
			const last = html.blocks[html.blocks.length - 1];
			const text = last !== undefined && last.idx === -1 ? last.html : '';
			if (notes.html !== text) {
				for (const node of notes.nodes) node.remove();
				notes.html = text;
				template.innerHTML = text;
				tidy(template.content);
				notes.nodes = [...template.content.childNodes];
			}
			// after every block, one may have been made since
			const end = notes.nodes[notes.nodes.length - 1];
			if (end !== undefined && root.lastChild !== end)
				root.append(...notes.nodes);
		}
	}

	const reference = new CursorHTMLRenderer();

	return {
		write(full, delta) {
			source = full;
			tree.hide_open_text();
			parser.feed(delta);
			tree.show_open_text(full);
			update();
		},
		end(full) {
			source = full;
			tree.hide_open_text();
			parser.finish();
			update();
		},
		/** the html the page should hold, for the census */
		expected() {
			return reference
				.update(tree.get_buffer(), source)
				.map((block) => block.html)
				.join('');
		},
		tidy,
		stats: () => ({ ...stats, blocks: blocks.length }),
		destroy() {
			root.textContent = '';
		},
	};
}
