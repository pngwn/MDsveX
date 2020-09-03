import { suite } from 'uvu';
import * as assert from 'uvu/assert';

import { SvelteElement, SvelteExpression, Node, Point, Root } from 'svast';

import { parseNode, parse } from '../src/main';

const childParser: () => [Node[], Point & { index?: number }, number] = () => [
	[<Node>{ type: 'fake' }],
	{ line: 1, column: 1, offset: 0, index: 0 },
	0,
];

const expression = suite('parse-expression');

expression('parses a simple expression', () => {
	//@ts-ignore
	const { parsed } = parseNode({
		generatePositions: false,
		childParser,
		value: `{hello}`,
	});

	assert.equal(parsed, <SvelteExpression>{
		type: 'svelteExpression',
		value: 'hello',
	});
});

expression('parses nested braces', () => {
	//@ts-ignore
	const { parsed } = parseNode({
		generatePositions: false,
		childParser,
		value: `{{{{hello}}}}`,
	});

	assert.equal(parsed, <SvelteExpression>{
		type: 'svelteExpression',
		value: '{{{hello}}}',
	});
});

expression('parses nested braces: while ignoring quoted braces: single', () => {
	//@ts-ignore
	const { parsed } = parseNode({
		generatePositions: false,
		childParser,
		value: `{{{{'}'}}}}`,
	});

	assert.equal(parsed, <SvelteExpression>{
		type: 'svelteExpression',
		value: "{{{'}'}}}",
	});
});

expression('handles escaped single-quotes', () => {
	//@ts-ignore
	const { parsed } = parseNode({
		generatePositions: false,
		childParser,
		value: "{{{{'}\\''}}}}",
	});

	assert.equal(parsed, <SvelteExpression>{
		type: 'svelteExpression',
		value: "{{{'}\\''}}}",
	});
});

expression('parses nested braces: while ignoring quoted braces: double', () => {
	//@ts-ignore
	const { parsed } = parseNode({
		generatePositions: false,
		childParser,
		value: `{{{{"}"}}}}`,
	});

	assert.equal(parsed, <SvelteExpression>{
		type: 'svelteExpression',
		value: `{{{"}"}}}`,
	});
});

expression('handles escaped double-quotes', () => {
	//@ts-ignore
	const { parsed } = parseNode({
		generatePositions: false,
		childParser,
		value: '{{{{"}\\""}}}}',
	});

	assert.equal(parsed, <SvelteExpression>{
		type: 'svelteExpression',
		value: '{{{"}\\""}}}',
	});
});

expression(
	'parses nested braces: while ignoring quoted braces: backtick',
	() => {
		//@ts-ignore
		const { parsed } = parseNode({
			generatePositions: false,
			childParser,
			value: '{{{{`}`}}}}',
		});

		assert.equal(parsed, <SvelteExpression>{
			type: 'svelteExpression',
			value: '{{{`}`}}}',
		});
	}
);

expression('handles escaped backticks', () => {
	//@ts-ignore
	const { parsed } = parseNode({
		generatePositions: false,
		childParser,
		value: '{{{{`}\\``}}}}',
	});

	assert.equal(parsed, <SvelteExpression>{
		type: 'svelteExpression',
		value: '{{{`}\\``}}}',
	});
});

expression.skip('parses nested braces: while ignoring regex', () => {
	//@ts-ignore
	const { parsed } = parseNode({
		generatePositions: false,
		childParser,
		value: '{(/}/gi)}',
	});

	assert.equal(parsed, <SvelteExpression>{
		type: 'svelteExpression',
		value: '(/}/gi)',
	});
});

expression.skip('parses nested braces: while ignoring regex', () => {
	//@ts-ignore
	const { parsed } = parseNode({
		generatePositions: false,
		childParser,
		value: `{(/\\/}/gi)}`,
	});

	assert.equal(parsed, <SvelteExpression>{
		type: 'svelteExpression',
		value: `(/\\/}/gi)`,
	});
});

expression('handles quoted slashes', () => {
	//@ts-ignore
	const { parsed } = parseNode({
		generatePositions: false,
		childParser,
		value: '{"/}/gi"}',
	});

	assert.equal(parsed, <SvelteExpression>{
		type: 'svelteExpression',
		value: '"/}/gi"',
	});
});

expression('ignores nested quotes', () => {
	//@ts-ignore
	const { parsed } = parseNode({
		generatePositions: false,
		childParser,
		value: '{{{{`"}`}}}}',
	});

	assert.equal(parsed, <SvelteExpression>{
		type: 'svelteExpression',
		value: '{{{`"}`}}}',
	});
});

expression('parses expressions as attribute values', () => {
	//@ts-ignore
	const { parsed } = parseNode({
		generatePositions: false,
		childParser,
		value: `<input hello={value} />`,
	});

	assert.equal(parsed, <SvelteElement>{
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
						type: 'svelteExpression',
						value: 'value',
					},
				],
				shorthand: 'none',
				modifiers: [],
			},
		],
	});
});

expression('parses expressions as attribute values: more fancy', () => {
	//@ts-ignore
	const { parsed } = parseNode({
		generatePositions: false,
		childParser,
		value: '<input hello={{{{`"}`}}}} />',
	});

	assert.equal(parsed, <SvelteElement>{
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
						type: 'svelteExpression',
						value: '{{{`"}`}}}',
					},
				],
				shorthand: 'none',
				modifiers: [],
			},
		],
	});
});

