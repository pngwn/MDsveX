import { describe, it, expect, vi } from 'vitest';
import {
	PFMDocument,
	applyBatch,
	textContent,
	type PFMNode,
} from '../src/pfm_document';
import { PFMParser, node_kind } from '../src/main';
import { WireEmitter, WireOp } from '../src/wire_emitter';

// ── Helpers ──────────────────────────────────────────────────

const SCHEMA = [
	'root', 'text', 'html', 'heading', 'mustache', 'code_fence',
	'line_break', 'paragraph', 'code_span', 'emphasis', 'strong_emphasis',
	'thematic_break', 'link', 'image', 'block_quote', 'list', 'list_item',
	'hard_break', 'soft_break', 'strikethrough', 'superscript',
	'table', 'table_header', 'table_row', 'table_cell',
];

/** Build a batch with schema pre-applied. */
function batch(...ops: unknown[][]): unknown[][] {
	return [['S', SCHEMA], ...ops];
}

/** Parse markdown through WireEmitter → PFMDocument, return the document. */
function parse_doc(source: string): PFMDocument {
	const emitter = new WireEmitter();
	emitter.set_source(source);
	const parser = new PFMParser(emitter);
	parser.parse(source);
	const doc = new PFMDocument();
	doc.apply(emitter.flush());
	return doc;
}

/** Find a node by kindName in the document. */
function find_by_kind(doc: PFMDocument, kindName: string): PFMNode | undefined {
	for (const node of doc.nodes.values()) {
		if (node.kindName === kindName) return node;
	}
	return undefined;
}

/** Find all nodes by kindName. */
function find_all_by_kind(doc: PFMDocument, kindName: string): PFMNode[] {
	const result: PFMNode[] = [];
	for (const node of doc.nodes.values()) {
		if (node.kindName === kindName) result.push(node);
	}
	return result;
}

// ── Schema ───────────────────────────────────────────────────

describe('PFMDocument: schema', () => {
	it('stores schema from S opcode', () => {
		const doc = new PFMDocument();
		doc.apply([['S', SCHEMA]]);
		expect(doc.schema).toEqual(SCHEMA);
	});

	it('resolves kind names from schema', () => {
		const doc = new PFMDocument();
		doc.apply(batch(
			['O', 0, 0, -1, 0, 0], // root
			['O', 1, 7, 0, 0, 0],  // paragraph (kind=7)
		));
		const para = doc.nodes.get(1)!;
		expect(para.kindName).toBe('paragraph');
	});

	it('falls back to string(kind) without schema', () => {
		const doc = new PFMDocument();
		doc.apply([
			['O', 0, 0, -1, 0, 0],
			['O', 1, 7, 0, 0, 0],
		]);
		expect(doc.nodes.get(1)!.kindName).toBe('7');
	});
});

// ── Tree structure ───────────────────────────────────────────

describe('PFMDocument: tree structure', () => {
	it('creates root node', () => {
		const doc = new PFMDocument();
		doc.apply(batch(['O', 0, 0, -1, 0, 0]));
		expect(doc.root).not.toBeNull();
		expect(doc.root!.id).toBe(0);
		expect(doc.root!.kindName).toBe('root');
		expect(doc.root!.parent).toBeNull();
	});

	it('creates child with parent reference', () => {
		const doc = new PFMDocument();
		doc.apply(batch(
			['O', 0, 0, -1, 0, 0],
			['O', 1, 7, 0, 0, 0],
		));
		const para = doc.nodes.get(1)!;
		expect(para.parent).toBe(doc.root);
		expect(doc.root!.content).toContain(para);
	});

	it('preserves content order for multiple children', () => {
		const doc = new PFMDocument();
		doc.apply(batch(
			['O', 0, 0, -1, 0, 0],
			['O', 1, 3, 0, 0, 1],  // heading
			['C', 1],
			['O', 2, 7, 0, 0, 0],  // paragraph
			['C', 2],
		));
		expect(doc.root!.content[0]).toBe(doc.nodes.get(1));
		expect(doc.root!.content[1]).toBe(doc.nodes.get(2));
	});

	it('stores extra field', () => {
		const doc = new PFMDocument();
		doc.apply(batch(
			['O', 0, 0, -1, 0, 0],
			['O', 1, 3, 0, 0, 2], // heading depth=2
		));
		expect(doc.nodes.get(1)!.extra).toBe(2);
	});
});

// ── Text ─────────────────────────────────────────────────────

