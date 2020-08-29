import { suite } from 'uvu';
import * as assert from 'uvu/assert';

import {
	SvelteElement,
	SvelteComponent,
	Text,
	SvelteExpression,
	VoidBlock,
} from 'svast';

import { parseNode } from '../src/main';

const block = suite('parse-element');

block('parses a simple expression', () => {
	//@ts-ignore
	const { parsed } = parseNode({
		childParser: () => [[{ type: 'fake' }], 0],
		value: `{@html boo}`,
	});

	assert.equal(parsed, <VoidBlock>{
		type: 'svelteVoidBlock',
		name: 'html',
		expression: {
			type: 'svelteExpression',
			value: 'boo',
		},
	});
});

block('parses a simple expression', () => {
	//@ts-ignore
	const { parsed } = parseNode({
		childParser: () => [[{ type: 'fake' }], 0],
		value: `{@html (e) => val = val.filter(v => v.map(x => x*2)).reduce(absolutelywhat is this i have no idea) * 2735262 + 123.something("hey")}`,
	});

	assert.equal(parsed, <VoidBlock>{
		type: 'svelteVoidBlock',
		name: 'html',
		expression: {
			type: 'svelteExpression',
			value:
				'(e) => val = val.filter(v => v.map(x => x*2)).reduce(absolutelywhat is this i have no idea) * 2735262 + 123.something("hey")',
		},
	});
});

block.run();
