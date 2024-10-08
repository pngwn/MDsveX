import { test, expect } from 'vitest';

import {
	SvelteElement,
	Text,
	SvelteMeta,
	SvelteExpression,
	VoidBlock,
	Comment,
	Root,
	Node,
	Point,
	SvelteDynamicContent,
} from 'svast';

import { parseNode, parse } from '../src/main';

const childParser: () => [Node[], Point & { index?: number }, number] = () => [
	[<Node>{ type: 'fake' }],
	{ line: 1, column: 1, offset: 0, index: 0 },
	0,
];

test('tracks the location of expression nodes', () => {
	//@ts-ignore
	const { parsed } = parseNode({
		generatePositions: true,
		childParser,
		value: `{hail}`,
	});

	expect(parsed).toEqual(<SvelteDynamicContent>{
		type: 'svelteDynamicContent',
		expression: {
			type: 'svelteExpression',
			value: 'hail',
			position: {
				start: { line: 1, column: 2, offset: 1 },
				end: { line: 1, column: 6, offset: 5 },
			},
		},
		position: {
			start: { line: 1, column: 1, offset: 0 },
			end: { line: 1, column: 7, offset: 6 },
		},
	});
});

test('tracks the location of expression nodes in attributes', () => {
	//@ts-ignore
	const { parsed } = parseNode({
		generatePositions: true,
		childParser,
		value: `<input thing={hail} />`,
	});

	expect(parsed).toEqual(<SvelteElement>{
		type: 'svelteElement',
		tagName: 'input',
		properties: [
			{
				type: 'svelteProperty',
				name: 'thing',
				value: [
					{
						type: 'svelteDynamicContent',
						expression: {
							type: 'svelteExpression',
							value: 'hail',
							position: {
								start: { line: 1, column: 15, offset: 14 },
								end: { line: 1, column: 19, offset: 18 },
							},
						},
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

test('tracks the location of multiple expression nodes in attributes', () => {
	//@ts-ignore
	const { parsed } = parseNode({
		generatePositions: true,
		childParser,
		value: `<input thing="{hail} {haip}" />`,
	});

	expect(parsed).toEqual(<SvelteElement>{
		type: 'svelteElement',
		tagName: 'input',
		properties: [
			{
				type: 'svelteProperty',
				name: 'thing',
				value: [
					{
						type: 'svelteDynamicContent',
						expression: {
							type: 'svelteExpression',
							value: 'hail',
							position: {
								start: { line: 1, column: 16, offset: 15 },
								end: { line: 1, column: 20, offset: 19 },
							},
						},
						position: {
							start: { line: 1, column: 15, offset: 14 },
							end: { line: 1, column: 21, offset: 20 },
						},
					},
					{
						type: 'text',
						value: ' ',
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
						type: 'svelteDynamicContent',
						expression: {
							type: 'svelteExpression',
							value: 'haip',
							position: {
								start: { line: 1, column: 23, offset: 22 },
								end: { line: 1, column: 27, offset: 26 },
							},
						},
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
});

test('tracks the location of multiple expression nodes in attributes: extra spaces', () => {
	//@ts-ignore
	const { parsed } = parseNode({
		generatePositions: true,
		childParser,
		value: `<input thing="{hail}   {haip}" />`,
	});

	expect(parsed).toEqual(<SvelteElement>{
		type: 'svelteElement',
		tagName: 'input',
		properties: [
			{
				type: 'svelteProperty',
				name: 'thing',
				value: [
					{
						type: 'svelteDynamicContent',
						expression: {
							type: 'svelteExpression',
							value: 'hail',
							position: {
								start: { line: 1, column: 16, offset: 15 },
								end: { line: 1, column: 20, offset: 19 },
							},
						},
						position: {
							start: { line: 1, column: 15, offset: 14 },
							end: { line: 1, column: 21, offset: 20 },
						},
					},
					{
						type: 'text',
						value: '   ',
						position: {
							start: {
								line: 1,
								column: 21,
								offset: 20,
							},
							end: { line: 1, column: 24, offset: 23 },
						},
					},
					{
						type: 'svelteDynamicContent',
						expression: {
							type: 'svelteExpression',
							value: 'haip',
							position: {
								start: { line: 1, column: 25, offset: 24 },
								end: { line: 1, column: 29, offset: 28 },
							},
						},
						position: {
							start: { line: 1, column: 24, offset: 23 },
							end: { line: 1, column: 30, offset: 29 },
						},
					},
				],
				modifiers: [],
				shorthand: 'none',
				position: {
					start: { line: 1, column: 8, offset: 7 },
					end: { line: 1, column: 31, offset: 30 },
				},
			},
		],
		selfClosing: true,
		children: [],
		position: {
			start: { line: 1, column: 1, offset: 0 },
			end: { line: 1, column: 34, offset: 33 },
		},
	});
});

test('tracks the location of self-closing elements', () => {
	//@ts-ignore
	const { parsed } = parseNode({
		generatePositions: true,
		childParser,
		value: `<svelte:options />`,
	});

	expect(parsed).toEqual(<SvelteMeta>{
		type: 'svelteMeta',
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

test('tracks the location of attributes', () => {
	//@ts-ignore
	const { parsed } = parseNode({
		generatePositions: true,
		childParser,
		value: `<svelte:options tag={null} />`,
	});

	expect(parsed).toEqual(<SvelteMeta>{
		type: 'svelteMeta',
		tagName: 'options',
		properties: [
			{
				type: 'svelteProperty',
				name: 'tag',
				value: [
					{
						type: 'svelteDynamicContent',
						expression: {
							type: 'svelteExpression',
							value: 'null',
							position: {
								start: { line: 1, column: 22, offset: 21 },
								end: { line: 1, column: 26, offset: 25 },
							},
						},
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

test('tracks the location of boolean attributes', () => {
	//@ts-ignore
	const { parsed } = parseNode({
		generatePositions: true,
		childParser,
		value: `<div test/>`,
	});

	expect(parsed).toEqual(<SvelteElement>{
		type: 'svelteElement',
		tagName: 'div',
		properties: [
			{
				type: 'svelteProperty',
				name: 'test',
				value: [],
				shorthand: 'boolean',
				modifiers: [],
				position: {
					start: { line: 1, column: 6, offset: 5 },
					end: { line: 1, column: 10, offset: 9 },
				},
			},
		],
		selfClosing: true,
		children: [],
		position: {
			start: { line: 1, column: 1, offset: 0 },
			end: { line: 1, column: 12, offset: 11 },
		},
	});
});

test('tracks the location of shorthand directives', () => {
	//@ts-ignore
	const { parsed } = parseNode({
		generatePositions: true,
		childParser,
		value: `<div test:boo />`,
	});

	expect(parsed).toEqual(<SvelteElement>{
		type: 'svelteElement',
		tagName: 'div',
		properties: [
			{
				type: 'svelteDirective',
				name: 'test',
				value: [],
				shorthand: 'none',
				specifier: 'boo',
				modifiers: [],
				position: {
					start: { line: 1, column: 6, offset: 5 },
					end: { line: 1, column: 14, offset: 13 },
				},
			},
		],
		selfClosing: true,
		children: [],
		position: {
			start: { line: 1, column: 1, offset: 0 },
			end: { line: 1, column: 17, offset: 16 },
		},
	});
});

test('tracks the location of text nodes', () => {
	//@ts-ignore
	const { parsed } = parseNode({
		generatePositions: true,
		childParser,
		value: `hail`,
	});

	expect(parsed).toEqual(<Text>{
		type: 'text',
		value: 'hail',
		position: {
			start: { line: 1, column: 1, offset: 0 },
			end: { line: 1, column: 5, offset: 4 },
		},
	});
});

test('tracks the location of void blocks', () => {
	//@ts-ignore
	const { parsed } = parseNode({
		generatePositions: true,
		childParser,
		value: `{@html somehtml}`,
	});

	expect(parsed).toEqual(<VoidBlock>{
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

test('tracks the location of branching blocks', () => {
	//@ts-ignore
	const parsed = parse({
		generatePositions: true,
		value: `{#if expression}hi{/if}`,
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
						children: [
							{
								type: 'text',
								value: 'hi',
								position: {
									start: { line: 1, column: 17, offset: 16 },
									end: { line: 1, column: 19, offset: 18 },
								},
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
			},
		],
		position: {
			start: { line: 1, column: 1, offset: 0 },
			end: { line: 1, column: 24, offset: 23 },
		},
	});
});

test('tracks the location of branching blocks', () => {
	//@ts-ignore
	const parsed = parse({
		generatePositions: true,
		value: `{#if expression}hi{:else}hi{/if}`,
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
						children: [
							{
								type: 'text',
								value: 'hi',
								position: {
									start: { line: 1, column: 17, offset: 16 },
									end: { line: 1, column: 19, offset: 18 },
								},
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
					{
						type: 'svelteBranch',
						name: 'else',
						children: [
							{
								type: 'text',
								value: 'hi',
								position: {
									start: { line: 1, column: 26, offset: 25 },
									end: { line: 1, column: 28, offset: 27 },
								},
							},
						],
						expression: {
							type: 'svelteExpression',
							value: '',
						},
						position: {
							start: { line: 1, column: 19, offset: 18 },
							end: { line: 1, column: 28, offset: 27 },
						},
					},
				],
				position: {
					start: { line: 1, column: 1, offset: 0 },
					end: { line: 1, column: 33, offset: 32 },
				},
			},
		],
		position: {
			start: { line: 1, column: 1, offset: 0 },
			end: { line: 1, column: 33, offset: 32 },
		},
	});
});

test('tracks the location of comments', () => {
	//@ts-ignore
	const { parsed } = parseNode({
		generatePositions: true,
		childParser,
		value: `<!-- hello world -->`,
	});

	expect(parsed).toEqual(<Comment>{
		type: 'comment',
		value: ' hello world ',
		position: {
			start: { line: 1, column: 1, offset: 0 },
			end: { line: 1, column: 21, offset: 20 },
		},
	});
});

test('tracks the location of a complex node', () => {
	//@ts-ignore
	const parsed = parse({
		generatePositions: true,
		value: `<script>123</script>
		
<div>
  hello
</div>`,
	});

	expect(parsed).toEqual(<Root>{
		type: 'root',
		children: [
			{
				type: 'svelteScript',
				tagName: 'script',
				properties: [],
				selfClosing: false,
				children: [
					{
						type: 'text',
						value: '123',
						position: {
							start: { line: 1, column: 9, offset: 8 },
							end: { line: 1, column: 12, offset: 11 },
						},
					},
				],
				position: {
					start: { line: 1, column: 1, offset: 0 },
					end: { line: 1, column: 21, offset: 20 },
				},
			},
			{
				type: 'text',
				value: '\n\t\t\n',
				position: {
					start: { line: 1, column: 21, offset: 20 },
					end: { line: 3, column: 1, offset: 24 },
				},
			},
			{
				type: 'svelteElement',
				tagName: 'div',
				properties: [],
				selfClosing: false,
				children: [
					{
						type: 'text',
						value: '\n  hello\n',
						position: {
							start: { line: 3, column: 6, offset: 29 },
							end: { line: 5, column: 1, offset: 38 },
						},
					},
				],
				position: {
					start: { line: 3, column: 1, offset: 24 },
					end: { line: 5, column: 7, offset: 44 },
				},
			},
		],
		position: {
			start: { line: 1, column: 1, offset: 0 },
			end: { line: 5, column: 7, offset: 44 },
		},
	});
});
