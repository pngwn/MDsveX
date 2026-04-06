import { describe, it, expect } from 'vitest';
import { PFMParser, node_kind } from '../src/main';
import { WireEmitter, WireOp } from '../src/wire_emitter';

/** Parse in batch mode, return flushed wire opcodes. */
function parse_wire(source: string): unknown[][] {
	const emitter = new WireEmitter();
	emitter.set_source(source);
	const parser = new PFMParser(emitter);
	parser.parse(source);
	return emitter.flush();
}

/** Parse incrementally by chunk size, return all batches. */
function parse_wire_incremental(
	source: string,
	chunk_size: number
): unknown[][][] {
	const emitter = new WireEmitter();
	const parser = new PFMParser(emitter);
	parser.init();

	const batches: unknown[][][] = [];
	let accumulated = '';

	for (let i = 0; i < source.length; i += chunk_size) {
		const chunk = source.slice(i, Math.min(i + chunk_size, source.length));
		accumulated += chunk;
		emitter.set_source(accumulated);
		parser.feed(chunk);
		const batch = emitter.flush();
		if (batch.length > 0) batches.push(batch);
	}

	emitter.set_source(accumulated);
	parser.finish();
	const final = emitter.flush();
	if (final.length > 0) batches.push(final);

	return batches;
}

/** Find all opcodes of a given type in a flat list. */
function ops_of(ops: unknown[][], type: string): unknown[][] {
	return ops.filter((op) => op[0] === type);
}

/** Find the first opcode of a given type. */
function first_op(ops: unknown[][], type: string): unknown[] | undefined {
	return ops.find((op) => op[0] === type);
}

/** Find all T opcodes for a given node ID. */
function text_for(ops: unknown[][], id: number): string {
	return ops
		.filter((op) => op[0] === WireOp.Text && op[1] === id)
		.map((op) => op[2])
		.join('');
}

describe('wire format: schema', () => {
	it('emits schema as the first opcode', () => {
		const ops = parse_wire('hello\n');
		expect(ops[0][0]).toBe(WireOp.Schema);
		expect(ops[0][1]).toBeInstanceOf(Array);
	});

	it('schema maps kind indices to names', () => {
		const ops = parse_wire('hello\n');
		const kinds = ops[0][1] as string[];
		expect(kinds[node_kind.root]).toBe('root');
		expect(kinds[node_kind.paragraph]).toBe('paragraph');
		expect(kinds[node_kind.heading]).toBe('heading');
		expect(kinds[node_kind.emphasis]).toBe('emphasis');
		expect(kinds[node_kind.code_fence]).toBe('code_fence');
	});

	it('schema is only emitted once across flushes', () => {
		const batches = parse_wire_incremental('hello\n\nworld\n', 5);
		const all_ops = batches.flat();
		const schemas = ops_of(all_ops, WireOp.Schema);
		expect(schemas.length).toBe(1);
	});
});

describe('wire format: text node suppression', () => {
	it('does not emit O or C for text nodes', () => {
		const ops = parse_wire('hello\n');
		const opens = ops_of(ops, WireOp.Open);
		// Should have root + paragraph, no text node
		const text_opens = opens.filter((op) => op[2] === node_kind.text);
		expect(text_opens.length).toBe(0);
	});

	it('converts text node content to T on parent', () => {
		const ops = parse_wire('hello\n');
		// Find paragraph
		const para_open = ops.find(
			(op) => op[0] === WireOp.Open && op[2] === node_kind.paragraph
		);
		expect(para_open).toBeDefined();
		const para_id = para_open![1] as number;
		const content = text_for(ops, para_id);
		expect(content).toBe('hello');
	});
});

