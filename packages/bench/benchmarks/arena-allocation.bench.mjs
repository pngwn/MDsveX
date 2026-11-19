import { bench, describe } from 'vitest';

class ArenaAllocator {
	constructor(initialSize = 1000) {
		this.nodes = new Array(initialSize);
		this.nextId = 0;
	}

	allocate(type, value) {
		if (this.nextId >= this.nodes.length) {
			this.nodes.length = this.nodes.length * 2;
		}
		const id = this.nextId++;
		this.nodes[id] = { type, value, id };
		return id;
	}

	get(id) {
		return this.nodes[id];
	}

	reset() {
		this.nextId = 0;
	}
}

class PerNodeAllocator {
	constructor() {
		this.nodes = new Map();
		this.nextId = 0;
	}

	allocate(type, value) {
		const id = this.nextId++;
		const node = { type, value, id };
		this.nodes.set(id, node);
		return id;
	}

	get(id) {
		return this.nodes.get(id);
	}

	reset() {
		this.nodes.clear();
		this.nextId = 0;
	}
}

const allocCount = 5000;

describe('Arena allocation vs per-node allocation', () => {
	bench('Arena allocator reuse', () => {
		const arena = new ArenaAllocator(allocCount);
		for (let i = 0; i < allocCount; i++) {
			const id = arena.allocate(i % 5, `value${i}`);
			arena.get(id);
		}
		arena.reset();
	});

	bench('Per-node allocation', () => {
		const allocator = new PerNodeAllocator();
		for (let i = 0; i < allocCount; i++) {
			const id = allocator.allocate(i % 5, `value${i}`);
			allocator.get(id);
		}
		allocator.reset();
	});
});
