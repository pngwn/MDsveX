import { describe, it, expect } from 'vitest';
import { PFMParser, node_kind } from '../src/main';
import type { Emitter } from '../src/opcodes';

/**
 * Opcode recording emitter, captures the raw opcode stream for assertions.
 */
type Op =
	| {
			op: 'open';
			id: number;
			kind: number;
			start: number;
			parent: number;
			extra: number;
			pending: boolean;
	  }
	| { op: 'close'; id: number; end: number }
	| { op: 'text'; parent: number; start: number; end: number }
	| { op: 'attr'; id: number; key: string; value: any }
	| { op: 'revoke'; id: number };

class RecordingEmitter implements Emitter {
	ops: Op[] = [];

	open(
		id: number,
		kind: number,
		start: number,
		parent: number,
		extra: number,
		pending: boolean
	): void {
		this.ops.push({ op: 'open', id, kind, start, parent, extra, pending });
	}
	close(id: number, end: number): void {
		this.ops.push({ op: 'close', id, end });
	}
	text(parent: number, start: number, end: number): void {
		this.ops.push({ op: 'text', parent, start, end });
	}
	attr(id: number, key: string, value: any): void {
		this.ops.push({ op: 'attr', id, key, value });
	}
	set_value_start(id: number, pos: number): void {
		this.ops.push({ op: 'attr', id, key: 'value_start', value: pos });
	}
	set_value_end(id: number, pos: number): void {
		this.ops.push({ op: 'attr', id, key: 'value_end', value: pos });
	}
	revoke(id: number): void {
		this.ops.push({ op: 'revoke', id });
	}
	cursor(_pos: number): void {}
}

function parse_to_ops(input: string): Op[] {
	const rec = new RecordingEmitter();
	const parser = new PFMParser(rec);
	parser.parse(input);
	return rec.ops;
}

function feed_to_ops(input: string, chunk_size: number): Op[] {
	const rec = new RecordingEmitter();
	const parser = new PFMParser(rec);
	parser.init();
	for (let i = 0; i < input.length; i += chunk_size) {
		parser.feed(input.slice(i, Math.min(i + chunk_size, input.length)));
	}
	parser.finish();
	return rec.ops;
}

/** Filter ops to only structural ones (open/close/revoke), ignoring attrs */
function structural(ops: Op[]): Op[] {
	return ops.filter(
		(o) => o.op === 'open' || o.op === 'close' || o.op === 'revoke'
	);
}

/** Find all ops for a given node id */
function ops_for(ops: Op[], id: number): Op[] {
	return ops.filter((o) => 'id' in o && o.id === id);
}

/** Find the open op for a given node kind */
function find_open(ops: Op[], kind: number): Op | undefined {
	return ops.find((o) => o.op === 'open' && o.kind === kind);
}