describe('wire format: paragraphs', () => {
	it('simple paragraph', () => {
		const ops = parse_wire('hello world\n');
		const para = first_op(ops, WireOp.Open);
		// First real open after root should be paragraph (skip schema + root)
		const opens = ops_of(ops, WireOp.Open);
		const para_open = opens.find((op) => op[2] === node_kind.paragraph);
		expect(para_open).toBeDefined();
		const para_id = para_open![1] as number;

		expect(text_for(ops, para_id)).toBe('hello world');

		const closes = ops_of(ops, WireOp.Close);
		expect(closes.some((op) => op[1] === para_id)).toBe(true);
	});

	it('multi-line paragraph', () => {
		const ops = parse_wire('line one\nline two\n');
		const para_open = ops.find(
			(op) => op[0] === WireOp.Open && op[2] === node_kind.paragraph
		);
		const para_id = para_open![1] as number;
		const content = text_for(ops, para_id);
		expect(content).toContain('line one');
		expect(content).toContain('line two');
	});
});

describe('wire format: headings', () => {
	it('ATX heading with depth in extra field', () => {
		const ops = parse_wire('## Title\n');
		const h_open = ops.find(
			(op) => op[0] === WireOp.Open && op[2] === node_kind.heading
		);
		expect(h_open).toBeDefined();
		expect(h_open![5]).toBe(2); // extra = depth
		const h_id = h_open![1] as number;
		expect(text_for(ops, h_id)).toBe('Title');
	});

	it('heading depth 1', () => {
		const ops = parse_wire('# H1\n');
		const h_open = ops.find(
			(op) => op[0] === WireOp.Open && op[2] === node_kind.heading
		);
		expect(h_open![5]).toBe(1);
		expect(text_for(ops, h_open![1] as number)).toBe('H1');
	});
});

describe('wire format: emphasis', () => {
	it('emphasis is emitted with pending flag', () => {
		const ops = parse_wire('_hello_\n');
		const em_open = ops.find(
			(op) => op[0] === WireOp.Open && op[2] === node_kind.emphasis
		);
		expect(em_open).toBeDefined();
		expect(em_open![4]).toBe(1); // pending = 1
	});

	it('emphasis text is on the emphasis node', () => {
		const ops = parse_wire('_hello_\n');
		const em_open = ops.find(
			(op) => op[0] === WireOp.Open && op[2] === node_kind.emphasis
		);
		const em_id = em_open![1] as number;
		expect(text_for(ops, em_id)).toBe('hello');
	});

	it('mixed text and emphasis', () => {
		const ops = parse_wire('before _middle_ after\n');
		const para_open = ops.find(
			(op) => op[0] === WireOp.Open && op[2] === node_kind.paragraph
		);
		const para_id = para_open![1] as number;
		const em_open = ops.find(
			(op) => op[0] === WireOp.Open && op[2] === node_kind.emphasis
		);
		const em_id = em_open![1] as number;

		// Para should have surrounding text
		const para_text = text_for(ops, para_id);
		expect(para_text).toContain('before ');
		expect(para_text).toContain(' after');

		// Emphasis should have inner text
		expect(text_for(ops, em_id)).toBe('middle');
	});
});

describe('wire format: strong emphasis', () => {
	it('strong emphasis node', () => {
		const ops = parse_wire('*bold*\n');
		const strong_open = ops.find(
			(op) => op[0] === WireOp.Open && op[2] === node_kind.strong_emphasis
		);
		expect(strong_open).toBeDefined();
		const strong_id = strong_open![1] as number;
		expect(text_for(ops, strong_id)).toBe('bold');
	});
});

