import { test, expect } from 'vitest';

import { VoidBlock, Root, Node, Point } from 'svast';
import { parseNode, parse } from '../src/main';

const childParser: () => [Node[], Point & { index?: number }, number] = () => [
	[<Node>{ type: 'fake' }],
	{ line: 1, column: 1, offset: 0, index: 0 },
	0,
];

test('parses a simple void block', () => {
	//@ts-ignore
	const { parsed } = parseNode({
		generatePositions: false,
		childParser,
		value: `{@html boo}`,
	});

	expect(parsed).toEqual(<VoidBlock>{
		type: 'svelteVoidBlock',
		name: 'html',
		expression: {
			type: 'svelteExpression',
			value: 'boo',
		},
	});
});

test('parses a more complex expression within a void block', () => {
	//@ts-ignore
	const { parsed } = parseNode({
		generatePositions: false,
		childParser,
		value: `{@html (e) => val = val.filter(v => v.map(x => x*2)).reduce(absolutelywhat is this i have no idea) * 2735262 + 123.something("hey")}`,
	});

	expect(parsed).toEqual(<VoidBlock>{
		type: 'svelteVoidBlock',
		name: 'html',
		expression: {
			type: 'svelteExpression',
			value:
				'(e) => val = val.filter(v => v.map(x => x*2)).reduce(absolutelywhat is this i have no idea) * 2735262 + 123.something("hey")',
		},
	});
});

test('parses a void Element without an expression', () => {
	//@ts-ignore
	const { parsed } = parseNode({
		generatePositions: false,
		childParser,
		value: `{@htmlfoo}`,
	});

	expect(parsed).toEqual(<VoidBlock>{
		type: 'svelteVoidBlock',
		name: 'htmlfoo',
		expression: {
			type: 'svelteExpression',
			value: '',
		},
	});
});

test('parses a simple if block', () => {
	//@ts-ignore
	const parsed = parse({
		generatePositions: false,
		value: `{#if condition}hello{/if}`,
	});

	expect(parsed).toEqual(<Root>{
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

test('parses an if block with an else', () => {
	//@ts-ignore
	const parsed = parse({
		generatePositions: false,
		value: `{#if condition}hello{:else}hello2{/if}`,
	});

	expect(parsed).toEqual(<Root>{
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

test('parses an if block with an if else and else', () => {
	//@ts-ignore
	const parsed = parse({
		generatePositions: false,
		value: `{#if condition}hello{:else if condition2}hello2{:else}hello3{/if}`,
	});

	expect(parsed).toEqual(<Root>{
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

test('parses an if block with many if else branches', () => {
	//@ts-ignore
	const parsed = parse({
		generatePositions: false,
		value: `{#if condition}hello{:else if condition2}hello2{:else if condition2}hello2{:else if condition2}hello2{:else if condition2}hello2{/if}`,
	});

	expect(parsed).toEqual(<Root>{
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

test('parses an await block with all branches', () => {
	//@ts-ignore
	const parsed = parse({
		generatePositions: false,
		value: `{#await somePromise}loading{:then value}{value}{:catch e}{e.value}{/await}`,
	});

	expect(parsed).toEqual(<Root>{
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
						children: [
							{
								type: 'svelteDynamicContent',
								expression: { type: 'svelteExpression', value: 'value' },
							},
						],
					},
					{
						type: 'svelteBranch',
						name: 'catch',
						expression: {
							type: 'svelteExpression',
							value: 'e',
						},
						children: [
							{
								type: 'svelteDynamicContent',
								expression: { type: 'svelteExpression', value: 'e.value' },
							},
						],
					},
				],
			},
		],
	});
});

test('parses an await block with a shorthand `await then` and a catch', () => {
	//@ts-ignore
	const parsed = parse({
		generatePositions: false,
		value: `{#await somePromise then value}{value}{:catch e}{e.value}{/await}`,
	});

	expect(parsed).toEqual(<Root>{
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
						children: [
							{
								type: 'svelteDynamicContent',
								expression: { type: 'svelteExpression', value: 'value' },
							},
						],
					},
					{
						type: 'svelteBranch',
						name: 'catch',
						expression: {
							type: 'svelteExpression',
							value: 'e',
						},
						children: [
							{
								type: 'svelteDynamicContent',
								expression: { type: 'svelteExpression', value: 'e.value' },
							},
						],
					},
				],
			},
		],
	});
});

test('parses an await block with a shorthand `await then` and no catch', () => {
	//@ts-ignore
	const parsed = parse({
		generatePositions: false,
		value: `{#await somePromise then value}{value}{/await}`,
	});

	expect(parsed).toEqual(<Root>{
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
						children: [
							{
								type: 'svelteDynamicContent',
								expression: { type: 'svelteExpression', value: 'value' },
							},
						],
					},
				],
			},
		],
	});
});

test('parses an each block correctly', () => {
	//@ts-ignore
	const parsed = parse({
		generatePositions: false,
		value: `{#each array.filter(1, 2, 3, 4) as {hello: {world}}, index (key(23))}{value}{/each}`,
	});

	expect(parsed).toEqual(<Root>{
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
						children: [
							{
								type: 'svelteDynamicContent',
								expression: { type: 'svelteExpression', value: 'value' },
							},
						],
					},
				],
			},
		],
	});
});

test('parses an if block with a trailing space character', () => {
	const parsed = parse({
		value: `{ #if Data.length <= 0 && !isLoading } 
{ /if }`,
		generatePositions: false,
	});

	expect(parsed).toEqual({
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
							value: 'Data.length <= 0 && !isLoading ',
						},
						children: [
							{
								type: 'text',
								value: ' \n',
							},
						],
					},
				],
			},
		],
	});
});
