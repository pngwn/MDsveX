import { suite } from 'uvu';
import * as assert from 'uvu/assert';

import {
	SvelteElement,
	SvelteComponent,
	Text,
	SvelteMeta,
	Comment,
	Node,
	Point,
} from 'svast';

import { parseNode, parse } from '../src/main';
import { void_els } from '../src/void_els';

const childParser: () => [Node[], Point & { index?: number }, number] = () => [
	[<Node>{ type: 'fake' }],
	{ line: 1, column: 1, offset: 0, index: 0 },
	0,
];

const element = suite('parse-element');

element('parses a self closing tag without attributes', () => {
	//@ts-ignore
	const { parsed } = parseNode({
		generatePositions: false,
		childParser,
		value: `<input />`,
	});

	assert.equal(parsed, <SvelteElement>{
		type: 'svelteElement',
		tagName: 'input',
		selfClosing: true,
		children: [],
		properties: [],
	});
});

element(
	'parses self closing elements with no whistespace after tagName',
	() => {
		//@ts-ignore
		const { parsed } = parseNode({
			generatePositions: false,
			childParser,
			value: `<div/>`,
		});

		assert.equal(parsed, <SvelteElement>{
			type: 'svelteElement',
			tagName: 'div',
			selfClosing: true,
			children: [],
			properties: [],
		});
	}
);

element(
	'parses a self closing tag without attributes: space before name',
	() => {
		//@ts-ignore
		const { parsed } = parseNode({
			generatePositions: false,
			childParser,
			value: `<       input />`,
		});

		assert.equal(parsed, <SvelteElement>{
			type: 'svelteElement',
			tagName: 'input',
			selfClosing: true,
			children: [],
			properties: [],
		});
	}
);

element(
	'parses a self closing tag without attributes: space after name',
	() => {
		//@ts-ignore
		const { parsed } = parseNode({
			generatePositions: false,
			childParser,
			value: `<       input       />`,
		});

		assert.equal(parsed, <SvelteElement>{
			type: 'svelteElement',
			tagName: 'input',
			selfClosing: true,
			children: [],
			properties: [],
		});
	}
);

element(
	'parses a self closing tag without attributes: space after closeing slash',
	() => {
		//@ts-ignore
		const { parsed } = parseNode({
			generatePositions: false,
			childParser,
			value: `<       input       /                >`,
		});

		assert.equal(parsed, <SvelteElement>{
			type: 'svelteElement',
			tagName: 'input',
			selfClosing: true,
			children: [],
			properties: [],
		});
	}
);

element('parses a self closing component without attributes', () => {
	//@ts-ignore
	const { parsed } = parseNode({
		generatePositions: false,
		childParser,
		value: `<HelloFriend />`,
	});

	assert.equal(parsed, <SvelteComponent>{
		type: 'svelteComponent',
		tagName: 'HelloFriend',
		selfClosing: true,
		children: [],
		properties: [],
	});
});

Object.keys(void_els).forEach((el) => {
	element(`parses all void tags without attributes: < ${el} >`, () => {
		//@ts-ignore
		const { parsed } = parseNode({
			generatePositions: false,
			childParser,
			value: `<${el} >`,
		});

		assert.equal(parsed, <SvelteElement>{
			type: 'svelteElement',
			tagName: el,
			selfClosing: true,
			children: [],
			properties: [],
		});
	});
});

element('parses attribute values containing colons', () => {
	//@ts-ignore
	const { parsed } = parseNode({
		generatePositions: false,
		childParser,
		value: `<a href=https://www.google.com />`,
	});

	assert.equal(parsed, {
		type: 'svelteElement',
		tagName: 'a',
		selfClosing: true,
		children: [],
		properties: [
			{
				type: 'svelteProperty',
				name: 'href',
				value: [
					{
						type: 'text',
						value: 'https://www.google.com',
					},
				],
				modifiers: [],
				shorthand: 'none',
			},
		],
	});
});

element('parses a self closing tag with shorthand boolean attribute', () => {
	//@ts-ignore
	const { parsed } = parseNode({
		generatePositions: false,
		childParser,
		value: `<input hello />`,
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
				value: [],
				shorthand: 'boolean',
				modifiers: [],
			},
		],
	});
});

