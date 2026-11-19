import { bench, describe } from 'vitest';

class SoANodes {
	constructor(count) {
		this.types = new Uint16Array(count);
		this.starts = new Uint32Array(count);
		this.ends = new Uint32Array(count);
		this.firstChild = new Uint32Array(count);
		this.nextSibling = new Uint32Array(count);
		this.length = 0;
	}

	add(type, start, end, firstChild = 0, nextSibling = 0) {
		const id = this.length++;
		this.types[id] = type;
		this.starts[id] = start;
		this.ends[id] = end;
		this.firstChild[id] = firstChild;
		this.nextSibling[id] = nextSibling;
		return id;
	}

	getType(id) {
		return this.types[id];
	}

	getStart(id) {
		return this.starts[id];
	}
}

class AoONodes {
	constructor() {
		this.nodes = [];
	}

	add(type, start, end, firstChild = 0, nextSibling = 0) {
		const id = this.nodes.length;
		this.nodes.push({ type, start, end, firstChild, nextSibling });
		return id;
	}

	getType(id) {
		return this.nodes[id].type;
	}

	getStart(id) {
		return this.nodes[id].start;
	}
}

const nodeCount = 10000;

describe('Struct-of-arrays vs array-of-objects', () => {
	bench('Struct-of-arrays traversal', () => {
		const nodes = new SoANodes(nodeCount);
		for (let i = 0; i < nodeCount; i++) {
			nodes.add(i % 10, i * 2, i * 2 + 10);
		}
		let sum = 0;
		for (let i = 0; i < nodeCount; i++) {
			sum += nodes.getType(i) + nodes.getStart(i);
		}
		return sum;
	});

	bench('Array-of-objects traversal', () => {
		const nodes = new AoONodes();
		for (let i = 0; i < nodeCount; i++) {
			nodes.add(i % 10, i * 2, i * 2 + 10);
		}
		let sum = 0;
		for (let i = 0; i < nodeCount; i++) {
			sum += nodes.getType(i) + nodes.getStart(i);
		}
		return sum;
	});
});
