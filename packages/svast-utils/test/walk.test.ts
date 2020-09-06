import { suite } from 'uvu';
import * as assert from 'uvu/assert';

import { Node } from 'svast';
import { walk } from '../src/walk';
const svast_walk = suite('walk-tree');

svast_walk('walks a single node', () => {
	const node = {
		type: 'hi',
	};

	let _t;
	let _n;
	walk(node, (node, parent) => {
		_t = node.type;
		_n = node;
	});

	assert.is(_t, 'hi');
	assert.is(_n, node);
});

svast_walk('Root node should have an undefined parent', () => {
	const node = {
		type: 'hi',
	};

	let _p;
	walk(node, (_, parent) => {
		_p = parent;
	});

	assert.is(_p, undefined);
});

svast_walk('Root node should walk child nodes', () => {
	const tree = {
		type: 'hi',
		children: [
			{
				type: '1',
			},
			{
				type: '2',
			},
			{
				type: '3',
			},
			{
				type: '4',
			},
			{
				type: '5',
			},
		],
	};

	const _t: string[] = [];
	walk(tree, (node, parent) => {
		_t.push(node.type);
	});

	assert.equal(_t, ['hi', '1', '2', '3', '4', '5']);
});

svast_walk.run();