element(
	'parses a self closing tag with shorthand boolean attribute: weird spacing',
	() => {
		//@ts-ignore
		const { parsed } = parseNode({
			generatePositions: false,
			childParser,
			value: `<input         hello         /        >`,
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
					value: [],
					shorthand: 'boolean',
					modifiers: [],
				},
			],
		});
	}
);

element(
	'parses a self closing tag with shorthand boolean attribute: no trailing space',
	() => {
		//@ts-ignore
		const { parsed } = parseNode({
			generatePositions: false,
			childParser,
			value: `<input hello/>`,
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
					value: [],
					shorthand: 'boolean',
					modifiers: [],
				},
			],
		});
	}
);

element(
	'parses a void tag with shorthand boolean attribute: no trailing space',
	() => {
		//@ts-ignore
		const { parsed } = parseNode({
			generatePositions: false,
			childParser,
			value: `<input hello>`,
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
					value: [],
					shorthand: 'boolean',
					modifiers: [],
				},
			],
		});
	}
);

element(
	'parses a self-closing tag with multiple shorthand boolean attributes: trailing space',
	() => {
		//@ts-ignore
		const { parsed } = parseNode({
			generatePositions: false,
			childParser,
			value: `<input hello goodbye />`,
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
		});
	}
);

element(
	'parses a self-closing tag with multiple shorthand boolean attributes: weird spacing',
	() => {
		//@ts-ignore
		const { parsed } = parseNode({
			generatePositions: false,
			childParser,
			value: `<         input         hello           goodbye       /           >`,
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
		});
	}
);

element(
	'parses a self-closing tag with multiple shorthand boolean attributes: no trailing space',
	() => {
		//@ts-ignore
		const { parsed } = parseNode({
			generatePositions: false,
			childParser,
			value: `<input hello goodbye/>`,
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
		});
	}
);

element(
	'parses a void tag with multiple shorthand boolean attributes: no trailing space',
	() => {
		//@ts-ignore
		const { parsed } = parseNode({
			generatePositions: false,
			childParser,
			value: `<input hello goodbye>`,
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
		});
	}
);

element(
	'parses a void tag with multiple shorthand boolean attributes: trailing space',
	() => {
		//@ts-ignore
		const { parsed } = parseNode({
			generatePositions: false,
			childParser,
			value: `<input hello goodbye >`,
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
		});
	}
);