describe('PFMDocument: text', () => {
	it('pushes first text as new segment', () => {
		const doc = new PFMDocument();
		doc.apply(batch(
			['O', 0, 0, -1, 0, 0],
			['O', 1, 7, 0, 0, 0],
			['T', 1, 'hello'],
		));
		expect(doc.nodes.get(1)!.content).toEqual(['hello']);
	});

	it('appends to existing text segment', () => {
		const doc = new PFMDocument();
		doc.apply(batch(
			['O', 0, 0, -1, 0, 0],
			['O', 1, 7, 0, 0, 0],
			['T', 1, 'hel'],
			['T', 1, 'lo'],
		));
		expect(doc.nodes.get(1)!.content).toEqual(['hello']);
	});

	it('pushes new segment after child node', () => {
		const doc = new PFMDocument();
		doc.apply(batch(
			['O', 0, 0, -1, 0, 0],
			['O', 1, 7, 0, 0, 0],  // paragraph
			['T', 1, 'before '],
			['O', 2, 9, 1, 1, 0],  // emphasis
			['T', 2, 'middle'],
			['C', 2],
			['T', 1, ' after'],
		));
		const para = doc.nodes.get(1)!;
		const em = doc.nodes.get(2)!;
		expect(para.content.length).toBe(3);
		expect(para.content[0]).toBe('before ');
		expect(para.content[1]).toBe(em);
		expect(para.content[2]).toBe(' after');
	});
});

// ── Close ────────────────────────────────────────────────────

describe('PFMDocument: close', () => {
	it('sets closed=true', () => {
		const doc = new PFMDocument();
		doc.apply(batch(
			['O', 0, 0, -1, 0, 0],
			['O', 1, 7, 0, 0, 0],
			['C', 1],
		));
		expect(doc.nodes.get(1)!.closed).toBe(true);
	});

	it('sets pending=false on close', () => {
		const doc = new PFMDocument();
		doc.apply(batch(
			['O', 0, 0, -1, 0, 0],
			['O', 1, 9, 0, 1, 0], // pending=1
			['C', 1],
		));
		const node = doc.nodes.get(1)!;
		expect(node.pending).toBe(false);
		expect(node.closed).toBe(true);
	});
});

// ── Pending ──────────────────────────────────────────────────

describe('PFMDocument: pending', () => {
	it('marks pending nodes', () => {
		const doc = new PFMDocument();
		doc.apply(batch(
			['O', 0, 0, -1, 0, 0],
			['O', 1, 9, 0, 1, 0], // pending=1
		));
		expect(doc.nodes.get(1)!.pending).toBe(true);
	});

	it('non-pending nodes have pending=false', () => {
		const doc = new PFMDocument();
		doc.apply(batch(
			['O', 0, 0, -1, 0, 0],
			['O', 1, 7, 0, 0, 0], // pending=0
		));
		expect(doc.nodes.get(1)!.pending).toBe(false);
	});
});

// ── Attrs ────────────────────────────────────────────────────

describe('PFMDocument: attrs', () => {
	it('sets attrs on node', () => {
		const doc = new PFMDocument();
		doc.apply(batch(
			['O', 0, 0, -1, 0, 0],
			['O', 1, 12, 0, 0, 0], // link
			['A', 1, 'href', 'https://example.com'],
			['A', 1, 'title', 'Example'],
		));
		const link = doc.nodes.get(1)!;
		expect(link.attrs.href).toBe('https://example.com');
		expect(link.attrs.title).toBe('Example');
	});

	it('overwrites existing attrs', () => {
		const doc = new PFMDocument();
		doc.apply(batch(
			['O', 0, 0, -1, 0, 0],
			['O', 1, 15, 0, 0, 0], // list
			['A', 1, 'tight', true],
			['A', 1, 'tight', false],
		));
		expect(doc.nodes.get(1)!.attrs.tight).toBe(false);
	});
});

// ── Revoke ───────────────────────────────────────────────────

