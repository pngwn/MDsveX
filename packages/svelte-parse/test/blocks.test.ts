import { suite } from 'uvu';
import * as assert from 'uvu/assert';

import { VoidBlock, Root } from 'svast';
import { parseNode, parse } from '../src/main';

const block = suite('parse-element');

block('parses a simple void block', () => {
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

block('parses a more complex expression within a voi block', () => {
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

block('parses a simple if block', () => {
	//@ts-ignore
	const parsed = parse({
		childParser: () => [[{ type: 'fake' }], 0],
		value: `{#if condition}hello{/if}`,
	});

	assert.equal(parsed, <Root>{
		type: 'root',
		children: [
			{
				type: 'svelteBranchingBlock',
				name: 'if',
				branches: [
					{
						type: 'svelteBranch',
						name: 'if',
						expression: {
							type: 'svelteExpression',
							value: 'condition',
						},
						children: [{ type: 'text', value: 'hello' }],
					},
				],
			},
		],
	});
});

block.run();
