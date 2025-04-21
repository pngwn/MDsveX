import { test, expect } from 'vitest';

import { table_without_positions } from './fixtures/table_without_positions';
import { table_output } from './fixtures/table_output';
import { Node, Root } from 'svast';
import { compile } from '../src/main';

test('throws without a root node root', () => {
	const node = {
		type: 'hi',
	};

	//@ts-ignore
	expect(() => compile(node)).toThrow();
});

test('compiles a text node', () => {
	const tree = <Root>{
		type: 'root',
		children: [
			{
				type: 'text',
				value: 'hi',
			},
		],
	};

	expect(compile(tree)).toEqual('hi');
});

test('compiles a expression node', () => {
	const tree = <Root>{
		type: 'root',
		children: [
			{
				type: 'svelteDynamicContent',
				expression: {
					type: 'svelteExpression',
					value: 'console.log("boo")',
				},
			},
		],
	};

	expect(compile(tree)).toEqual('{console.log("boo")}');
});

test('compiles a void block', () => {
	const tree = <Root>{
		type: 'root',
		children: [
			{
				type: 'svelteVoidBlock',
				name: 'html',
				expression: {
					type: 'svelteExpression',
					value: '`hello i am an expression`',
				},
			},
		],
	};

	expect(compile(tree)).toEqual('{@html `hello i am an expression`}');
});

test('compiles a self-closing html element', () => {
	const tree = <Root>{
		type: 'root',
		children: [
			{
				type: 'svelteElement',
				tagName: 'input',
				selfClosing: true,
				children: [],
				properties: [],
			},
		],
	};

	expect(compile(tree)).toEqual('<input />');
});

test('compiles a self-closing html element with short hand boolean attributes', () => {
	const tree = <Root>{
		type: 'root',
		children: [
			{
				type: 'svelteElement',
				tagName: 'input',
				selfClosing: true,
				children: [],
				properties: [
					{
						type: 'svelteProperty',
						name: 'hello',
						value: [],
						shorthand: 'boolean',
						modifiers: [],
					},
					{
						type: 'svelteProperty',
						name: 'goodbye',
						value: [],
						shorthand: 'boolean',
						modifiers: [],
					},
				],
			},
		],
	};

	expect(compile(tree)).toEqual(
		`<input 
hello
goodbye
/>`
	);
});

test('compiles a self-closing html element with props and a value', () => {
	const tree = <Root>{
		type: 'root',
		children: [
			{
				type: 'svelteElement',
				tagName: 'input',
				selfClosing: true,
				children: [],
				properties: [
					{
						type: 'svelteProperty',
						name: 'hello',
						value: [
							{
								type: 'text',
								value: 'value',
							},
						],
						shorthand: 'none',
						modifiers: [],
					},
				],
			},
		],
	};

	expect(compile(tree)).toEqual(
		`<input 
hello="value"
/>`
	);
});

test('compiles a self-closing html element with props and values', () => {
	const tree = <Root>{
		type: 'root',
		children: [
			{
				type: 'svelteElement',
				tagName: 'input',
				selfClosing: true,
				children: [],
				properties: [
					{
						type: 'svelteProperty',
						name: 'hello',
						value: [
							{
								type: 'text',
								value: 'value',
							},
							{ type: 'text', value: ' ' },
							{
								type: 'text',
								value: 'value',
							},
						],
						shorthand: 'none',
						modifiers: [],
					},
				],
			},
		],
	};

	expect(compile(tree)).toEqual(
		`<input 
hello="value value"
/>`
	);
});

test('compiles a self-closing html element with props and expression values', () => {
	const tree = <Root>{
		type: 'root',
		children: [
			{
				type: 'svelteElement',
				tagName: 'input',
				selfClosing: true,
				children: [],
				properties: [
					{
						type: 'svelteProperty',
						name: 'hello',
						value: [
							{
								type: 'text',
								value: 'value',
							},
							{
								type: 'text',
								value: ' ',
							},
							{
								type: 'text',
								value: 'value',
							},
							{
								type: 'svelteDynamicContent',
								expression: {
									type: 'svelteExpression',
									value: 'value',
								},
							},
						],
						shorthand: 'none',
						modifiers: [],
					},
				],
			},
		],
	};

	expect(compile(tree)).toEqual(
		`<input 
hello="value value{value}"
/>`
	);
});

test('compiles a self-closing html element with props and expression values, with empty attr text nodes', () => {
	const tree = <Root>{
		type: 'root',
		children: [
			{
				type: 'svelteElement',
				tagName: 'input',
				selfClosing: true,
				children: [],
				properties: [
					{
						type: 'svelteProperty',
						name: 'hello',
						value: [
							{
								type: 'text',
								value: 'value',
							},
							{
								type: 'text',
								value: ' ',
							},
							{
								type: 'text',
								value: 'value',
							},
							{
								type: 'text',
								value: ' ',
							},
							{
								type: 'svelteDynamicContent',
								expression: {
									type: 'svelteExpression',
									value: 'value',
								},
							},
						],
						shorthand: 'none',
						modifiers: [],
					},
				],
			},
		],
	};

	expect(compile(tree)).toEqual(
		`<input 
hello="value value {value}"
/>`
	);
});