describe('PFMDocument: revoke', () => {
	it('revokes empty node — delimiter becomes text in parent', () => {
		const doc = new PFMDocument();
		doc.apply(batch(
			['O', 0, 0, -1, 0, 0],
			['O', 1, 7, 0, 0, 0],  // paragraph
			['T', 1, 'before'],
			['O', 2, 9, 1, 1, 0],  // emphasis (pending, empty)
			['R', 2, '_'],
		));
		const para = doc.nodes.get(1)!;
		// "before" + "_" merged into "before_"
		expect(para.content).toEqual(['before_']);
		expect(doc.nodes.has(2)).toBe(false);
	});

	it('revokes node with text — delimiter + text merged', () => {
		const doc = new PFMDocument();
		doc.apply(batch(
			['O', 0, 0, -1, 0, 0],
			['O', 1, 7, 0, 0, 0],   // paragraph
			['T', 1, 'a '],
			['O', 2, 9, 1, 1, 0],   // emphasis
			['T', 2, 'unclosed'],
			['R', 2, '_'],
			['T', 1, ' b'],
		));
		const para = doc.nodes.get(1)!;
		// "a " + "_" + "unclosed" + " b" → "a _unclosed b"
		expect(para.content).toEqual(['a _unclosed b']);
	});

	it('revokes node with child nodes — reparents children', () => {
		const doc = new PFMDocument();
		doc.apply(batch(
			['O', 0, 0, -1, 0, 0],
			['O', 1, 7, 0, 0, 0],    // paragraph
			['O', 2, 9, 1, 1, 0],    // emphasis (pending)
			['T', 2, 'hello '],
			['O', 3, 10, 2, 1, 0],   // strong (child of emphasis)
			['T', 3, 'bold'],
			['C', 3],                  // strong committed
			['T', 2, ' world'],
			['R', 2, '_'],             // revoke emphasis
		));
		const para = doc.nodes.get(1)!;
		const strong = doc.nodes.get(3)!;

		// paragraph.content = ["_hello ", strong, " world"]
		expect(para.content.length).toBe(3);
		expect(para.content[0]).toBe('_hello ');
		expect(para.content[1]).toBe(strong);
		expect(para.content[2]).toBe(' world');

		// strong is reparented to paragraph
		expect(strong.parent).toBe(para);
		expect(strong.content).toEqual(['bold']);
	});

	it('merges adjacent strings after revoke', () => {
		const doc = new PFMDocument();
		doc.apply(batch(
			['O', 0, 0, -1, 0, 0],
			['O', 1, 7, 0, 0, 0],
			['T', 1, 'a'],
			['O', 2, 9, 1, 1, 0],
			['T', 2, 'b'],
			['R', 2, '_'],
			['T', 1, 'c'],
		));
		// "a" + "_" + "b" + "c" → all merge to "a_bc"
		expect(doc.nodes.get(1)!.content).toEqual(['a_bc']);
	});

	it('removes revoked node from nodes map', () => {
		const doc = new PFMDocument();
		doc.apply(batch(
			['O', 0, 0, -1, 0, 0],
			['O', 1, 7, 0, 0, 0],
			['O', 2, 9, 1, 1, 0],
			['R', 2, '_'],
		));
		expect(doc.nodes.has(2)).toBe(false);
	});
});

// ── Clear ────────────────────────────────────────────────────

describe('PFMDocument: clear', () => {
	it('empties node content', () => {
		const doc = new PFMDocument();
		doc.apply(batch(
			['O', 0, 0, -1, 0, 0],
			['O', 1, 7, 0, 0, 0],
			['T', 1, 'hello'],
			['O', 2, 9, 1, 0, 0],
			['T', 2, 'world'],
			['X', 1],
		));
		expect(doc.nodes.get(1)!.content).toEqual([]);
	});

	it('removes child subtrees from nodes map', () => {
		const doc = new PFMDocument();
		doc.apply(batch(
			['O', 0, 0, -1, 0, 0],
			['O', 1, 7, 0, 0, 0],
			['O', 2, 9, 1, 0, 0],
			['O', 3, 10, 2, 0, 0], // nested child
			['X', 1],
		));
		expect(doc.nodes.has(2)).toBe(false);
		expect(doc.nodes.has(3)).toBe(false);
		expect(doc.nodes.has(1)).toBe(true); // parent kept
	});
});

// ── Events ───────────────────────────────────────────────────

