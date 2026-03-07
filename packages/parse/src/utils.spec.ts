import { describe, test, expect } from 'vitest';
import { node_buffer, node_kind } from './utils';

describe('node_buffer', () => {
	test('push should add a node to the buffer', () => {
		const buffer = new node_buffer();
		buffer.push(node_kind.text, 0, 0);
		expect(buffer.size).toBe(2);
	});

	test('get_node should return the node at the given index', () => {
		const buffer = new node_buffer();
		const id1 = buffer.push(node_kind.text, 0, 0);
		expect(buffer.get_node(id1)).toEqual({
			kind: 'text',
			start: 0,
			end: 0xffffffff, // sentinel: end not yet set
			index: id1,
			metadata: {},
			parent: 0,
			next: null,
			prev: null,
			children: [],
			value: [0, 0],
		});

		expect(buffer.get_node()).toEqual({
			kind: 'root',
			start: 0,
			end: 0xffffffff, // sentinel: end not yet set
			index: 0,
			metadata: {},
			parent: null,
			next: null,
			prev: null,
			children: [1],
			value: [0, 0],
		});
	});

	test('push should correctly track the parent and sibling relationships', () => {
		const buffer = new node_buffer(); // 0
		const id1 = buffer.push(node_kind.text, 0, 0);
		const id2 = buffer.push(node_kind.text, 1, 0);
		const id2_2 = buffer.push(node_kind.text, 1, id2);
		const id3 = buffer.push(node_kind.text, 2, 0);
		const id4 = buffer.push(node_kind.text, 3, 0);

		expect(buffer.get_node().children).toEqual([id1, id2, id3, id4]);

		expect(buffer.get_node(id1).next).toEqual(id2);
		expect(buffer.get_node(id1).prev).toEqual(null);
		expect(buffer.get_node(id1).parent).toEqual(0);

		expect(buffer.get_node(id2).next).toEqual(id3);
		expect(buffer.get_node(id2).prev).toEqual(id1);
		expect(buffer.get_node(id2).parent).toEqual(0);

		expect(buffer.get_node(id2_2).next).toEqual(null);
		expect(buffer.get_node(id2_2).prev).toEqual(null);
		expect(buffer.get_node(id2_2).parent).toEqual(id2);

		expect(buffer.get_node(id3).next).toEqual(id4);
		expect(buffer.get_node(id3).prev).toEqual(id2);
		expect(buffer.get_node(id3).parent).toEqual(0);

		expect(buffer.get_node(id4).next).toEqual(null);
		expect(buffer.get_node(id4).prev).toEqual(id3);
		expect(buffer.get_node(id4).parent).toEqual(0);
	});

	test('set_end should update the position of the node at the given index', () => {
		const buffer = new node_buffer();
		const id1 = buffer.push(node_kind.text, 0, 0);
		buffer.set_end(1, 200);

		expect(buffer.get_node(id1).end).toEqual(200);
	});

	test('set_parent_kind should update the parent of the node at the given index', () => {
		const buffer = new node_buffer();
		const id1 = buffer.push(node_kind.text, 0, 0);
		expect(buffer.get_node().kind).toEqual('root');
		buffer.set_parent_kind(id1, node_kind.html);
		expect(buffer.get_node().kind).toEqual('html');
	});

	test('adding a child should update the parent and sibling relationships', () => {
		const buffer = new node_buffer(); //0
		const id1 = buffer.push(node_kind.text, 0, 0);
		const id2 = buffer.push(node_kind.text, 1, 0);
		const id3 = buffer.push(node_kind.text, 2, 0);
		const id4 = buffer.push(node_kind.text, 3, 0);

		const id5 = buffer.push(node_kind.text, 4, 4);
		const id6 = buffer.push(node_kind.text, 4, 4);
		const id7 = buffer.push(node_kind.text, 4, 4);
		const id8 = buffer.push(node_kind.text, 4, 4);

		const id9 = buffer.push(node_kind.text, 4, 0);

		expect(buffer.get_node().children).toEqual([id1, id2, id3, id4, id9]);
		expect(buffer.get_node(id4).children).toEqual([id5, id6, id7, id8]);
	});

	// metadata
	test('metadata should be set and retrieved correctly', () => {
		const buffer = new node_buffer();
		const id1 = buffer.push(node_kind.text, 0, 0, 0, { foo: 'bar' });
		expect(buffer.get_node(id1).metadata).toEqual({ foo: 'bar' });
	});

	test('extras should be set on metadata when there is a mapping', () => {
		const buffer = new node_buffer();
		const id1 = buffer.push(node_kind.heading, 0, 0, 1);

		expect(buffer.get_node(id1).metadata).toEqual({ depth: 1 });

		buffer.set_extra(id1, 2);
		expect(buffer.get_node(id1).metadata).toEqual({ depth: 2 });
	});

	test('value_start should be set and retrieved correctly', () => {
		const buffer = new node_buffer();
		const id1 = buffer.push(node_kind.text, 0, 0, 0, { foo: 'bar' });
		buffer.set_value(id1, 1, 2);
		expect(buffer.get_node(id1).value).toEqual([1, 2]);
	});

	test('nodes can be pending', () => {
		const buffer = new node_buffer();
		const id1 = buffer.push_pending(node_kind.emphasis, 0, 0, 0, {
			foo: 'bar',
		});

		expect(buffer.get_pending()).toEqual([id1]);

		expect(buffer.get_node(id1).value).toEqual([0, 0]);
	});

	test('nodes can be committed', () => {
		const buffer = new node_buffer();
		const id1 = buffer.push_pending(node_kind.emphasis, 0, 0, 0, {
			foo: 'bar',
		});

		buffer.commit_node(id1);
		expect(buffer.get_pending()).toEqual([]);
	});

	test('pending nodes are the same as any other node', () => {
		const buffer = new node_buffer();
		const id1 = buffer.push_pending(node_kind.emphasis, 0, 0);
		const id2 = buffer.push(node_kind.text, 0, id1);

		expect(buffer.get_node(id1).kind).toEqual('emphasis');
		expect(buffer.get_node(id2).kind).toEqual('text');

		expect(buffer.get_node(id2).parent).toEqual(id1);
	});

	test('pending nodes can be repaired', () => {
		const buffer = new node_buffer();
		const id1 = buffer.push_pending(node_kind.emphasis, 0, 0);
		const id2 = buffer.push(node_kind.text, 0, id1);
		expect(buffer.get_node(id2).parent).toEqual(id1);

		buffer.repair();

		expect(buffer.get_node(id1).kind).toEqual('text');
		expect(buffer.get_node(id2).parent).toEqual(0);
		expect(buffer.get_node(id1).next).toEqual(id2);
		expect(buffer.get_node(id2).prev).toEqual(id1);
		expect(buffer.get_node(id1).children).toEqual([]);
	});

	test('grow should preserve all node data when capacity is exceeded', () => {
		// Start with a tiny capacity so we force multiple grows
		const buffer = new node_buffer(2);

		// Push enough nodes to trigger at least one grow
		// capacity starts at 2 (next power of two), root takes slot 0
		const ids: number[] = [];
		for (let i = 0; i < 10; i++) {
			ids.push(buffer.push(node_kind.text, i * 10, 0));
		}

		expect(buffer.size).toBe(11); // 10 + root

		// All nodes should still be accessible with correct data
		for (let i = 0; i < ids.length; i++) {
			const node = buffer.get_node(ids[i]);
			expect(node.kind).toBe('text');
			expect(node.start).toBe(i * 10);
			expect(node.parent).toBe(0);
		}

		// Root should have all 10 as children
		expect(buffer.get_node().children).toEqual(ids);

		// Sibling chain should be intact
		for (let i = 0; i < ids.length; i++) {
			const node = buffer.get_node(ids[i]);
			expect(node.prev).toBe(i === 0 ? null : ids[i - 1]);
			expect(node.next).toBe(i === ids.length - 1 ? null : ids[i + 1]);
		}
	});

	test('grow should preserve parent-child relationships', () => {
		const buffer = new node_buffer(2);

		// Create a parent with children, forcing grow in the middle
		const parent = buffer.push(node_kind.paragraph, 0, 0);
		const children: number[] = [];
		for (let i = 0; i < 8; i++) {
			children.push(buffer.push(node_kind.text, i, parent));
		}

		// Parent should know all its children
		expect(buffer.get_node(parent).children).toEqual(children);

		// Each child should know its parent
		for (const child of children) {
			expect(buffer.get_node(child).parent).toBe(parent);
		}
	});

	test('grow should preserve metadata', () => {
		const buffer = new node_buffer(2);

		const id1 = buffer.push(node_kind.code_fence, 0, 0, 0, {
			info_start: 3,
			info_end: 5,
		});

		// Push enough to trigger grow
		for (let i = 0; i < 8; i++) {
			buffer.push(node_kind.text, i, 0);
		}

		// Metadata should survive the grow
		const node = buffer.get_node(id1);
		expect(node.metadata).toEqual({ info_start: 3, info_end: 5 });
	});

	test('grow should preserve pending node state', () => {
		const buffer = new node_buffer(2);

		const pending = buffer.push_pending(node_kind.emphasis, 0, 0);
		const committed = buffer.push_pending(node_kind.strong_emphasis, 5, 0);
		buffer.commit_node(committed);

		// Push enough to trigger grow
		for (let i = 0; i < 8; i++) {
			buffer.push(node_kind.text, i, 0);
		}

		// Pending state should survive
		expect(buffer.get_pending()).toEqual([pending]);
	});

	test('grow should preserve value ranges', () => {
		const buffer = new node_buffer(2);

		const id1 = buffer.push(node_kind.code_span, 0, 0);
		buffer.set_value(id1, 1, 4);

		// Push enough to trigger grow
		for (let i = 0; i < 8; i++) {
			buffer.push(node_kind.text, i, 0);
		}

		expect(buffer.get_node(id1).value).toEqual([1, 4]);
	});

	test('grow should preserve extras', () => {
		const buffer = new node_buffer(2);

		const id1 = buffer.push(node_kind.heading, 0, 0, 3);

		// Push enough to trigger grow
		for (let i = 0; i < 8; i++) {
			buffer.push(node_kind.text, i, 0);
		}

		expect(buffer.get_node(id1).metadata).toEqual({ depth: 3 });
	});

	test('pending nodes can be repaired -- deeply nested', () => {
		const buffer = new node_buffer();
		const id1 = buffer.push_pending(node_kind.emphasis, 0, 0);
		const id2 = buffer.push_pending(node_kind.emphasis, 0, id1);
		const id3 = buffer.push_pending(node_kind.emphasis, 0, id2);
		const id4 = buffer.push_pending(node_kind.emphasis, 0, id3);
		const id5 = buffer.push_pending(node_kind.emphasis, 0, id4);
		const id6 = buffer.push_pending(node_kind.emphasis, 0, id5);
		const id7 = buffer.push_pending(node_kind.emphasis, 0, id6);
		const id8 = buffer.push_pending(node_kind.emphasis, 0, id7);
		expect(buffer.get_node(id2).parent).toEqual(id1);

		buffer.repair();

		expect(buffer.get_node().children).toEqual([
			id1,
			id2,
			id3,
			id4,
			id5,
			id6,
			id7,
			id8,
		]);

		[id1, id2, id3, id4, id5, id6, id7, id8].forEach((id, i, arr) => {
			let next = arr[i + 1] || null;
			let prev = arr[i - 1] || null;

			expect(buffer.get_node(id).kind).toEqual('text');
			expect(buffer.get_node(id).parent).toEqual(0);
			expect(buffer.get_node(id).next).toEqual(next);
			expect(buffer.get_node(id).prev).toEqual(prev);
			expect(buffer.get_node(id).children).toEqual([]);
		});
	});
});