element(
	'parses a self-closing tag with an unquoted attribute: trailing space',
	() => {
		//@ts-ignore
		const { parsed } = parseNode({
			generatePositions: false,
			childParser,
			value: `<input hello=value />`,
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

element(
	'parses a self-closing tag with an unquoted attribute: no trailing space',
	() => {
		//@ts-ignore
		const { parsed } = parseNode({
			generatePositions: false,
			childParser,
			value: `<input hello=value/>`,
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

element('parses a void tag with an unquoted attribute: trailing space', () => {
	//@ts-ignore
	const { parsed } = parseNode({
		generatePositions: false,
		childParser,
		value: `<input hello=value >`,
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
						value: 'value',
					},
				],
				shorthand: 'none',
				modifiers: [],
			},
		],
	});
});

element(
	'parses a self-closing tag with an unquoted attribute: no trailing space',
	() => {
		//@ts-ignore
		const { parsed } = parseNode({
			generatePositions: false,
			childParser,
			value: `<input hello=value>`,
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

element(
	'parses a self-closing tag with a double-quoted attribute: trailing space',
	() => {
		//@ts-ignore
		const { parsed } = parseNode({
			generatePositions: false,
			childParser,
			value: `<input hello="value" />`,
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

element(
	'parses a self-closing tag with a double-quoted attribute: no trailing space',
	() => {
		//@ts-ignore
		const { parsed } = parseNode({
			generatePositions: false,
			childParser,
			value: `<input hello="value"/>`,
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

element(
	'parses a void tag with a double-quoted attribute: trailing space',
	() => {
		//@ts-ignore
		const { parsed } = parseNode({
			generatePositions: false,
			childParser,
			value: `<input hello="value" >`,
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

element(
	'parses a void tag with a double-quoted attribute: no trailing space',
	() => {
		//@ts-ignore
		const { parsed } = parseNode({
			generatePositions: false,
			childParser,
			value: `<input hello="value">`,
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

element(
	'parses a self-closing tag with double-quoted attributes: many values, trailing whitespace',
	() => {
		//@ts-ignore
		const { parsed } = parseNode({
			generatePositions: false,
			childParser,
			value: `<input hello="value valuetwo" />`,
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
							value: 'value',
						},
						{
							type: 'text',
							value: ' ',
						},
						{
							type: 'text',
							value: 'valuetwo',
						},
					],
					shorthand: 'none',
					modifiers: [],
				},
			],
		});
	}
);

element(
	'parses a self-closing tag with double-quoted attributes: many values, no trailing whitespace',
	() => {
		//@ts-ignore
		const { parsed } = parseNode({
			generatePositions: false,
			childParser,
			value: `<input hello="value valuetwo"/>`,
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
							value: 'value',
						},
						{ type: 'text', value: ' ' },
						{
							type: 'text',
							value: 'valuetwo',
						},
					],
					shorthand: 'none',
					modifiers: [],
				},
			],
		});
	}
);

element(
	'parses a void tag with double-quoted attributes: many values, trailing whitespace',
	() => {
		//@ts-ignore
		const { parsed } = parseNode({
			generatePositions: false,
			childParser,
			value: `<input hello="value valuetwo" >`,
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
							value: 'value',
						},
						{ type: 'text', value: ' ' },
						{
							type: 'text',
							value: 'valuetwo',
						},
					],
					shorthand: 'none',
					modifiers: [],
				},
			],
		});
	}
);

element(
	'parses a void tag with double-quoted attributes: many values, no trailing whitespace',
	() => {
		//@ts-ignore
		const { parsed } = parseNode({
			generatePositions: false,
			childParser,
			value: `<input hello="value valuetwo">`,
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
							value: 'value',
						},
						{ type: 'text', value: ' ' },
						{
							type: 'text',
							value: 'valuetwo',
						},
					],
					shorthand: 'none',
					modifiers: [],
				},
			],
		});
	}
);

element(
	'parses a self-closing tag with a single-quoted attribute: trailing space',
	() => {
		//@ts-ignore
		const { parsed } = parseNode({
			generatePositions: false,
			childParser,
			value: `<input hello='value' />`,
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

element(
	'parses a self-closing tag with a single-quoted attribute: no trailing space',
	() => {
		//@ts-ignore
		const { parsed } = parseNode({
			generatePositions: false,
			childParser,
			value: `<input hello='value'/>`,
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

element(
	'parses a void tag with a single-quoted attribute: trailing space',
	() => {
		//@ts-ignore
		const { parsed } = parseNode({
			generatePositions: false,
			childParser,
			value: `<input hello='value' >`,
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

element(
	'parses a void tag with a single-quoted attribute: no trailing space',
	() => {
		//@ts-ignore
		const { parsed } = parseNode({
			generatePositions: false,
			childParser,
			value: `<input hello='value'>`,
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

element(
	'parses a self-closing tag with single-quoted attributes: many values, trailing whitespace',
	() => {
		//@ts-ignore
		const { parsed } = parseNode({
			generatePositions: false,
			childParser,
			value: `<input hello='value valuetwo' />`,
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
							value: 'value',
						},
						{ type: 'text', value: ' ' },
						{
							type: 'text',
							value: 'valuetwo',
						},
					],
					shorthand: 'none',
					modifiers: [],
				},
			],
		});
	}
);

element(
	'parses a self-closing tag with single-quoted attributes: many values, no trailing whitespace',
	() => {
		//@ts-ignore
		const { parsed } = parseNode({
			generatePositions: false,
			childParser,
			value: `<input hello='value valuetwo'/>`,
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
							value: 'value',
						},
						{ type: 'text', value: ' ' },
						{
							type: 'text',
							value: 'valuetwo',
						},
					],
					shorthand: 'none',
					modifiers: [],
				},
			],
		});
	}
);

element(
	'parses a void tag with single-quoted attributes: many values, trailing whitespace',
	() => {
		//@ts-ignore
		const { parsed } = parseNode({
			generatePositions: false,
			childParser,
			value: `<input hello='value valuetwo' >`,
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
							value: 'value',
						},
						{ type: 'text', value: ' ' },
						{
							type: 'text',
							value: 'valuetwo',
						},
					],
					shorthand: 'none',
					modifiers: [],
				},
			],
		});
	}
);

element(
	'parses a void tag with single-quoted attributes: many values, no trailing whitespace',
	() => {
		//@ts-ignore
		const { parsed } = parseNode({
			generatePositions: false,
			childParser,
			value: `<input hello='value valuetwo'>`,
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
							value: 'value',
						},
						{ type: 'text', value: ' ' },
						{
							type: 'text',
							value: 'valuetwo',
						},
					],
					shorthand: 'none',
					modifiers: [],
				},
			],
		});
	}
);

element('parses a void tag with a directive', () => {
	//@ts-ignore
	const { parsed } = parseNode({
		generatePositions: false,
		childParser,
		value: `<input hello:world >`,
	});

	assert.equal(parsed, <SvelteElement>{
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
	});
});

element('parses a self-closing tag with a directive', () => {
	//@ts-ignore
	const { parsed } = parseNode({
		generatePositions: false,
		childParser,
		value: `<input hello:world />`,
	});

	assert.equal(parsed, <SvelteElement>{
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
	});
});

element('parses a self-closing tag with two directives', () => {
	//@ts-ignore
	const { parsed } = parseNode({
		generatePositions: false,
		childParser,
		value: `<input hello:world goodbye:friends />`,
	});

	assert.equal(parsed, <SvelteElement>{
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
			{
				type: 'svelteDirective',
				name: 'goodbye',
				specifier: 'friends',
				value: [],
				shorthand: 'none',
				modifiers: [],
			},
		],
	});
});

element(
	'parses a tag with a directive an a directive value: double-quoted',
	() => {
		//@ts-ignore
		const { parsed } = parseNode({
			generatePositions: false,
			childParser,
			value: `<input hello:world="cheese" />`,
		});

		assert.equal(parsed, <SvelteElement>{
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
		});
	}
);

element(
	'parses a tag with a directive an a directive value: double-quoted, two values',
	() => {
		//@ts-ignore
		const { parsed } = parseNode({
			generatePositions: false,
			childParser,
			value: `<input hello:world="cheese strings" />`,
		});

		assert.equal(parsed, <SvelteElement>{
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
		});
	}
);

element(
	'parses a tag with a directive an a directive value: single-quoted, two values',
	() => {
		//@ts-ignore
		const { parsed } = parseNode({
			generatePositions: false,
			childParser,
			value: `<input hello:world='cheese strings' />`,
		});

		assert.equal(parsed, <SvelteElement>{
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
		});
	}
);

element(
	'parses a tag with a directive an a directive value: single-quoted, two values, many spaces',
	() => {
		//@ts-ignore
		const { parsed } = parseNode({
			generatePositions: false,
			childParser,
			value: `<input hello:world='cheese      strings' />`,
		});

		assert.equal(parsed, <SvelteElement>{
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
						{ type: 'text', value: '      ' },
						{ type: 'text', value: 'strings' },
					],
					shorthand: 'none',
					modifiers: [],
				},
			],
		});
	}
);

element('parses a tag with a directive an a directive value: unquoted', () => {
	//@ts-ignore
	const { parsed } = parseNode({
		generatePositions: false,
		childParser,
		value: `<input hello:world="cheese" />`,
	});

	assert.equal(parsed, <SvelteElement>{
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
	});
});

element('parses a tag with a directive with modifiers', () => {
	//@ts-ignore
	const { parsed } = parseNode({
		generatePositions: false,
		childParser,
		value: `<input hello:world|modifierval />`,
	});

	assert.equal(parsed, <SvelteElement>{
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
				modifiers: [{ type: 'modifier', value: 'modifierval' }],
			},
		],
	});
});

element('parses a tag with a directive with modifier but no value', () => {
	//@ts-ignore
	const { parsed } = parseNode({
		generatePositions: false,
		childParser,
		value: `<a on:click|preventDefault booleanAttribute/>`,
	});

	assert.equal(parsed, <SvelteElement>{
		type: 'svelteElement',
		tagName: 'a',
		selfClosing: true,
		children: [],
		properties: [
			{
				type: 'svelteDirective',
				name: 'on',
				specifier: 'click',
				value: [],
				shorthand: 'none',
				modifiers: [{ type: 'modifier', value: 'preventDefault' }],
			},
			{
				type: 'svelteProperty',
				name: 'booleanAttribute',
				value: [],
				shorthand: 'boolean',
				modifiers: [],
			},
		],
	});
});

element('parses a tag with a directive with multiple modifiers', () => {
	//@ts-ignore
	const { parsed } = parseNode({
		generatePositions: false,
		childParser,
		value: `<input hello:world|modifierval|modifierval2 />`,
	});

	assert.equal(parsed, <SvelteElement>{
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
	});
});

element('parses a tag with a directive with modifiers', () => {
	//@ts-ignore
	const { parsed } = parseNode({
		generatePositions: false,
		childParser,
		value: `<input hello|modifierval />`,
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
				value: [],
				shorthand: 'none',
				modifiers: [{ type: 'modifier', value: 'modifierval' }],
			},
		],
	});
});