describe('PFMDocument: events', () => {
	it('fires onopen with the new node', () => {
		const doc = new PFMDocument();
		const opened: number[] = [];
		doc.onopen = (node) => opened.push(node.id);
		doc.apply(batch(
			['O', 0, 0, -1, 0, 0],
			['O', 1, 7, 0, 0, 0],
		));
		expect(opened).toEqual([0, 1]);
	});

	it('fires onclose with the closed node', () => {
		const doc = new PFMDocument();
		const closed: number[] = [];
		doc.onclose = (node) => closed.push(node.id);
		doc.apply(batch(
			['O', 0, 0, -1, 0, 0],
			['O', 1, 7, 0, 0, 0],
			['C', 1],
		));
		expect(closed).toEqual([1]);
	});

	it('fires ontext with node, contentIndex, and appended text', () => {
		const doc = new PFMDocument();
		const events: [number, number, string][] = [];
		doc.ontext = (node, idx, text) => events.push([node.id, idx, text]);
		doc.apply(batch(
			['O', 0, 0, -1, 0, 0],
			['O', 1, 7, 0, 0, 0],
			['T', 1, 'hel'],     // new segment at 0
			['T', 1, 'lo'],      // append to segment 0
			['O', 2, 9, 1, 0, 0],
			['T', 1, ' after'],   // new segment at 2 (after child node)
		));
		expect(events).toEqual([
			[1, 0, 'hel'],
			[1, 0, 'lo'],
			[1, 2, ' after'],
		]);
	});

	it('fires onattr with node, key, and value', () => {
		const doc = new PFMDocument();
		const events: [number, string, unknown][] = [];
		doc.onattr = (node, key, value) => events.push([node.id, key, value]);
		doc.apply(batch(
			['O', 0, 0, -1, 0, 0],
			['O', 1, 12, 0, 0, 0],
			['A', 1, 'href', 'url'],
		));
		expect(events).toEqual([[1, 'href', 'url']]);
	});

	it('fires onrevoke with parent, revoked node, and delimiter', () => {
		const doc = new PFMDocument();
		let revoke_event: [number, number, string] | null = null;
		doc.onrevoke = (parent, node, delim) => {
			revoke_event = [parent.id, node.id, delim];
		};
		doc.apply(batch(
			['O', 0, 0, -1, 0, 0],
			['O', 1, 7, 0, 0, 0],
			['O', 2, 9, 1, 1, 0],
			['R', 2, '_'],
		));
		expect(revoke_event).toEqual([1, 2, '_']);
	});

	it('fires onclear', () => {
		const doc = new PFMDocument();
		let cleared_id: number | null = null;
		doc.onclear = (node) => { cleared_id = node.id; };
		doc.apply(batch(
			['O', 0, 0, -1, 0, 0],
			['O', 1, 7, 0, 0, 0],
			['T', 1, 'hello'],
			['X', 1],
		));
		expect(cleared_id).toBe(1);
	});
});

// ── textContent ──────────────────────────────────────────────

describe('textContent', () => {
	it('extracts text from simple node', () => {
		const doc = new PFMDocument();
		doc.apply(batch(
			['O', 0, 0, -1, 0, 0],
			['O', 1, 7, 0, 0, 0],
			['T', 1, 'hello world'],
		));
		expect(textContent(doc.nodes.get(1)!)).toBe('hello world');
	});

	it('extracts text recursively through children', () => {
		const doc = new PFMDocument();
		doc.apply(batch(
			['O', 0, 0, -1, 0, 0],
			['O', 1, 7, 0, 0, 0],
			['T', 1, 'Hello '],
			['O', 2, 9, 1, 0, 0],
			['T', 2, 'world'],
			['C', 2],
			['T', 1, '!'],
			['C', 1],
		));
		expect(textContent(doc.nodes.get(1)!)).toBe('Hello world!');
	});

	it('works on root', () => {
		const doc = parse_doc('# Title\n\nhello\n');
		expect(textContent(doc.root!)).toContain('Title');
		expect(textContent(doc.root!)).toContain('hello');
	});
});

// ── Reset ────────────────────────────────────────────────────

describe('PFMDocument: reset', () => {
	it('clears all state', () => {
		const doc = new PFMDocument();
		doc.apply(batch(
			['O', 0, 0, -1, 0, 0],
			['O', 1, 7, 0, 0, 0],
		));
		doc.reset();
		expect(doc.root).toBeNull();
		expect(doc.schema).toBeNull();
		expect(doc.nodes.size).toBe(0);
	});
});

// ── applyBatch (bare dispatcher) ─────────────────────────────

