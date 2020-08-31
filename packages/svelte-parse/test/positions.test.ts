import { suite } from 'uvu';
import * as assert from 'uvu/assert';

import {
	SvelteElement,
	Text,
	SvelteTag,
	SvelteExpression,
	VoidBlock,
	BranchingBlock,
	Comment,
} from 'svast';

import { parseNode } from '../src/main';
import { void_els } from '../src/void_els';

const position = suite('parse-element');

position('tracks the location of expression nodes', () => {
	//@ts-ignore
	const { parsed } = parseNode({
		generatePositions: true,
		childParser: () => [[{ type: 'fake' }], 0],
		value: `{hail}`,
	});

	assert.equal(parsed, <SvelteExpression>{
		type: 'svelteExpression',
		value: 'hail',
		position: {
			start: { line: 1, column: 1, offset: 0 },
			end: { line: 1, column: 7, offset: 6 },
		},
	});
});

position('tracks the location of expression nodes in attributes', () => {
	//@ts-ignore
	const { parsed } = parseNode({
		generatePositions: true,
		childParser: () => [[{ type: 'fake' }], 0],
		value: `<input thing={hail} />`,
	});

	assert.equal(parsed, <SvelteElement>{
		type: 'svelteElement',
		tagName: 'input',
		properties: [
			{
				type: 'svelteProperty',
				name: 'thing',
				value: [
					{
						type: 'svelteExpression',
						value: 'hail',
						position: {
							start: { line: 1, column: 14, offset: 13 },
							end: { line: 1, column: 20, offset: 19 },
						},
					},
				],
				modifiers: [],
				shorthand: 'none',
				position: {
					start: { line: 1, column: 8, offset: 7 },
					end: { line: 1, column: 20, offset: 19 },
				},
			},
		],
		selfClosing: true,
		children: [],
		position: {
			start: { line: 1, column: 1, offset: 0 },
			end: { line: 1, column: 23, offset: 22 },
		},
	});
});

position(
	'tracks the location of multiple expression nodes in attributes',
	() => {
		//@ts-ignore
		const { parsed } = parseNode({
			generatePositions: true,
			childParser: () => [[{ type: 'fake' }], 0],
			value: `<input thing="{hail} {haip}" />`,
		});

		assert.equal(parsed, <SvelteElement>{
			type: 'svelteElement',
			tagName: 'input',
			properties: [
				{
					type: 'svelteProperty',
					name: 'thing',
					value: [
						{
							type: 'svelteExpression',
							value: 'hail',
							position: {
								start: { line: 1, column: 15, offset: 14 },
								end: { line: 1, column: 21, offset: 20 },
							},
						},
						{
							type: 'text',
							value: '',
							position: {
								start: {
									line: 1,
									column: 21,
									offset: 20,
								},
								end: { line: 1, column: 22, offset: 21 },
							},
						},
						{
							type: 'svelteExpression',
							value: 'haip',
							position: {
								start: { line: 1, column: 22, offset: 21 },
								end: { line: 1, column: 28, offset: 27 },
							},
						},
					],
					modifiers: [],
					shorthand: 'none',
					position: {
						start: { line: 1, column: 8, offset: 7 },
						end: { line: 1, column: 29, offset: 28 },
					},
				},
			],
			selfClosing: true,
			children: [],
			position: {
				start: { line: 1, column: 1, offset: 0 },
				end: { line: 1, column: 32, offset: 31 },
			},
		});
	}
);

position('tracks the location of self-closing elements', () => {
	//@ts-ignore
	const { parsed } = parseNode({
		generatePositions: true,
		childParser: () => [[{ type: 'fake' }], 0],
		value: `<svelte:options />`,
	});

	assert.equal(parsed, <SvelteTag>{
		type: 'svelteTag',
		tagName: 'options',
		properties: [],
		selfClosing: true,
		children: [],
		position: {
			start: { line: 1, column: 1, offset: 0 },
			end: { line: 1, column: 19, offset: 18 },
		},
	});
});