describe('wire format: code fences', () => {
	it('code fence with info string', () => {
		const ops = parse_wire('```js\nconst x = 1;\n```\n');
		const cf_open = ops.find(
			(op) => op[0] === WireOp.Open && op[2] === node_kind.code_fence
		);
		expect(cf_open).toBeDefined();
		const cf_id = cf_open![1] as number;

		// Should have resolved info attr (not info_start/info_end)
		const info_attr = ops.find(
			(op) => op[0] === WireOp.Attr && op[1] === cf_id && op[2] === 'info'
		);
		expect(info_attr).toBeDefined();
		expect(info_attr![3]).toBe('js');

		// Content as T event
		expect(text_for(ops, cf_id)).toBe('const x = 1;');
	});

	it('code fence without info string', () => {
		const ops = parse_wire('```\nhello\n```\n');
		const cf_open = ops.find(
			(op) => op[0] === WireOp.Open && op[2] === node_kind.code_fence
		);
		const cf_id = cf_open![1] as number;

		// No info attr
		const info_attr = ops.find(
			(op) => op[0] === WireOp.Attr && op[1] === cf_id && op[2] === 'info'
		);
		expect(info_attr).toBeUndefined();

		expect(text_for(ops, cf_id)).toBe('hello');
	});
});

describe('wire format: code spans', () => {
	it('inline code span', () => {
		const ops = parse_wire('use `code` here\n');
		const cs_open = ops.find(
			(op) => op[0] === WireOp.Open && op[2] === node_kind.code_span
		);
		expect(cs_open).toBeDefined();
		const cs_id = cs_open![1] as number;
		expect(text_for(ops, cs_id)).toBe('code');
	});
});

describe('wire format: links', () => {
	it('inline link with href attr', () => {
		const ops = parse_wire('[click](https://example.com)\n');
		const link_open = ops.find(
			(op) => op[0] === WireOp.Open && op[2] === node_kind.link
		);
		expect(link_open).toBeDefined();
		const link_id = link_open![1] as number;

		const href_attr = ops.find(
			(op) => op[0] === WireOp.Attr && op[1] === link_id && op[2] === 'href'
		);
		expect(href_attr).toBeDefined();
		expect(href_attr![3]).toBe('https://example.com');

		expect(text_for(ops, link_id)).toBe('click');
	});

	it('link with title', () => {
		const ops = parse_wire('[text](url "title")\n');
		const link_open = ops.find(
			(op) => op[0] === WireOp.Open && op[2] === node_kind.link
		);
		const link_id = link_open![1] as number;

		const title_attr = ops.find(
			(op) => op[0] === WireOp.Attr && op[1] === link_id && op[2] === 'title'
		);
		expect(title_attr).toBeDefined();
		expect(title_attr![3]).toBe('title');
	});
});

describe('wire format: block quotes', () => {
	it('block quote wraps content', () => {
		const ops = parse_wire('> quoted\n');
		const bq_open = ops.find(
			(op) => op[0] === WireOp.Open && op[2] === node_kind.block_quote
		);
		expect(bq_open).toBeDefined();
		const bq_id = bq_open![1] as number;

		// Block quote should contain a paragraph child
		const para_open = ops.find(
			(op) =>
				op[0] === WireOp.Open &&
				op[2] === node_kind.paragraph &&
				op[3] === bq_id
		);
		expect(para_open).toBeDefined();
	});
});

describe('wire format: lists', () => {
	it('unordered list with attrs', () => {
		const ops = parse_wire('- one\n- two\n');
		const list_open = ops.find(
			(op) => op[0] === WireOp.Open && op[2] === node_kind.list
		);
		expect(list_open).toBeDefined();
		const list_id = list_open![1] as number;

		const ordered_attr = ops.find(
			(op) => op[0] === WireOp.Attr && op[1] === list_id && op[2] === 'ordered'
		);
		expect(ordered_attr).toBeDefined();
		expect(ordered_attr![3]).toBe(false);
	});
});

describe('wire format: attrs', () => {
	it('does not emit value_start or value_end as attrs', () => {
		const ops = parse_wire('# heading\n\nhello world\n');
		const value_attrs = ops.filter(
			(op) =>
				op[0] === WireOp.Attr &&
				(op[2] === 'value_start' || op[2] === 'value_end')
		);
		expect(value_attrs.length).toBe(0);
	});

	it('does not emit info_start or info_end as attrs', () => {
		const ops = parse_wire('```js\ncode\n```\n');
		const info_attrs = ops.filter(
			(op) =>
				op[0] === WireOp.Attr &&
				(op[2] === 'info_start' || op[2] === 'info_end')
		);
		expect(info_attrs.length).toBe(0);
	});
});

