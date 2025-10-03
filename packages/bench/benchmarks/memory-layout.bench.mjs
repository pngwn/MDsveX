import { bench, beforeAll, describe } from 'vitest';

class PackedAST {
	constructor(capacity = 10000) {
		this.nodeTypes = new Uint8Array(capacity);
		this.nodeStarts = new Uint32Array(capacity);
		this.nodeEnds = new Uint32Array(capacity);
		this.nodeData = new Float64Array(capacity);
		this.stringPool = [];
		this.stringRefs = new Uint32Array(capacity);
		this.nextNodeId = 0;
	}

	addNode(type, start, end, stringValue = null, numericValue = 0) {
		const id = this.nextNodeId++;
		this.nodeTypes[id] = type;
		this.nodeStarts[id] = start;
		this.nodeEnds[id] = end;
		this.nodeData[id] = numericValue;

		if (stringValue) {
			let stringId = this.stringPool.indexOf(stringValue);
			if (stringId === -1) {
				stringId = this.stringPool.length;
				this.stringPool.push(stringValue);
			}
			this.stringRefs[id] = stringId;
		}
		return id;
	}

	traverse(visitor) {
		for (let i = 0; i < this.nextNodeId; i++) {
			const stringId = this.stringRefs[i];
			visitor({
				type: this.nodeTypes[i],
				start: this.nodeStarts[i],
				end: this.nodeEnds[i],
				data: this.nodeData[i],
				string:
					stringId < this.stringPool.length ? this.stringPool[stringId] : null,
			});
		}
	}
}

class TraditionalAST {
	constructor() {
		this.nodes = [];
		this.nextId = 0;
	}

	addNode(type, start, end, stringValue = null, numericValue = 0) {
		const node = {
			id: this.nextId++,
			type,
			start,
			end,
			stringValue,
			numericValue,
			metadata: { created: Date.now() },
		};
		this.nodes.push(node);
		return node.id;
	}

	traverse(visitor) {
		for (const node of this.nodes) {
			visitor(node);
		}
	}
}

class SoADataLayout {
	constructor(size) {
		this.types = new Int32Array(size);
		this.starts = new Int32Array(size);
		this.ends = new Int32Array(size);
		this.values = new Float64Array(size);
		this.length = 0;
	}

	add(type, start, end, value) {
		const id = this.length++;
		this.types[id] = type;
		this.starts[id] = start;
		this.ends[id] = end;
		this.values[id] = value;
	}

	processAll() {
		let sum = 0;
		for (let i = 0; i < this.length; i++) {
			sum += this.types[i] + this.starts[i] + this.ends[i] + this.values[i];
		}
		return sum;
	}

	sumByType(targetType) {
		let sum = 0;
		for (let i = 0; i < this.length; i++) {
			if (this.types[i] === targetType) {
				sum += this.starts[i] + this.ends[i];
			}
		}
		return sum;
	}
}

class AoSDataLayout {
	constructor() {
		this.items = [];
	}

	add(type, start, end, value) {
		this.items.push({ type, start, end, value });
	}

	processAll() {
		let sum = 0;
		for (let i = 0; i < this.items.length; i++) {
			const item = this.items[i];
			sum += item.type + item.start + item.end + item.value;
		}
		return sum;
	}

	sumByType(targetType) {
		let sum = 0;
		for (let i = 0; i < this.items.length; i++) {
			const item = this.items[i];
			if (item.type === targetType) {
				sum += item.start + item.end;
			}
		}
		return sum;
	}
}

const nodeCount = 5000;
const cacheSize = 10000;
let soaDataset;
let aosDataset;

beforeAll(() => {
	soaDataset = new SoADataLayout(cacheSize);
	aosDataset = new AoSDataLayout();
	for (let i = 0; i < cacheSize; i++) {
		const type = i % 10;
		const start = i * 2;
		const end = start + 5;
		const value = i * 1.5;
		soaDataset.add(type, start, end, value);
		aosDataset.add(type, start, end, value);
	}
});

describe('AST storage layouts', () => {
	bench('Packed struct-of-arrays AST', () => {
		const ast = new PackedAST(nodeCount);
		for (let i = 0; i < nodeCount; i++) {
			const type = i % 8;
			const string = i % 100 === 0 ? `identifier_${i % 10}` : null;
			ast.addNode(type, i * 10, i * 10 + 5, string, i * 1.5);
		}
		ast.traverse(() => {});
	});

	bench('Object-per-node AST', () => {
		const ast = new TraditionalAST();
		for (let i = 0; i < nodeCount; i++) {
			const type = i % 8;
			const string = i % 100 === 0 ? `identifier_${i % 10}` : null;
			ast.addNode(type, i * 10, i * 10 + 5, string, i * 1.5);
		}
		ast.traverse(() => {});
	});
});

describe('Cache locality operations', () => {
	bench('Struct-of-arrays traversal', () => {
		soaDataset.processAll();
		soaDataset.sumByType(3);
	});

	bench('Array-of-objects traversal', () => {
		aosDataset.processAll();
		aosDataset.sumByType(3);
	});
});