position('tracks the location of attributes', () => {
	//@ts-ignore
	const { parsed } = parseNode({
		generatePositions: true,
		childParser: () => [[{ type: 'fake' }], 0],
		value: `<svelte:options tag={null} />`,
	});

	assert.equal(parsed, <SvelteTag>{
		type: 'svelteTag',
		tagName: 'options',
		properties: [
			{
				type: 'svelteProperty',
				name: 'tag',
				value: [
					{
						type: 'svelteExpression',
						value: 'null',
						position: {
							start: { line: 1, column: 21, offset: 20 },
							end: { line: 1, column: 27, offset: 26 },
						},
					},
				],
				shorthand: 'none',
				modifiers: [],
				position: {
					start: { line: 1, column: 17, offset: 16 },
					end: { line: 1, column: 27, offset: 26 },
				},
			},
		],
		selfClosing: true,
		children: [],
		position: {
			start: { line: 1, column: 1, offset: 0 },
			end: { line: 1, column: 30, offset: 29 },
		},
	});
});

position('tracks the location of text nodes', () => {
	//@ts-ignore
	const { parsed } = parseNode({
		generatePositions: true,
		childParser: () => [[{ type: 'fake' }], 0],
		value: `hail`,
	});

	assert.equal(parsed, <Text>{
		type: 'text',
		value: 'hail',
		position: {
			start: { line: 1, column: 1, offset: 0 },
			end: { line: 1, column: 5, offset: 4 },
		},
	});
});

position('tracks the location of void blocks', () => {
	//@ts-ignore
	const { parsed } = parseNode({
		generatePositions: true,
		childParser: () => [[{ type: 'fake' }], 0],
		value: `{@html somehtml}`,
	});

	assert.equal(parsed, <VoidBlock>{
		type: 'svelteVoidBlock',
		name: 'html',
		expression: {
			type: 'svelteExpression',
			value: 'somehtml',
			position: {
				start: { line: 1, column: 8, offset: 7 },
				end: { line: 1, column: 16, offset: 15 },
			},
		},
		position: {
			start: { line: 1, column: 1, offset: 0 },
			end: { line: 1, column: 17, offset: 16 },
		},
	});
});

position('tracks the location of branching blocks', () => {
	//@ts-ignore
	const { parsed } = parseNode({
		generatePositions: true,
		childParser: () => [[{ type: 'fake' }], 0],
		value: `{#if expression}hi{/if}`,
	});

	assert.equal(parsed, <BranchingBlock>{
		type: 'svelteBranchingBlock',
		name: 'if',
		branches: [
			{
				type: 'svelteBranch',
				name: 'if',
				children: [
					{
						type: 'fake',
					},
				],
				expression: {
					type: 'svelteExpression',
					value: 'expression',
					position: {
						start: { line: 1, column: 6, offset: 5 },
						end: { line: 1, column: 16, offset: 15 },
					},
				},
				position: {
					start: { line: 1, column: 1, offset: 0 },
					end: { line: 1, column: 19, offset: 18 },
				},
			},
		],
		position: {
			start: { line: 1, column: 1, offset: 0 },
			end: { line: 1, column: 24, offset: 23 },
		},
	});
});

position('tracks the location of branching blocks', () => {
	//@ts-ignore
	const { parsed } = parseNode({
		generatePositions: true,
		childParser: () => [[{ type: 'fake' }], 0],
		value: `{#if expression}{:else}{/if}`,
	});

	assert.equal(parsed, <BranchingBlock>{
		type: 'svelteBranchingBlock',
		name: 'if',
		branches: [
			{
				type: 'svelteBranch',
				name: 'if',
				children: [
					{
						type: 'fake',
					},
				],
				expression: {
					type: 'svelteExpression',
					value: 'expression',
					position: {
						start: { line: 1, column: 6, offset: 5 },
						end: { line: 1, column: 16, offset: 15 },
					},
				},
				position: {
					start: { line: 1, column: 1, offset: 0 },
					end: { line: 1, column: 17, offset: 16 },
				},
			},
			{
				type: 'svelteBranch',
				name: 'else',
				children: [
					{
						type: 'fake',
					},
				],
				expression: {
					type: 'svelteExpression',
					value: '',
				},
				position: {
					start: { line: 1, column: 17, offset: 16 },
					end: { line: 1, column: 24, offset: 23 },
				},
			},
		],
		position: {
			start: { line: 1, column: 1, offset: 0 },
			end: { line: 1, column: 29, offset: 28 },
		},
	});
});

position('tracks the location of branching blocks', () => {
	//@ts-ignore
	const { parsed } = parseNode({
		generatePositions: true,
		childParser: () => [[{ type: 'fake' }], 0],
		value: `<!-- hello world -->`,
	});

	assert.equal(parsed, <Comment>{
		type: 'comment',
		value: ' hello world ',
		position: {
			start: { line: 1, column: 1, offset: 0 },
			end: { line: 1, column: 21, offset: 20 },
		},
	});
});

position.run();