element('parses a tag with a directive with multiple modifiers', () => {
	//@ts-ignore
	const { parsed } = parseNode({
		generatePositions: false,
		childParser,
		value: `<input hello|modifierval|modifierval2 />`,
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
				value: [],
				shorthand: 'none',
				modifiers: [
					{ type: 'modifier', value: 'modifierval' },
					{ type: 'modifier', value: 'modifierval2' },
				],
			},
		],
	});
});

element(
	'parses a tag with an attribute with multiple modifiers and a value',
	() => {
		//@ts-ignore
		const { parsed } = parseNode({
			generatePositions: false,
			childParser,
			value: `<input hello:world|modifierval|modifierval2=someval />`,
		});

		assert.equal(parsed, <SvelteElement>{
			type: 'svelteElement',
			tagName: 'input',
			selfClosing: true,
			children: [],
			properties: [
				{
					type: 'svelteDirective',
					name: 'hello',
					specifier: 'world',
					value: [{ type: 'text', value: 'someval' }],
					shorthand: 'none',
					modifiers: [
						{ type: 'modifier', value: 'modifierval' },
						{ type: 'modifier', value: 'modifierval2' },
					],
				},
			],
		});
	}
);

element(
	'parses a tag with an attribute with multiple modifiers and a value: weird spacing',
	() => {
		//@ts-ignore
		const { parsed } = parseNode({
			generatePositions: false,
			childParser,
			value: `<      input      hello:world|modifierval|modifierval2   =   someval    /    >`,
		});

		assert.equal(parsed, <SvelteElement>{
			type: 'svelteElement',
			tagName: 'input',
			selfClosing: true,
			children: [],
			properties: [
				{
					type: 'svelteDirective',
					name: 'hello',
					specifier: 'world',
					value: [{ type: 'text', value: 'someval' }],
					shorthand: 'none',
					modifiers: [
						{ type: 'modifier', value: 'modifierval' },
						{ type: 'modifier', value: 'modifierval2' },
					],
				},
			],
		});
	}
);

