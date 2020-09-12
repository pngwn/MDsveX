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

svast_stringify('compiles a expression node', () => {
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
									value: ' ',
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
								value: ' ',
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
style="color: {color};"
/>`
	);
});

svast_stringify('handle a realword set of attrs: more whitespace', () => {
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
style="color:      			{color};"
/>`
	);
});

svast_stringify('compiles directives', () => {
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

	assert.is(
		compile(tree),
		`<input 
hello:world
/>`
	);
});

svast_stringify('compiles directive with a value', () => {
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

	assert.is(
		compile(tree),
		`<input 
hello:world="cheese"
/>`
	);
});

svast_stringify('compiles directive with a value', () => {
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

	assert.is(
		compile(tree),
		`<input 
hello:world="cheese strings"
/>`
	);
});

svast_stringify('compiles directive with a value', () => {
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
								type: 'svelteExpression',
								value: 'color',
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

	assert.is(
		compile(tree),
		`<input 
hello:world="color: {color};"
/>`
	);
});

svast_stringify('compiles directive with a value', () => {
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

	assert.is(
		compile(tree),
		`<input 
hello:world|modifierval|modifierval2
/>`
	);
});

svast_stringify('compiles svelte meta tags', () => {
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
								type: 'svelteExpression',
								value: 'null',
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

	assert.is(
		compile(tree),
		`<svelte:options 
tag="{null}"
/>`
	);
});

svast_stringify('compiles sibling nodes', () => {
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
								type: 'svelteExpression',
								value: 'null',
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
								type: 'svelteExpression',
								value: 'null',
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

	assert.is(
		compile(tree),
		`<svelte:options 
tag="{null}"
/>

<svelte:options 
tag="{null}"
/>`
	);
});

svast_stringify('compiles child nodes', () => {
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
										type: 'svelteExpression',
										value: 'null',
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
										type: 'svelteExpression',
										value: 'null',
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

	assert.is(
		compile(tree),
		`<svelte:self >
	<svelte:options 
tag="{null}"
/>

<svelte:options 
tag="{null}"
/>
</svelte:self>`
	);
});

svast_stringify('compiles child nodes', () => {
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
										type: 'svelteExpression',
										value: 'null',
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
										type: 'svelteExpression',
										value: 'null',
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

	assert.is(
		compile(tree),
		`<div >
	<input 
tag="{null}"
/>

<input 
tag="{null}"
/>
</div>`
	);
});

svast_stringify.run();