test('compiles a self-closing html element with props and expression values, with empty attr text nodes', () => {
	const tree = <Root>{
		type: 'root',
		children: [
			{
				type: 'svelteElement',
				tagName: 'input',
				selfClosing: true,
				children: [],
				properties: [
					{
						type: 'svelteProperty',
						name: 'hello',
						value: [
							{
								type: 'text',
								value: 'value',
							},
							{
								type: 'svelteDynamicContent',
								expression: {
									type: 'svelteExpression',
									value: 'value',
								},
							},
							{
								type: 'svelteDynamicContent',
								expression: {
									type: 'svelteExpression',
									value: 'value',
								},
							},
							{
								type: 'svelteDynamicContent',
								expression: {
									type: 'svelteExpression',
									value: 'value',
								},
							},
						],
						shorthand: 'none',
						modifiers: [],
					},
				],
			},
		],
	};

	expect(compile(tree)).toEqual(
		`<input 
hello="value{value}{value}{value}"
/>`
	);
});

test('handle a realword set of attrs', () => {
	const tree = <Root>{
		type: 'root',
		children: [
			{
				type: 'svelteElement',
				tagName: 'div',
				properties: [
					{
						type: 'svelteProperty',
						name: 'style',
						value: [
							{
								type: 'text',
								value: 'color:',
							},
							{
								type: 'text',
								value: ' ',
							},
							{
								type: 'svelteDynamicContent',
								expression: {
									type: 'svelteExpression',
									value: 'color',
								},
							},
							{
								type: 'text',
								value: ';',
							},
						],
						modifiers: [],
						shorthand: 'none',
					},
				],
				selfClosing: true,
				children: [],
			},
		],
	};

	expect(compile(tree)).toEqual(
		`<div 
style="color: {color};"
/>`
	);
});

test('handle a realword set of attrs: more whitespace', () => {
	const tree = <Root>{
		type: 'root',
		children: [
			{
				type: 'svelteElement',
				tagName: 'div',
				properties: [
					{
						type: 'svelteProperty',
						name: 'style',
						value: [
							{
								type: 'text',
								value: 'color:',
							},
							{
								type: 'text',
								value: '      			',
							},
							{
								type: 'svelteDynamicContent',
								expression: {
									type: 'svelteExpression',
									value: 'color',
								},
							},
							{
								type: 'text',
								value: ';',
							},
						],
						modifiers: [],
						shorthand: 'none',
					},
				],
				selfClosing: true,
				children: [],
			},
		],
	};

	expect(compile(tree)).toEqual(
		`<div 
style="color:      			{color};"
/>`
	);
});

test('compiles directives', () => {
	const tree = <Root>{
		type: 'root',
		children: [
			{
				type: 'svelteElement',
				tagName: 'input',
				selfClosing: true,
				children: [],
				properties: [
					{
						type: 'svelteDirective',
						name: 'hello',
						specifier: 'world',
						value: [],
						shorthand: 'none',
						modifiers: [],
					},
				],
			},
		],
	};

	expect(compile(tree)).toEqual(
		`<input 
hello:world
/>`
	);
});

test('compiles directive with a value', () => {
	const tree = <Root>{
		type: 'root',
		children: [
			{
				type: 'svelteElement',
				tagName: 'input',
				selfClosing: true,
				children: [],
				properties: [
					{
						type: 'svelteDirective',
						name: 'hello',
						specifier: 'world',
						value: [{ type: 'text', value: 'cheese' }],
						shorthand: 'none',
						modifiers: [],
					},
				],
			},
		],
	};

	expect(compile(tree)).toEqual(
		`<input 
hello:world="cheese"
/>`
	);
});

test('compiles directive with a value', () => {
	const tree = <Root>{
		type: 'root',
		children: [
			{
				type: 'svelteElement',
				tagName: 'input',
				selfClosing: true,
				children: [],
				properties: [
					{
						type: 'svelteDirective',
						name: 'hello',
						specifier: 'world',
						value: [
							{ type: 'text', value: 'cheese' },
							{ type: 'text', value: ' ' },
							{ type: 'text', value: 'strings' },
						],
						shorthand: 'none',
						modifiers: [],
					},
				],
			},
		],
	};

	expect(compile(tree)).toEqual(
		`<input 
hello:world="cheese strings"
/>`
	);
});

test('compiles directive with a value', () => {
	const tree = <Root>{
		type: 'root',
		children: [
			{
				type: 'svelteElement',
				tagName: 'input',
				selfClosing: true,
				children: [],
				properties: [
					{
						type: 'svelteDirective',
						name: 'hello',
						specifier: 'world',
						value: [
							{
								type: 'text',
								value: 'color:',
							},
							{
								type: 'text',
								value: ' ',
							},
							{
								type: 'svelteDynamicContent',
								expression: {
									type: 'svelteExpression',
									value: 'color',
								},
							},
							{
								type: 'text',
								value: ';',
							},
						],
						shorthand: 'none',
						modifiers: [],
					},
				],
			},
		],
	};

	expect(compile(tree)).toEqual(
		`<input 
hello:world="color: {color};"
/>`
	);
});