element(
	'parses a tag with an attribute with multiple modifiers and a value: weird spacing, double-quotes',
	() => {
		//@ts-ignore
		const { parsed } = parseNode({
			generatePositions: false,
			childParser,
			value: `<      input      hello:world|modifierval|modifierval2   =   "someval"    /    >`,
		});

		assert.equal(parsed, <SvelteElement>{
			type: 'svelteElement',
			tagName: 'input',
			selfClosing: true,
			children: [],
			properties: [
				{
					type: 'svelteDirective',
					name: 'hello',
					specifier: 'world',
					value: [{ type: 'text', value: 'someval' }],
					shorthand: 'none',
					modifiers: [
						{ type: 'modifier', value: 'modifierval' },
						{ type: 'modifier', value: 'modifierval2' },
					],
				},
			],
		});
	}
);

element(
	'parses a tag with an attribute with multiple modifiers and a value: weird spacing and newlines',
	() => {
		//@ts-ignore
		const { parsed } = parseNode({
			generatePositions: false,
			childParser,
			value: `<      
			input      
			
			hello:world|modifierval|modifierval2   
			=   
			"someval"    
			/    
			>`,
		});

		assert.equal(parsed, <SvelteElement>{
			type: 'svelteElement',
			tagName: 'input',
			selfClosing: true,
			children: [],
			properties: [
				{
					type: 'svelteDirective',
					name: 'hello',
					specifier: 'world',
					value: [{ type: 'text', value: 'someval' }],
					shorthand: 'none',
					modifiers: [
						{ type: 'modifier', value: 'modifierval' },
						{ type: 'modifier', value: 'modifierval2' },
					],
				},
			],
		});
	}
);

