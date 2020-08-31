import { suite } from 'uvu';
import * as assert from 'uvu/assert';

import { SvelteElement, SvelteExpression } from 'svast';

import { parseNode } from '../src/main';

const expression = suite('parse-element');

expression('parses a simple expression', () => {
	//@ts-ignore
	const { parsed } = parseNode({
		generatePositions: false,
		childParser: () => [[{ type: 'fake' }], 0],
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
		childParser: () => [[{ type: 'fake' }], 0],
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
		childParser: () => [[{ type: 'fake' }], 0],
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
		childParser: () => [[{ type: 'fake' }], 0],
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
		childParser: () => [[{ type: 'fake' }], 0],
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
		childParser: () => [[{ type: 'fake' }], 0],
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
			childParser: () => [[{ type: 'fake' }], 0],
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
		childParser: () => [[{ type: 'fake' }], 0],
		value: '{{{{`}\\``}}}}',
	});

	assert.equal(parsed, <SvelteExpression>{
		type: 'svelteExpression',
		value: '{{{`}\\``}}}',
	});
});

expression('parses nested braces: while ignoring regex', () => {
	//@ts-ignore
	const { parsed } = parseNode({
		generatePositions: false,
		childParser: () => [[{ type: 'fake' }], 0],
		value: '{(/}/gi)}',
	});

	assert.equal(parsed, <SvelteExpression>{
		type: 'svelteExpression',
		value: '(/}/gi)',
	});
});

expression('parses nested braces: while ignoring regex', () => {
	//@ts-ignore
	const { parsed } = parseNode({
		generatePositions: false,
		childParser: () => [[{ type: 'fake' }], 0],
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
		childParser: () => [[{ type: 'fake' }], 0],
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
		childParser: () => [[{ type: 'fake' }], 0],
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
		childParser: () => [[{ type: 'fake' }], 0],
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
		childParser: () => [[{ type: 'fake' }], 0],
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
		childParser: () => [[{ type: 'fake' }], 0],
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
		childParser: () => [[{ type: 'fake' }], 0],
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
		childParser: () => [[{ type: 'fake' }], 0],
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
			childParser: () => [[{ type: 'fake' }], 0],
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
			childParser: () => [[{ type: 'fake' }], 0],
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

expression('parses shorthand attribute expressions', () => {
	//@ts-ignore
	const { parsed } = parseNode({
		generatePositions: false,
		childParser: () => [[{ type: 'fake' }], 0],
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
		childParser: () => [[{ type: 'fake' }], 0],
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

expression('tracks the location of expression nodes', () => {
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

expression('tracks the location of expression nodes in attributes', () => {
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

expression.only(
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

expression.run();