describe('applyBatch', () => {
	it('dispatches all opcode types', () => {
		const log: string[] = [];
		applyBatch(
			[
				['S', ['root']],
				['O', 0, 0, -1, 0, 0],
				['T', 0, 'hello'],
				['A', 0, 'key', 'val'],
				['C', 0],
				['R', 1, '_'],
				['X', 2],
			],
			{
				schema: () => log.push('schema'),
				open: () => log.push('open'),
				text: () => log.push('text'),
				attr: () => log.push('attr'),
				close: () => log.push('close'),
				revoke: () => log.push('revoke'),
				clear: () => log.push('clear'),
			},
		);
		expect(log).toEqual(['schema', 'open', 'text', 'attr', 'close', 'revoke', 'clear']);
	});

	it('passes correct args to open handler', () => {
		let args: unknown[] = [];
		applyBatch(
			[['O', 5, 9, 1, 1, 3]],
			{ open: (...a) => { args = a; } },
		);
		expect(args).toEqual([5, 9, 1, true, 3]);
	});

	it('resolves pending flag from numeric', () => {
		let pending: boolean | null = null;
		applyBatch(
			[['O', 1, 7, 0, 0, 0]],
			{ open: (_id, _k, _p, p) => { pending = p; } },
		);
		expect(pending).toBe(false);
	});
});

// ── Integration: WireEmitter → PFMDocument ───────────────────

describe('integration: WireEmitter → PFMDocument', () => {
	it('paragraph with emphasis', () => {
		const doc = parse_doc('Hello _world_!\n');
		const para = find_by_kind(doc, 'paragraph')!;
		const em = find_by_kind(doc, 'emphasis')!;

		expect(para).toBeDefined();
		expect(em).toBeDefined();
		expect(em.parent).toBe(para);
		expect(para.content).toContain(em);
		expect(textContent(para)).toBe('Hello world!');

		// emphasis content
		expect(textContent(em)).toBe('world');
	});

	it('heading with depth', () => {
		const doc = parse_doc('### Title\n');
		const heading = find_by_kind(doc, 'heading')!;
		expect(heading).toBeDefined();
		expect(heading.extra).toBe(3);
		expect(textContent(heading)).toBe('Title');
		expect(heading.closed).toBe(true);
	});

	it('code fence with info and content', () => {
		const doc = parse_doc('```js\nconst x = 1;\n```\n');
		const cf = find_by_kind(doc, 'code_fence')!;
		expect(cf).toBeDefined();
		expect(cf.attrs.info).toBe('js');
		expect(textContent(cf)).toBe('const x = 1;');
	});

	it('link with href and text', () => {
		const doc = parse_doc('[click](https://example.com)\n');
		const link = find_by_kind(doc, 'link')!;
		expect(link).toBeDefined();
		expect(link.attrs.href).toBe('https://example.com');
		expect(textContent(link)).toBe('click');
	});

	it('block quote with nested paragraph', () => {
		const doc = parse_doc('> quoted text\n');
		const bq = find_by_kind(doc, 'block_quote')!;
		const para = find_by_kind(doc, 'paragraph')!;
		expect(bq).toBeDefined();
		expect(para.parent).toBe(bq);
		expect(textContent(para)).toBe('quoted text');
	});

	it('list with attrs', () => {
		const doc = parse_doc('- one\n- two\n');
		const list = find_by_kind(doc, 'list')!;
		expect(list.attrs.ordered).toBe(false);
		const items = find_all_by_kind(doc, 'list_item');
		expect(items.length).toBe(2);
	});

	it('all nodes are closed after batch parse', () => {
		const doc = parse_doc('# Hello\n\n_world_ **bold**\n');
		for (const node of doc.nodes.values()) {
			expect(node.closed).toBe(true);
		}
	});

	it('all nodes have pending=false after batch parse', () => {
		const doc = parse_doc('# Hello\n\n_world_ and *bold*\n');
		for (const node of doc.nodes.values()) {
			expect(node.pending).toBe(false);
		}
	});

	it('node references are stable across batches', () => {
		const emitter = new WireEmitter();
		const parser = new PFMParser(emitter);
		const doc = new PFMDocument();

		parser.init();

		// Feed first chunk
		const chunk1 = '# Hello\n\n';
		emitter.set_source(chunk1);
		parser.feed(chunk1);
		doc.apply(emitter.flush());

		// Capture references
		const root_ref = doc.root;
		const heading_ref = find_by_kind(doc, 'heading');

		// Feed second chunk
		const chunk2 = 'world\n';
		const full = chunk1 + chunk2;
		emitter.set_source(full);
		parser.feed(chunk2);
		doc.apply(emitter.flush());

		emitter.set_source(full);
		parser.finish();
		doc.apply(emitter.flush());

		// Same references
		expect(doc.root).toBe(root_ref);
		expect(find_by_kind(doc, 'heading')).toBe(heading_ref);
	});
});