describe('wire format: revoke', () => {
	it('revoke includes delimiter for emphasis', () => {
		// Unclosed emphasis, should be revoked
		const ops = parse_wire('_unclosed\n');
		const revokes = ops_of(ops, WireOp.Revoke);
		if (revokes.length > 0) {
			expect(revokes[0][2]).toBe('_');
		}
	});
});

describe('wire format: incremental batching', () => {
	it('batches opcodes per feed() call', () => {
		const batches = parse_wire_incremental('# hello\n\nworld\n', 4);
		// Should have multiple batches
		expect(batches.length).toBeGreaterThanOrEqual(2);
	});

	it('schema only in first batch', () => {
		const batches = parse_wire_incremental('# hello\n\nworld\n', 4);
		// First batch starts with schema
		const first = batches[0];
		expect(first[0][0]).toBe(WireOp.Schema);

		// No other batch has schema
		for (let i = 1; i < batches.length; i++) {
			const schemas = ops_of(batches[i], WireOp.Schema);
			expect(schemas.length).toBe(0);
		}
	});

	it('all batches combined produce same content as batch parse', () => {
		const source = '# Hello\n\nsome _text_ here\n';
		const batch_ops = parse_wire(source);
		const inc_batches = parse_wire_incremental(source, 3);
		const inc_ops = inc_batches.flat();

		// Both should have the same text content per node
		// Collect text by node ID from both
		const batch_text = new Map<number, string>();
		const inc_text = new Map<number, string>();

		for (const op of batch_ops) {
			if (op[0] === WireOp.Text) {
				const id = op[1] as number;
				batch_text.set(id, (batch_text.get(id) ?? '') + op[2]);
			}
		}
		for (const op of inc_ops) {
			if (op[0] === WireOp.Text) {
				const id = op[1] as number;
				inc_text.set(id, (inc_text.get(id) ?? '') + op[2]);
			}
		}

		expect(inc_text).toEqual(batch_text);
	});
});

describe('wire format: serialization', () => {
	it('flush_json returns valid JSON', () => {
		const emitter = new WireEmitter();
		emitter.set_source('hello\n');
		const parser = new PFMParser(emitter);
		parser.parse('hello\n');
		const json = emitter.flush_json();
		const parsed = JSON.parse(json);
		expect(parsed).toBeInstanceOf(Array);
		expect(parsed[0][0]).toBe(WireOp.Schema);
	});

	it('flush returns empty array when nothing buffered', () => {
		const emitter = new WireEmitter();
		emitter.set_source('hello\n');
		const parser = new PFMParser(emitter);
		parser.parse('hello\n');
		emitter.flush(); // drain
		const second = emitter.flush();
		expect(second.length).toBe(0);
	});
});

describe('wire format: reset', () => {
	it('reset allows reuse for a new parse', () => {
		const emitter = new WireEmitter();

		emitter.set_source('first\n');
		let parser = new PFMParser(emitter);
		parser.parse('first\n');
		const first = emitter.flush();
		expect(first.length).toBeGreaterThan(0);

		emitter.reset();
		emitter.set_source('second\n');
		parser = new PFMParser(emitter);
		parser.parse('second\n');
		const second = emitter.flush();

		// Should have schema again after reset
		expect(second[0][0]).toBe(WireOp.Schema);
		// Should have 'second' text, not 'first'
		const all_text = second
			.filter((op) => op[0] === WireOp.Text)
			.map((op) => op[2])
			.join('');
		expect(all_text).toContain('second');
		expect(all_text).not.toContain('first');
	});
});
