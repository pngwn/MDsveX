import { suite } from 'uvu';
import * as assert from 'uvu/assert';

import { VoidBlock, Root } from 'svast';
import { parseNode, parse } from '../src/main';

const block = suite('parse-element');

block('parses a simple void block', () => {
	//@ts-ignore
	const { parsed } = parseNode({
		generatePositions: false,
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
		generatePositions: false,
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
		generatePositions: false,
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

block('parses an if block with an else', () => {
	//@ts-ignore
	const parsed = parse({
		generatePositions: false,
		childParser: () => [[{ type: 'fake' }], 0],
		value: `{#if condition}hello{:else}hello2{/if}`,
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
					{
						type: 'svelteBranch',
						name: 'else',
						expression: {
							type: 'svelteExpression',
							value: '',
						},
						children: [{ type: 'text', value: 'hello2' }],
					},
				],
			},
		],
	});
});

block('parses an if block with an if else and else', () => {
	//@ts-ignore
	const parsed = parse({
		generatePositions: false,
		childParser: () => [[{ type: 'fake' }], 0],
		value: `{#if condition}hello{:else if condition2}hello2{:else}hello3{/if}`,
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
					{
						type: 'svelteBranch',
						name: 'else if',
						expression: {
							type: 'svelteExpression',
							value: 'condition2',
						},
						children: [{ type: 'text', value: 'hello2' }],
					},
					{
						type: 'svelteBranch',
						name: 'else',
						expression: {
							type: 'svelteExpression',
							value: '',
						},
						children: [{ type: 'text', value: 'hello3' }],
					},
				],
			},
		],
	});
});

block('parses an if block with many if else branches', () => {
	//@ts-ignore
	const parsed = parse({
		generatePositions: false,
		childParser: () => [[{ type: 'fake' }], 0],
		value: `{#if condition}hello{:else if condition2}hello2{:else if condition2}hello2{:else if condition2}hello2{:else if condition2}hello2{/if}`,
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
					{
						type: 'svelteBranch',
						name: 'else if',
						expression: {
							type: 'svelteExpression',
							value: 'condition2',
						},
						children: [{ type: 'text', value: 'hello2' }],
					},
					{
						type: 'svelteBranch',
						name: 'else if',
						expression: {
							type: 'svelteExpression',
							value: 'condition2',
						},
						children: [{ type: 'text', value: 'hello2' }],
					},
					{
						type: 'svelteBranch',
						name: 'else if',
						expression: {
							type: 'svelteExpression',
							value: 'condition2',
						},
						children: [{ type: 'text', value: 'hello2' }],
					},
					{
						type: 'svelteBranch',
						name: 'else if',
						expression: {
							type: 'svelteExpression',
							value: 'condition2',
						},
						children: [{ type: 'text', value: 'hello2' }],
					},
				],
			},
		],
	});
});

block('parses an await block with all branches', () => {
	//@ts-ignore
	const parsed = parse({
		generatePositions: false,
		childParser: () => [[{ type: 'fake' }], 0],
		value: `{#await somePromise}loading{:then value}{value}{:catch e}{e.value}{/await}`,
	});

	assert.equal(parsed, <Root>{
		type: 'root',
		children: [
			{
				type: 'svelteBranchingBlock',
				name: 'await',
				branches: [
					{
						type: 'svelteBranch',
						name: 'await',
						expression: {
							type: 'svelteExpression',
							value: 'somePromise',
						},
						children: [{ type: 'text', value: 'loading' }],
					},
					{
						type: 'svelteBranch',
						name: 'then',
						expression: {
							type: 'svelteExpression',
							value: 'value',
						},
						children: [{ type: 'svelteExpression', value: 'value' }],
					},
					{
						type: 'svelteBranch',
						name: 'catch',
						expression: {
							type: 'svelteExpression',
							value: 'e',
						},
						children: [{ type: 'svelteExpression', value: 'e.value' }],
					},
				],
			},
		],
	});
});

block('parses an await block with a shorthand `await then` and a catch', () => {
	//@ts-ignore
	const parsed = parse({
		generatePositions: false,
		childParser: () => [[{ type: 'fake' }], 0],
		value: `{#await somePromise then value}{value}{:catch e}{e.value}{/await}`,
	});

	assert.equal(parsed, <Root>{
		type: 'root',
		children: [
			{
				type: 'svelteBranchingBlock',
				name: 'await',
				branches: [
					{
						type: 'svelteBranch',
						name: 'await',
						expression: {
							type: 'svelteExpression',
							value: 'somePromise then value',
						},
						children: [{ type: 'svelteExpression', value: 'value' }],
					},
					{
						type: 'svelteBranch',
						name: 'catch',
						expression: {
							type: 'svelteExpression',
							value: 'e',
						},
						children: [{ type: 'svelteExpression', value: 'e.value' }],
					},
				],
			},
		],
	});
});

block(
	'parses an await block with a shorthand `await then` and no catch',
	() => {
		//@ts-ignore
		const parsed = parse({
			generatePositions: false,
			childParser: () => [[{ type: 'fake' }], 0],
			value: `{#await somePromise then value}{value}{/await}`,
		});

		assert.equal(parsed, <Root>{
			type: 'root',
			children: [
				{
					type: 'svelteBranchingBlock',
					name: 'await',
					branches: [
						{
							type: 'svelteBranch',
							name: 'await',
							expression: {
								type: 'svelteExpression',
								value: 'somePromise then value',
							},
							children: [{ type: 'svelteExpression', value: 'value' }],
						},
					],
				},
			],
		});
	}
);

block('parses an each block correctly', () => {
	//@ts-ignore
	const parsed = parse({
		generatePositions: false,
		childParser: () => [[{ type: 'fake' }], 0],
		value: `{#each array.filter(1, 2, 3, 4) as {hello: {world}}, index (key(23))}{value}{/each}`,
	});

	assert.equal(parsed, <Root>{
		type: 'root',
		children: [
			{
				type: 'svelteBranchingBlock',
				name: 'each',
				branches: [
					{
						type: 'svelteBranch',
						name: 'each',
						expression: {
							type: 'svelteExpression',
							value:
								'array.filter(1, 2, 3, 4) as {hello: {world}}, index (key(23))',
						},
						children: [{ type: 'svelteExpression', value: 'value' }],
					},
				],
			},
		],
	});
});

block.run();