// ── HTML rendering (batch) ───────────────────────────────────

describe('usage: HTML rendering', () => {
	function renderNode(node: PFMNode): string {
		const tag = htmlTag(node);
		const attrs = htmlAttrs(node);
		if (!tag) {
			// root — just render children
			let html = '';
			for (const item of node.content) {
				html += typeof item === 'string' ? escape(item) : renderNode(item);
			}
			return html;
		}
		let html = `<${tag}${attrs}>`;
		for (const item of node.content) {
			html += typeof item === 'string' ? escape(item) : renderNode(item);
		}
		html += `</${tag}>`;
		return html;
	}

	function htmlTag(node: PFMNode): string {
		switch (node.kindName) {
			case 'root': return '';
			case 'paragraph': return 'p';
			case 'heading': return `h${node.extra}`;
			case 'emphasis': return 'em';
			case 'strong_emphasis': return 'strong';
			case 'code_fence': return 'pre';
			case 'code_span': return 'code';
			case 'link': return 'a';
			case 'block_quote': return 'blockquote';
			case 'list': return (node.attrs.ordered ? 'ol' : 'ul');
			case 'list_item': return 'li';
			default: return 'span';
		}
	}

	function htmlAttrs(node: PFMNode): string {
		if (node.kindName === 'link' && node.attrs.href) {
			return ` href="${node.attrs.href}"`;
		}
		return '';
	}

	function escape(s: string): string {
		return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
	}

	it('renders a heading', () => {
		const doc = parse_doc('## Hello\n');
		const html = renderNode(doc.root!);
		expect(html).toContain('<h2>');
		expect(html).toContain('Hello');
		expect(html).toContain('</h2>');
	});

	it('renders paragraph with emphasis', () => {
		const doc = parse_doc('Hello _world_!\n');
		const html = renderNode(doc.root!);
		expect(html).toContain('<p>Hello <em>world</em>!</p>');
	});

	it('renders a link', () => {
		const doc = parse_doc('[click](https://example.com)\n');
		const html = renderNode(doc.root!);
		expect(html).toContain('<a href="https://example.com">click</a>');
	});
});

// ── AST rendering ────────────────────────────────────────────

describe('usage: AST conversion', () => {
	interface ASTNode {
		type: string;
		children?: ASTNode[];
		value?: string;
		[key: string]: unknown;
	}

	const VALUE_KINDS = new Set(['code_fence', 'code_span']);

	function toAST(node: PFMNode): ASTNode {
		if (VALUE_KINDS.has(node.kindName)) {
			return {
				type: node.kindName,
				value: textContent(node),
				...node.attrs,
			};
		}
		const children: ASTNode[] = [];
		for (const item of node.content) {
			if (typeof item === 'string') {
				children.push({ type: 'text', value: item });
			} else {
				children.push(toAST(item));
			}
		}
		const result: ASTNode = { type: node.kindName };
		if (children.length > 0) result.children = children;
		if (node.extra && node.kindName === 'heading') result.depth = node.extra;
		Object.assign(result, node.attrs);
		return result;
	}

	it('converts paragraph with emphasis to AST', () => {
		const doc = parse_doc('Hello _world_!\n');
		const ast = toAST(find_by_kind(doc, 'paragraph')!);
		expect(ast.type).toBe('paragraph');
		expect(ast.children!.length).toBe(3);
		expect(ast.children![0]).toEqual({ type: 'text', value: 'Hello ' });
		expect(ast.children![1].type).toBe('emphasis');
		expect(ast.children![1].children![0]).toEqual({ type: 'text', value: 'world' });
		expect(ast.children![2]).toEqual({ type: 'text', value: '!' });
	});

	it('converts heading with depth', () => {
		const doc = parse_doc('### Title\n');
		const ast = toAST(find_by_kind(doc, 'heading')!);
		expect(ast.type).toBe('heading');
		expect(ast.depth).toBe(3);
	});

	it('converts code fence with info', () => {
		const doc = parse_doc('```js\ncode\n```\n');
		const ast = toAST(find_by_kind(doc, 'code_fence')!);
		expect(ast.type).toBe('code_fence');
		expect(ast.value).toBe('code');
		expect(ast.info).toBe('js');
	});
});