element('parses text', () => {
	//@ts-ignore
	const { parsed } = parseNode({
		generatePositions: false,
		childParser,
		value: `hail`,
	});

	assert.equal(parsed, <Text>{
		type: 'text',
		value: 'hail',
	});
});

element('parses quoted attribute expressions with space', () => {
	//@ts-ignore
	const { parsed } = parseNode({
		generatePositions: false,
		childParser,
		value: `<button disabled="{!first || !last}" />`,
	});

	assert.equal(parsed, <SvelteElement>{
		type: 'svelteElement',
		tagName: 'button',
		properties: [
			{
				type: 'svelteProperty',
				name: 'disabled',
				value: [
					{
						type: 'svelteDynamicContent',
						expression: {
							type: 'svelteExpression',
							value: '!first || !last',
						},
					},
				],
				shorthand: 'none',
				modifiers: [],
			},
		],
		selfClosing: true,
		children: [],
	});
});

element('parses svelte special elements', () => {
	//@ts-ignore
	const { parsed } = parseNode({
		generatePositions: false,
		childParser,
		value: `<svelte:options tag={null} />`,
	});

	assert.equal(parsed, <SvelteMeta>{
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
	});
});

element('parses svelte special elements', () => {
	//@ts-ignore
	const { parsed } = parseNode({
		generatePositions: false,
		childParser,
		value: `<svelte:options tag={null} />`,
	});

	assert.equal(parsed, <SvelteMeta>{
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
	});
});

element('parses html comments: no spaces', () => {
	//@ts-ignore
	const { parsed } = parseNode({
		generatePositions: false,
		childParser,
		value: `<!--comment text-->`,
	});

	assert.equal(parsed, <Comment>{
		type: 'comment',
		value: 'comment text',
	});
});

element('parses html comments: spaces and newlines', () => {
	//@ts-ignore
	const { parsed } = parseNode({
		generatePositions: false,
		childParser,
		value: `<!--


		comment text  
		
		
-->`,
	});

	assert.equal(parsed, <Comment>{
		type: 'comment',
		value: '\n\n\n\t\tcomment text  \n\t\t\n\t\t\n',
	});
});

//

element('parses shorthand expressions: failing test case', () => {
	//@ts-ignore
	const { parsed } = parseNode({
		generatePositions: false,
		childParser,
		value: `<Avatar alt="{initials}" {size}></Avatar>`,
	});

	assert.equal(parsed, {
		type: 'svelteComponent',
		tagName: 'Avatar',
		properties: [
			{
				type: 'svelteProperty',
				name: 'alt',
				modifiers: [],
				shorthand: 'none',
				value: [
					{
						type: 'svelteDynamicContent',
						expression: {
							type: 'svelteExpression',
							value: 'initials',
						},
					},
				],
			},
			{
				type: 'svelteProperty',
				name: 'size',
				modifiers: [],
				shorthand: 'expression',
				value: [
					{
						type: 'svelteDynamicContent',
						expression: {
							type: 'svelteExpression',
							value: 'size',
						},
					},
				],
			},
		],
		children: [{ type: 'fake' }],
		selfClosing: false,
	});
});

element.run();