describe('Opcode stream', () => {
	describe('eager/optimistic emphasis', () => {
		it('emits open(strong_emphasis, pending=true) eagerly on *', () => {
			const ops = parse_to_ops('hello *world*\n');
			const emph_open = ops.find(
				(o) => o.op === 'open' && o.kind === node_kind.strong_emphasis
			);
			expect(emph_open).toBeDefined();
			expect(emph_open!.op).toBe('open');
			expect((emph_open as any).pending).toBe(true);
		});

		it('emits close (commit) when matching * found', () => {
			const ops = parse_to_ops('hello *world*\n');
			const emph_open = ops.find(
				(o) => o.op === 'open' && o.kind === node_kind.strong_emphasis
			) as any;
			expect(emph_open).toBeDefined();

			// Should have a close for the same id (no revoke)
			const emph_close = ops.find(
				(o) => o.op === 'close' && o.id === emph_open.id
			);
			expect(emph_close).toBeDefined();

			// No revoke for this id
			const emph_revoke = ops.find(
				(o) => o.op === 'revoke' && o.id === emph_open.id
			);
			expect(emph_revoke).toBeUndefined();
		});

		it('emits revoke when * is unclosed at paragraph end', () => {
			const ops = parse_to_ops('hello *friends\n');
			const emph_open = ops.find(
				(o) => o.op === 'open' && o.kind === node_kind.strong_emphasis
			) as any;
			expect(emph_open).toBeDefined();
			expect(emph_open.pending).toBe(true);

			// Should have a revoke (not a close) for this id
			const emph_revoke = ops.find(
				(o) => o.op === 'revoke' && o.id === emph_open.id
			);
			expect(emph_revoke).toBeDefined();
		});

		it('emits revoke when * is unclosed at blank line boundary', () => {
			const ops = parse_to_ops('hello *friends\n\nnew paragraph\n');
			const emph_open = ops.find(
				(o) => o.op === 'open' && o.kind === node_kind.strong_emphasis
			) as any;
			expect(emph_open).toBeDefined();

			const emph_revoke = ops.find(
				(o) => o.op === 'revoke' && o.id === emph_open.id
			);
			expect(emph_revoke).toBeDefined();
		});

		it('emphasis _ follows same pattern', () => {
			// Committed
			const ops_ok = parse_to_ops('hello _world_\n');
			const em_open = ops_ok.find(
				(o) => o.op === 'open' && o.kind === node_kind.emphasis
			) as any;
			expect(em_open).toBeDefined();
			expect(em_open.pending).toBe(true);
			expect(
				ops_ok.find((o) => o.op === 'close' && o.id === em_open.id)
			).toBeDefined();
			expect(
				ops_ok.find((o) => o.op === 'revoke' && o.id === em_open.id)
			).toBeUndefined();

			// Revoked
			const ops_fail = parse_to_ops('hello _friends\n');
			const em_open2 = ops_fail.find(
				(o) => o.op === 'open' && o.kind === node_kind.emphasis
			) as any;
			expect(em_open2).toBeDefined();
			expect(
				ops_fail.find((o) => o.op === 'revoke' && o.id === em_open2.id)
			).toBeDefined();
		});
	});

	describe('opcode ordering', () => {
		it('open comes before close for committed nodes', () => {
			const ops = parse_to_ops('*bold*\n');
			const emph_open_idx = ops.findIndex(
				(o) => o.op === 'open' && o.kind === node_kind.strong_emphasis
			);
			const emph_id = (ops[emph_open_idx] as any).id;
			const emph_close_idx = ops.findIndex(
				(o) => o.op === 'close' && o.id === emph_id
			);
			expect(emph_open_idx).toBeLessThan(emph_close_idx);
		});

		it('open comes before revoke for uncommitted nodes', () => {
			const ops = parse_to_ops('*unclosed\n');
			const emph_open_idx = ops.findIndex(
				(o) => o.op === 'open' && o.kind === node_kind.strong_emphasis
			);
			const emph_id = (ops[emph_open_idx] as any).id;
			const emph_revoke_idx = ops.findIndex(
				(o) => o.op === 'revoke' && o.id === emph_id
			);
			expect(emph_open_idx).toBeLessThan(emph_revoke_idx);
		});

		it('paragraph open comes before its children', () => {
			const ops = parse_to_ops('hello world\n');
			const para_open_idx = ops.findIndex(
				(o) => o.op === 'open' && o.kind === node_kind.paragraph
			);
			const para_id = (ops[para_open_idx] as any).id;
			// Text node under paragraph should come after
			const text_open_idx = ops.findIndex(
				(o, i) =>
					i > para_open_idx && o.op === 'open' && o.kind === node_kind.text
			);
			expect(text_open_idx).toBeGreaterThan(para_open_idx);
		});
	});

	describe('incremental opcode stream', () => {
		it('incremental produces same structural ops as batch for emphasis', () => {
			const input = 'hello *world* end\n';
			const batch = structural(parse_to_ops(input));
			const incr = structural(feed_to_ops(input, 3));

			// Same number of structural ops
			expect(incr.length).toBe(batch.length);
			// Same op types in same order
			expect(incr.map((o) => o.op)).toEqual(batch.map((o) => o.op));
		});

		it('incremental produces same structural ops for unclosed emphasis', () => {
			const input = 'hello *friends\n';
			const batch = structural(parse_to_ops(input));
			const incr = structural(feed_to_ops(input, 3));

			expect(incr.map((o) => o.op)).toEqual(batch.map((o) => o.op));
			// Both should have a revoke
			expect(batch.some((o) => o.op === 'revoke')).toBe(true);
			expect(incr.some((o) => o.op === 'revoke')).toBe(true);
		});

		it('streaming emits emphasis open before content text', () => {
			const input = 'hello *world* end\n';
			const ops = feed_to_ops(input, 1);

			const emph_open_idx = ops.findIndex(
				(o) => o.op === 'open' && o.kind === node_kind.strong_emphasis
			);
			expect(emph_open_idx).toBeGreaterThan(-1);

			// The emphasis open should appear before any text inside it
			const emph_id = (ops[emph_open_idx] as any).id;
			const text_inside = ops.findIndex(
				(o, i) =>
					i > emph_open_idx && o.op === 'open' && o.kind === node_kind.text
			);
			expect(text_inside).toBeGreaterThan(emph_open_idx);
		});
	});

	describe('node lifecycle', () => {
		it('heading is atomic (open + close, no children)', () => {
			const ops = parse_to_ops('# Hello\n');
			const heading_open = find_open(ops, node_kind.heading) as any;
			expect(heading_open).toBeDefined();
			expect(heading_open.extra).toBe(1); // depth 1
			expect(heading_open.pending).toBe(false); // not speculative

			const heading_close = ops.find(
				(o) => o.op === 'close' && o.id === heading_open.id
			);
			expect(heading_close).toBeDefined();
		});

		it('code fence has value attrs', () => {
			const ops = parse_to_ops('```js\ncode\n```\n');
			const fence_open = find_open(ops, node_kind.code_fence) as any;
			expect(fence_open).toBeDefined();

			const fence_ops = ops_for(ops, fence_open.id);
			// Should have attrs for info and value
			const attrs = fence_ops.filter((o) => o.op === 'attr');
			const keys = attrs.map((o) => (o as any).key);
			expect(keys).toContain('info_start');
			expect(keys).toContain('info_end');
			expect(keys).toContain('value_start');
			expect(keys).toContain('value_end');
		});

		it('link has href attr', () => {
			const ops = parse_to_ops('[text](/url)\n');
			const link_open = find_open(ops, node_kind.link) as any;
			expect(link_open).toBeDefined();

			const href_attr = ops.find(
				(o) =>
					o.op === 'attr' && o.id === link_open.id && (o as any).key === 'href'
			);
			expect(href_attr).toBeDefined();
			expect((href_attr as any).value).toBe('/url');
		});

		it('list has ordered/start/tight attrs on close', () => {
			const ops = parse_to_ops('- one\n- two\n');
			const list_open = find_open(ops, node_kind.list) as any;
			expect(list_open).toBeDefined();

			const list_attrs = ops.filter(
				(o) => o.op === 'attr' && o.id === list_open.id
			);
			const keys = list_attrs.map((o) => (o as any).key);
			expect(keys).toContain('ordered');
			expect(keys).toContain('start');
			expect(keys).toContain('tight');
		});

		it('thematic break is atomic (open + close)', () => {
			const ops = parse_to_ops('---\n');
			const tb_open = find_open(ops, node_kind.thematic_break) as any;
			expect(tb_open).toBeDefined();
			const tb_close = ops.find((o) => o.op === 'close' && o.id === tb_open.id);
			expect(tb_close).toBeDefined();
		});
	});
});