expression('parses expressions as attribute values: functions', () => {
	//@ts-ignore
	const { parsed } = parseNode({
		generatePositions: false,
		childParser,
		value: '<input hello={() => console.log("hello world")} />',
	});

	assert.equal(parsed, <SvelteElement>{
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
						type: 'svelteExpression',
						value: '() => console.log("hello world")',
					},
				],
				shorthand: 'none',
				modifiers: [],
			},
		],
	});
});

expression('parses expressions as attribute values: more functions', () => {
	//@ts-ignore
	const { parsed } = parseNode({
		generatePositions: false,
		childParser,
		value:
			'<input hello={(e) => val = val.filter(v => v.map(x => x*2)).reduce(absolutelywhat is this i have no idea) * 2735262 + 123.something("hey")} />',
	});

	assert.equal(parsed, <SvelteElement>{
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
						type: 'svelteExpression',
						value:
							'(e) => val = val.filter(v => v.map(x => x*2)).reduce(absolutelywhat is this i have no idea) * 2735262 + 123.something("hey")',
					},
				],
				shorthand: 'none',
				modifiers: [],
			},
		],
	});
});

expression('parses expressions as attribute values in quotes', () => {
	//@ts-ignore
	const { parsed } = parseNode({
		generatePositions: false,
		childParser,
		value: `<input hello="{value}" />`,
	});

	assert.equal(parsed, <SvelteElement>{
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
						type: 'svelteExpression',
						value: 'value',
					},
				],
				shorthand: 'none',
				modifiers: [],
			},
		],
	});
});

expression(
	'parses expressions as attribute values in quotes: many expressions',
	() => {
		//@ts-ignore
		const { parsed } = parseNode({
			generatePositions: false,
			childParser,
			value: `<input hello="{value}{value}" />`,
		});

		assert.equal(parsed, <SvelteElement>{
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
		});
	}
);

expression(
	'parses expressions as attribute values in quotes: many expressions with weird spaces',
	() => {
		//@ts-ignore
		const { parsed } = parseNode({
			generatePositions: false,
			childParser,
			value: `<input hello="   {value}   {value}    " />`,
		});

		assert.equal(parsed, <SvelteElement>{
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
							value: '',
						},
						{
							type: 'svelteExpression',
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
						{
							type: 'text',
							value: '',
						},
					],
					shorthand: 'none',
					modifiers: [],
				},
			],
		});
	}
);

expression(
	'parses complex attribute values: mix of text and expression',
	() => {
		//@ts-ignore
		const parsed = parse({
			generatePositions: false,
			value: `<div style='color: {color};'>{color}</div>`,
		});

		assert.equal(parsed, <Root>{
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
					selfClosing: false,
					children: [
						{
							type: 'svelteExpression',
							value: 'color',
						},
					],
				},
			],
		});
	}
);

expression('parses shorthand attribute expressions', () => {
	//@ts-ignore
	const { parsed } = parseNode({
		generatePositions: false,
		childParser,
		value: `<input {value} />`,
	});

	assert.equal(parsed, <SvelteElement>{
		type: 'svelteElement',
		tagName: 'input',
		selfClosing: true,
		children: [],
		properties: [
			{
				type: 'svelteProperty',
				name: 'value',
				value: [
					{
						type: 'svelteExpression',
						value: 'value',
					},
				],
				shorthand: 'expression',
				modifiers: [],
			},
		],
	});
});

expression('parses many shorthand attribute expressions', () => {
	//@ts-ignore
	const { parsed } = parseNode({
		generatePositions: false,
		childParser,
		value: `<input {value} {value_2} val=123 {value_3} on:click={poo} {value_4} />`,
	});

	assert.equal(parsed, <SvelteElement>{
		type: 'svelteElement',
		tagName: 'input',
		selfClosing: true,
		children: [],
		properties: [
			{
				type: 'svelteProperty',
				name: 'value',
				value: [
					{
						type: 'svelteExpression',
						value: 'value',
					},
				],
				shorthand: 'expression',
				modifiers: [],
			},
			{
				type: 'svelteProperty',
				name: 'value_2',
				value: [
					{
						type: 'svelteExpression',
						value: 'value_2',
					},
				],
				shorthand: 'expression',
				modifiers: [],
			},
			{
				type: 'svelteProperty',
				name: 'val',
				value: [
					{
						type: 'text',
						value: '123',
					},
				],
				shorthand: 'none',
				modifiers: [],
			},
			{
				type: 'svelteProperty',
				name: 'value_3',
				value: [
					{
						type: 'svelteExpression',
						value: 'value_3',
					},
				],
				shorthand: 'expression',
				modifiers: [],
			},
			{
				type: 'svelteDirective',
				name: 'on',
				specifier: 'click',
				value: [
					{
						type: 'svelteExpression',
						value: 'poo',
					},
				],
				shorthand: 'none',
				modifiers: [],
			},
			{
				type: 'svelteProperty',
				name: 'value_4',
				value: [
					{
						type: 'svelteExpression',
						value: 'value_4',
					},
				],
				shorthand: 'expression',
				modifiers: [],
			},
		],
	});
});

expression('parses expressions containing slashes', () => {
	//@ts-ignore
	const parsed = parse({
		generatePositions: false,
		value: `<text x="{barWidth/2}" y="-4" />`,
	});

	assert.equal(parsed, {
		type: 'root',
		children: [
			{
				type: 'svelteElement',
				tagName: 'text',
				properties: [
					{
						type: 'svelteProperty',
						name: 'x',
						value: [
							{
								type: 'svelteExpression',
								value: 'barWidth/2',
							},
						],
						modifiers: [],
						shorthand: 'none',
					},
					{
						type: 'svelteProperty',
						name: 'y',
						value: [
							{
								type: 'text',
								value: '-4',
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
	});
});

expression.run();
