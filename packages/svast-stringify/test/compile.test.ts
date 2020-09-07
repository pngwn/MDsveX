import { suite } from 'uvu';
import * as assert from 'uvu/assert';

import { Node, Root } from 'svast';
import { compile } from '../src/main';

const svast_stringify = suite('compile-tree');

svast_stringify('throws without a root node root', () => {
	const node = {
		type: 'hi',
	};

	//@ts-ignore
	assert.throws(() => compile(node));
});

svast_stringify('compiles a text node', () => {
	const tree = <Root>{
		type: 'root',
		children: [
			{
				type: 'text',
				value: 'hi',
			},
		],
	};

	assert.is(compile(tree), 'hi');
});

svast_stringify('compiles a text node', () => {
	const tree = <Root>{
		type: 'root',
		children: [
			{
				type: 'svelteExpression',
				value: 'console.log("boo")',
			},
		],
	};

	assert.is(compile(tree), '{console.log("boo")}');
});

svast_stringify('compiles a void block', () => {
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

	assert.is(compile(tree), '{@html `hello i am an expression`}');
});

svast_stringify('compiles a self-closing html element', () => {
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

	assert.is(compile(tree), '<input />');
});

svast_stringify(
	'compiles a self-closing html element with short hand boolean attributes',
	() => {
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

		assert.is(
			compile(tree),
			`<input 
hello
goodbye
/>`
		);
	}
);

svast_stringify(
	'compiles a self-closing html element with props and a value',
	() => {
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

		assert.is(
			compile(tree),
			`<input 
hello="value"
/>`
		);
	}
);

svast_stringify(
	'compiles a self-closing html element with props and values',
	() => {
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

		assert.is(
			compile(tree),
			`<input 
hello="value value"
/>`
		);
	}
);

svast_stringify(
	'compiles a self-closing html element with props and expression values',
	() => {
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
									value: 'value',
								},
								{
									type: 'svelteExpression',
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

		assert.is(
			compile(tree),
			`<input 
hello="value value{value}"
/>`
		);
	}
);

svast_stringify(
	'compiles a self-closing html element with props and expression values, with empty attr text nodes',
	() => {
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
									value: 'value',
								},
								{
									type: 'text',
									value: '',
								},
								{
									type: 'svelteExpression',
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

		assert.is(
			compile(tree),
			`<input 
hello="value value {value}"
/>`
		);
	}
);

svast_stringify(
	'compiles a self-closing html element with props and expression values, with empty attr text nodes',
	() => {
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
									type: 'svelteExpression',
									value: 'value',
								},
								{
									type: 'svelteExpression',
									value: 'value',
								},
								{
									type: 'svelteExpression',
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

		assert.is(
			compile(tree),
			`<input 
hello="value{value}{value}{value}"
/>`
		);
	}
);

// modify svelte-parse to output a text for all space characters that has a value of a single space

svast_stringify('handle a realword set of attrs', () => {
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
								value: '',
							},
							{
								type: 'svelteExpression',
								value: 'color',
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

	assert.is(
		compile(tree),
		`<div 
style='color: {color};'
/>`
	);
});

svast_stringify.run();