test('compiles directive with a value', () => {
	const tree = <Root>{
		type: 'root',
		children: [
			{
				type: 'svelteElement',
				tagName: 'input',
				selfClosing: true,
				children: [],
				properties: [
					{
						type: 'svelteDirective',
						name: 'hello',
						specifier: 'world',
						value: [],
						shorthand: 'none',
						modifiers: [
							{ type: 'modifier', value: 'modifierval' },
							{ type: 'modifier', value: 'modifierval2' },
						],
					},
				],
			},
		],
	};

	expect(compile(tree)).toEqual(
		`<input 
hello:world|modifierval|modifierval2
/>`
	);
});

test('compiles svelte meta tags', () => {
	const tree = <Root>{
		type: 'root',
		children: [
			{
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
								},
							},
						],
						shorthand: 'none',
						modifiers: [],
					},
				],
				selfClosing: true,
				children: [],
			},
		],
	};

	expect(compile(tree)).toEqual(
		`<svelte:options 
tag="{null}"
/>`
	);
});

test('compiles sibling nodes', () => {
	const tree = <Root>{
		type: 'root',
		children: [
			{
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
								},
							},
						],
						shorthand: 'none',
						modifiers: [],
					},
				],
				selfClosing: true,
				children: [],
			},
			{ type: 'text', value: '\n\n' },
			{
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
								},
							},
						],
						shorthand: 'none',
						modifiers: [],
					},
				],
				selfClosing: true,
				children: [],
			},
		],
	};

	expect(compile(tree)).toEqual(
		`<svelte:options 
tag="{null}"
/>

<svelte:options 
tag="{null}"
/>`
	);
});

test('compiles child nodes: svelteMeta', () => {
	const tree = <Root>{
		type: 'root',
		children: [
			{
				type: 'svelteMeta',
				tagName: 'self',
				properties: [],
				selfClosing: false,
				children: [
					{ type: 'text', value: '\n\t' },
					{
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
										},
									},
								],
								shorthand: 'none',
								modifiers: [],
							},
						],
						selfClosing: true,
						children: [],
					},
					{ type: 'text', value: '\n\n' },
					{
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
										},
									},
								],
								shorthand: 'none',
								modifiers: [],
							},
						],
						selfClosing: true,
						children: [],
					},
				],
			},
		],
	};

	expect(compile(tree)).toEqual(
		`<svelte:self >
	<svelte:options 
tag="{null}"
/>

<svelte:options 
tag="{null}"
/></svelte:self>`
	);
});

test('compiles child nodes: svelteElement', () => {
	const tree = <Root>{
		type: 'root',
		children: [
			{
				type: 'svelteElement',
				tagName: 'div',
				properties: [],
				selfClosing: false,
				children: [
					{ type: 'text', value: '\n\t' },
					{
						type: 'svelteElement',
						tagName: 'input',
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
										},
									},
								],
								shorthand: 'none',
								modifiers: [],
							},
						],
						selfClosing: true,
						children: [],
					},
					{ type: 'text', value: '\n\n' },
					{
						type: 'svelteElement',
						tagName: 'input',
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
										},
									},
								],
								shorthand: 'none',
								modifiers: [],
							},
						],
						selfClosing: true,
						children: [],
					},
				],
			},
		],
	};

	expect(compile(tree)).toEqual(
		`<div >
	<input 
tag="{null}"
/>

<input 
tag="{null}"
/></div>`
	);
});

test('compiles branching blocks', () => {
	const tree = <Root>{
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
							value: 'x > 10',
						},
						children: [
							{
								type: 'text',
								value: '\n\t',
							},
							{
								type: 'svelteElement',
								tagName: 'p',
								properties: [],
								selfClosing: false,
								children: [
									{
										type: 'text',
										value: 'x is greater than 10',
									},
								],
							},
							{
								type: 'text',
								value: '\n',
							},
						],
					},
					{
						type: 'svelteBranch',
						name: 'else if',
						expression: {
							type: 'svelteExpression',
							value: 'x < 5',
						},
						children: [
							{
								type: 'text',
								value: '\n\t',
							},
							{
								type: 'svelteElement',
								tagName: 'p',
								properties: [],
								selfClosing: false,
								children: [
									{
										type: 'text',
										value: 'x is less than 5',
									},
								],
							},
							{
								type: 'text',
								value: '\n',
							},
						],
					},
				],
			},
		],
	};

	expect(compile(tree)).toEqual(
		`{#if x > 10}
	<p >x is greater than 10</p>
{:else if x < 5}
	<p >x is less than 5</p>
{/if}`
	);
});

test('compiles a big thingy', () => {
	const component = compile(table_without_positions as Root);
	expect(component).toEqual(table_output);
});
